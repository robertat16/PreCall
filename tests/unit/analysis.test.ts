import { describe, expect, it } from 'vitest';
import { analyzeEchoLeak, analyzeMicTest, classifyBandwidth, detectClicks } from '../../src/audio/analysis';
import { fft, welch } from '../../src/audio/dsp';
import { add, lowpass, pseudoSpeech, sine, whiteNoise } from './signals';

const SR = 48000;

function room(seconds: number, rms = 0.0003, seed = 21) {
  return lowpass(whiteNoise(Math.round(seconds * SR), rms, seed), SR, 16000);
}

describe('dsp', () => {
  it('fft finds a pure tone', () => {
    const n = 1024;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 64 * i) / n);
    fft(re, im);
    let best = 0;
    for (let k = 1; k < n / 2; k++) if (Math.hypot(re[k], im[k]) > Math.hypot(re[best], im[best])) best = k;
    expect(best).toBe(64);
  });

  it('welch power of a sine is ~A^2/2', () => {
    const x = sine(SR, SR, 1000, 0.5);
    const { psd } = welch(x, 4096);
    const total = psd.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0.1);
    expect(total).toBeLessThan(0.14);
  });
});

describe('mic analysis', () => {
  const quiet = room(3);
  const speechClean = add(pseudoSpeech(8, SR, 0.06), room(8, 0.0003, 22));

  it('rates a clean full-band mic highly', () => {
    const r = analyzeMicTest({ quiet, speech: speechClean, sampleRate: SR });
    expect(r.voiceDetected).toBe(true);
    expect(r.bandwidthClass === 'fullband' || r.bandwidthClass === 'superwideband').toBe(true);
    expect(r.noiseFloorDb).toBeLessThan(-60);
    expect(r.snrDb).toBeGreaterThan(30);
    expect(r.clipPercent).toBe(0);
    expect(r.humHz).toBeNull();
    expect(r.dropouts).toBe(0);
    expect(r.tone.label).toBe('Balanced');
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.grade).toBe('Excellent');
  });

  it('detects Bluetooth-style narrowband audio', () => {
    const nb = lowpass(speechClean, SR, 3600);
    const r = analyzeMicTest({ quiet: lowpass(quiet, SR, 3600), speech: nb, sampleRate: SR });
    expect(r.bandwidthClass).toBe('narrowband');
    expect(r.bandwidthHz).toBeLessThan(5000);
    expect(r.score).toBeLessThanOrEqual(66);
    expect(r.metrics.find((m) => m.id === 'clarity')!.status).toBe('poor');
  });

  it('detects wideband (16 kHz sampled) audio', () => {
    const wb = lowpass(speechClean, SR, 7600);
    const r = analyzeMicTest({ quiet: lowpass(quiet, SR, 7600), speech: wb, sampleRate: SR });
    expect(r.bandwidthClass).toBe('wideband');
  });

  it('detects clipping', () => {
    const loud = pseudoSpeech(8, SR, 0.5).map((v) => Math.max(-1, Math.min(1, v * 2.2)));
    const r = analyzeMicTest({ quiet, speech: loud, sampleRate: SR });
    expect(r.clipPercent).toBeGreaterThan(0.1);
    expect(['fair', 'poor']).toContain(r.metrics.find((m) => m.id === 'clipping')!.status);
  });

  it('detects heavy background noise and low SNR', () => {
    const noisy = room(3, 0.03, 5);
    const speech = add(pseudoSpeech(8, SR, 0.06), room(8, 0.03, 6));
    const r = analyzeMicTest({ quiet: noisy, speech, sampleRate: SR });
    expect(r.noiseFloorDb).toBeGreaterThan(-35);
    expect(r.metrics.find((m) => m.id === 'noise')!.status).toBe('poor');
    expect(r.score).toBeLessThan(70);
  });

  it('detects 60 Hz mains hum', () => {
    const n = quiet.length;
    const humQuiet = add(add(quiet, sine(n, SR, 60, 0.01)), sine(n, SR, 120, 0.004));
    const r = analyzeMicTest({ quiet: humQuiet, speech: speechClean, sampleRate: SR });
    expect(r.humHz).toBe(60);
  });

  it('detects 50 Hz mains hum', () => {
    const n = quiet.length;
    const humQuiet = add(add(quiet, sine(n, SR, 50, 0.01)), sine(n, SR, 150, 0.003));
    const r = analyzeMicTest({ quiet: humQuiet, speech: speechClean, sampleRate: SR });
    expect(r.humHz).toBe(50);
  });

  it('detects crackle', () => {
    const crackly = Float32Array.from(quiet);
    for (let i = 5000; i < crackly.length; i += 9000) crackly[i] += 0.3;
    expect(detectClicks(crackly, SR)).toBeGreaterThan(2);
    expect(detectClicks(quiet, SR)).toBeLessThan(0.2);
  });

  it('detects mid-speech dropouts', () => {
    const s = Float32Array.from(speechClean);
    // find active regions and zero 25ms chunks inside speech
    let made = 0;
    for (let i = SR; i < s.length - SR && made < 4; i += Math.round(SR * 1.3)) {
      // only drop where there is signal around
      let e = 0;
      for (let j = i - 2000; j < i + 2000; j++) e += Math.abs(s[j]);
      if (e / 4000 < 0.01) continue;
      s.fill(0, i, i + Math.round(SR * 0.025));
      made++;
    }
    const r = analyzeMicTest({ quiet, speech: s, sampleRate: SR });
    expect(made).toBeGreaterThanOrEqual(2);
    expect(r.dropouts).toBeGreaterThanOrEqual(2);
  });

  it('reports no voice when only noise was recorded', () => {
    const r = analyzeMicTest({ quiet, speech: room(8, 0.0003, 99), sampleRate: SR });
    expect(r.voiceDetected).toBe(false);
    expect(r.score).toBeLessThanOrEqual(25);
    expect(r.headline).toMatch(/couldn/);
  });

  it('flags muffled tone', () => {
    const muff = (() => {
      // gentle high cut starting around 1 kHz, still "fullband" energy left
      const x = speechClean;
      return lowpass(x, SR, 20000).map((v) => v); // placeholder copy
    })();
    // apply a -12 dB/oct slope above 1 kHz
    const shaped = (() => {
      return lowpassSlope(muff, SR);
    })();
    const r = analyzeMicTest({ quiet, speech: shaped, sampleRate: SR });
    expect(r.tone.label.startsWith('Muffled')).toBe(true);
  });

  it('handles 16 kHz sample rate input', () => {
    const sr = 16000;
    const q = whiteNoise(sr * 3, 0.0003, 4);
    const s = add(pseudoSpeech(8, sr, 0.06), whiteNoise(sr * 8, 0.0003, 5));
    const r = analyzeMicTest({ quiet: q, speech: s, sampleRate: sr });
    expect(r.voiceDetected).toBe(true);
    expect(r.bandwidthClass).toBe('wideband');
    expect(Number.isFinite(r.score)).toBe(true);
  });

  it('survives empty input', () => {
    const r = analyzeMicTest({ quiet: new Float32Array(0), speech: new Float32Array(0), sampleRate: SR });
    expect(r.voiceDetected).toBe(false);
    expect(Number.isFinite(r.score)).toBe(true);
  });
});

import { shape } from './signals';
function lowpassSlope(x: Float32Array, sr: number) {
  return shape(x, sr, (f) => (f <= 900 ? 1 : Math.pow(900 / f, 2.2)));
}

describe('classification', () => {
  it('bandwidth classes', () => {
    expect(classifyBandwidth(3400)).toBe('narrowband');
    expect(classifyBandwidth(7000)).toBe('wideband');
    expect(classifyBandwidth(12000)).toBe('superwideband');
    expect(classifyBandwidth(19000)).toBe('fullband');
  });
});

describe('echo leak', () => {
  it('no leak with headphones', () => {
    const b = room(1);
    const d = room(1, 0.0003, 9);
    expect(analyzeEchoLeak(b, d, SR).status).toBe('great');
  });
  it('strong leak on speaker', () => {
    const b = room(1);
    const d = add(room(1, 0.0003, 9), sine(SR, SR, 1500, 0.05));
    const r = analyzeEchoLeak(b, d, SR);
    expect(r.leakDb).toBeGreaterThan(18);
    expect(r.status).toBe('fair');
  });
});
