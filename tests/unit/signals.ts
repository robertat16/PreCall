import { fft, nextPow2 } from '../../src/audio/dsp';
import { LTASS } from '../../src/audio/analysis';

/** Deterministic PRNG so tests are reproducible. */
export function rng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function gaussian(r: () => number): number {
  const u = Math.max(r(), 1e-12);
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function whiteNoise(n: number, rmsAmp: number, seed = 7): Float32Array {
  const r = rng(seed);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = gaussian(r) * rmsAmp;
  return x;
}

/** Shape a signal's spectrum with gain(f) (linear amplitude) using one big FFT. */
export function shape(x: Float32Array, sr: number, gain: (f: number) => number): Float32Array {
  const n = nextPow2(x.length);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < x.length; i++) re[i] = x[i];
  fft(re, im);
  for (let k = 0; k < n; k++) {
    const kk = k <= n / 2 ? k : n - k;
    const g = gain((kk * sr) / n);
    re[k] *= g;
    im[k] *= g;
  }
  // inverse via conjugate trick
  for (let k = 0; k < n; k++) im[k] = -im[k];
  fft(re, im);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = re[i] / n;
  return out;
}

function ltassGain(f: number): number {
  if (f < 70) return 0.05;
  // interpolate LTASS third-octave levels (dB per band) -> per-Hz density: subtract 10log10(bandwidth)
  const pts = LTASS.map(([fc, db]) => [fc, db - 10 * Math.log10(fc * 0.2316)] as [number, number]);
  let db: number;
  if (f <= pts[0][0]) db = pts[0][1];
  else if (f >= pts[pts.length - 1][0]) {
    const [fl, dl] = pts[pts.length - 1];
    db = dl - 6 * Math.log2(f / fl) - 3 * Math.log2(f / fl);
  } else {
    let i = 0;
    while (pts[i + 1][0] < f) i++;
    const [f1, d1] = pts[i];
    const [f2, d2] = pts[i + 1];
    const t = Math.log(f / f1) / Math.log(f2 / f1);
    db = d1 + (d2 - d1) * t;
  }
  return Math.pow(10, (db - 30) / 20);
}

/**
 * Speech-like test signal: LTASS-shaped noise with syllabic (~4 Hz) on/off envelope.
 * `levelRms` is the RMS during active portions.
 */
export function pseudoSpeech(seconds: number, sr: number, levelRms = 0.08, seed = 3): Float32Array {
  const n = Math.round(seconds * sr);
  let x = shape(whiteNoise(n, 1, seed), sr, ltassGain);
  // normalise
  let s = 0;
  for (let i = 0; i < n; i++) s += x[i] * x[i];
  const k = levelRms / Math.sqrt(s / n);
  const r = rng(seed + 11);
  // syllable envelope: 180ms on, 70ms off with random variation; pauses every ~2s
  const env = new Float32Array(n);
  let i = 0;
  while (i < n) {
    const on = Math.round(sr * (0.14 + r() * 0.12));
    const off = Math.round(sr * (r() < 0.12 ? 0.35 : 0.05 + r() * 0.05));
    for (let j = 0; j < on && i < n; j++, i++) env[i] = Math.sin((Math.PI * j) / on) ** 0.5;
    for (let j = 0; j < off && i < n; j++, i++) env[i] = 0;
  }
  x = x.map((v, idx) => v * k * env[idx] * 1.25);
  return x;
}

export function add(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(Math.min(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = a[i] + b[i];
  return out;
}

export function sine(n: number, sr: number, f: number, amp: number): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * f * i) / sr);
  return x;
}

export function lowpass(x: Float32Array, sr: number, fc: number): Float32Array {
  return shape(x, sr, (f) => (f <= fc ? 1 : f < fc * 1.08 ? 0.001 : 1e-5));
}
