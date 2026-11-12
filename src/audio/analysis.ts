import {
  ampToDb,
  bandMean,
  bandPower,
  binFreq,
  dbToPow,
  frameRmsDb,
  meanDb,
  median,
  powToDb,
  removeDc,
  spectralFlatness,
  welch,
} from './dsp';

export type Status = 'great' | 'good' | 'fair' | 'poor';

export interface Metric {
  id: string;
  label: string;
  value: string;
  status: Status;
  detail: string;
  tip?: string;
}

export type BandwidthClass = 'narrowband' | 'wideband' | 'superwideband' | 'fullband';

export interface ToneBalance {
  bassDb: number;
  midDb: number;
  trebleDb: number;
  label: string;
}

export interface SpectrumPoint {
  f: number;
  speechDb: number;
  noiseDb: number;
}

export interface MicReport {
  voiceDetected: boolean;
  score: number;
  grade: string;
  headline: string;
  summary: string;
  metrics: Metric[];
  speechLevelDb: number;
  peakDb: number;
  noiseFloorDb: number;
  snrDb: number;
  bandwidthHz: number;
  bandwidthClass: BandwidthClass;
  tone: ToneBalance;
  humHz: number | null;
  clicksPerSec: number;
  dropouts: number;
  clipPercent: number;
  spectrum: SpectrumPoint[];
  sampleRate: number;
}

export interface AnalysisInput {
  /** Recording taken while the user stays silent (room/mic noise). */
  quiet: Float32Array;
  /** Recording taken while the user reads the prompt aloud. */
  speech: Float32Array;
  sampleRate: number;
}

const FRAME_MS = 20;

/** Byrne et al. (1994)-style long-term average speech spectrum, 1/3-octave levels (relative dB). */
export const LTASS: ReadonlyArray<[number, number]> = [
  [100, 53], [125, 56], [160, 57], [200, 57], [250, 58], [315, 58], [400, 57], [500, 57],
  [630, 55], [800, 53], [1000, 51], [1250, 49], [1600, 48], [2000, 47], [2500, 46],
  [3150, 45], [4000, 44], [5000, 43], [6300, 42],
];

export function gradeFor(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Poor';
  return 'Bad';
}

export function statusFor(score: number): Status {
  if (score >= 90) return 'great';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  return 'poor';
}

export function formatDb(db: number): string {
  if (!isFinite(db)) return '—';
  return `${db >= 0 ? '+' : ''}${db.toFixed(0)} dB`;
}

function formatHz(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz` : `${Math.round(hz)} Hz`;
}

/** Third-octave band power between f/2^(1/6) and f*2^(1/6). */
function thirdOctave(psd: Float64Array, f: number, n: number, sr: number): number {
  const k = Math.pow(2, 1 / 6);
  return bandPower(psd, f / k, f * k, n, sr);
}

export function estimateBandwidth(
  speechPsd: Float64Array,
  fftSize: number,
  sr: number,
): number {
  const ref = powToDb(bandMean(speechPsd, 300, 3000, fftSize, sr));
  const nyq = sr / 2;
  const top = Math.min(nyq * 0.97, 20000);
  // Walk upward in 1/6-octave steps; bandwidth is the last band above threshold
  // before the spectrum falls off a cliff and stays down.
  const step = Math.pow(2, 1 / 6);
  let lastGood = 3000;
  let misses = 0;
  for (let f = 3000; f * step <= top; f *= step) {
    const d = powToDb(bandMean(speechPsd, f, f * step, fftSize, sr));
    if (d > ref - 50) {
      lastGood = f * step;
      misses = 0;
    } else if (++misses >= 3) {
      break;
    }
  }
  return Math.min(lastGood, top);
}

export function classifyBandwidth(hz: number): BandwidthClass {
  if (hz < 5000) return 'narrowband';
  if (hz < 9500) return 'wideband';
  if (hz < 14500) return 'superwideband';
  return 'fullband';
}

export function analyzeToneBalance(
  speechPsd: Float64Array,
  noisePsd: Float64Array | null,
  fftSize: number,
  sr: number,
  bandwidthHz: number,
): ToneBalance {
  const devs: Array<[number, number]> = [];
  for (const [f, ref] of LTASS) {
    if (f * 1.12 > sr / 2) break;
    let p = thirdOctave(speechPsd, f, fftSize, sr);
    if (noisePsd) p = Math.max(p - thirdOctave(noisePsd, f, fftSize, sr), p * 0.05);
    devs.push([f, powToDb(p) - ref]);
  }
  const mids = devs.filter(([f]) => f >= 400 && f <= 1600).map(([, d]) => d);
  const midRef = mids.length ? median(mids) : 0;
  const avg = (lo: number, hi: number) => {
    const v = devs.filter(([f]) => f >= lo && f <= hi).map(([, d]) => d - midRef);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const bassDb = avg(100, 250);
  const midDb = 0;
  // Treble is judged within the band the mic actually delivers, capped at 5 kHz.
  const trebleTop = Math.min(5000, Math.max(2000, bandwidthHz * 0.9));
  const trebleDb = avg(2000, trebleTop) + (bandwidthHz < 5000 ? -6 : 0);

  let label = 'Balanced';
  if (trebleDb < -9 && bassDb > 4) label = 'Muffled & boomy';
  else if (trebleDb < -9) label = 'Muffled';
  else if (bassDb > 7) label = 'Boomy';
  else if (bassDb < -11) label = trebleDb > 5 ? 'Thin & harsh' : 'Thin';
  else if (trebleDb > 7) label = 'Harsh';
  return { bassDb, midDb, trebleDb, label };
}

/** Detect mains hum (50/60 Hz family) in the noise spectrum. */
export function detectHum(
  noisePsd: Float64Array,
  fftSize: number,
  sr: number,
): { hz: number | null; levelDb: number; prominenceDb: number } {
  let best = { hz: null as number | null, levelDb: -Infinity, prominenceDb: 0 };
  for (const base of [50, 60]) {
    let promSum = 0;
    let levelPow = 0;
    let counted = 0;
    for (const h of [1, 2, 3]) {
      const f = base * h;
      const peak = bandPower(noisePsd, f - 3, f + 3, fftSize, sr);
      const peakDensity = bandMean(noisePsd, f - 3, f + 3, fftSize, sr);
      const side = (bandMean(noisePsd, f - 22, f - 9, fftSize, sr) + bandMean(noisePsd, f + 9, f + 22, fftSize, sr)) / 2;
      const prom = powToDb(peakDensity) - powToDb(side);
      promSum += Math.max(0, prom);
      levelPow += peak;
      counted++;
    }
    const prominenceDb = promSum / counted;
    const levelDb = powToDb(levelPow);
    if (prominenceDb > best.prominenceDb) best = { hz: base, levelDb, prominenceDb };
  }
  if (best.prominenceDb < 10 || best.levelDb < -72) return { hz: null, levelDb: best.levelDb, prominenceDb: best.prominenceDb };
  return best;
}

/** Count impulsive clicks/crackles per second (sharp sample-to-sample jumps far above local behaviour). */
export function detectClicks(x: Float32Array, sr: number): number {
  if (x.length < sr * 0.2) return 0;
  const win = Math.max(32, Math.round(sr * 0.01));
  const d = new Float32Array(x.length);
  for (let i = 1; i < x.length; i++) d[i] = Math.abs(x[i] - x[i - 1]);
  let clicks = 0;
  let lastClick = -Infinity;
  const refractory = Math.round(sr * 0.005);
  for (let start = 0; start + win <= d.length; start += win) {
    // local robust scale from a wider neighbourhood
    const a = Math.max(0, start - win * 2);
    const b = Math.min(d.length, start + win * 3);
    const slice = d.slice(a, b).sort();
    const scale = slice[Math.floor(0.75 * (slice.length - 1))] + 1e-7;
    for (let i = start; i < start + win; i++) {
      if (d[i] > 0.02 && d[i] > scale * 25 && i - lastClick > refractory) {
        clicks++;
        lastClick = i;
      }
    }
  }
  return clicks / (x.length / sr);
}

/** Runs of exact digital silence surrounded by speech (packet loss / Bluetooth glitches). */
export function detectDropouts(x: Float32Array, sr: number, activeFrames: Uint8Array, frameLen: number): number {
  const minRun = Math.round(sr * 0.006);
  let count = 0;
  let run = 0;
  for (let i = 0; i <= x.length; i++) {
    const silent = i < x.length && Math.abs(x[i]) < 1e-6;
    if (silent) {
      run++;
    } else {
      if (run >= minRun && run < sr * 0.4) {
        const startFrame = Math.floor((i - run) / frameLen);
        const endFrame = Math.floor(i / frameLen);
        const look = Math.round(120 / FRAME_MS);
        let before = false;
        let after = false;
        for (let f = Math.max(0, startFrame - look); f < startFrame; f++) if (activeFrames[f]) before = true;
        for (let f = endFrame + 1; f <= Math.min(activeFrames.length - 1, endFrame + look); f++) if (activeFrames[f]) after = true;
        if (before && after) count++;
      }
      run = 0;
    }
  }
  return count;
}

function spectrumCurve(speech: Float64Array, noise: Float64Array, fftSize: number, sr: number): SpectrumPoint[] {
  const pts: SpectrumPoint[] = [];
  const top = Math.min(sr / 2 * 0.97, 20000);
  const step = Math.pow(2, 1 / 6);
  for (let f = 60; f * step <= top; f *= step) {
    pts.push({
      f: Math.sqrt(f * f * step),
      speechDb: powToDb(bandMean(speech, f, f * step, fftSize, sr)),
      noiseDb: powToDb(bandMean(noise, f, f * step, fftSize, sr)),
    });
  }
  return pts;
}

export function analyzeMicTest(input: AnalysisInput): MicReport {
  const { sampleRate: sr } = input;
  const frameLen = Math.round((sr * FRAME_MS) / 1000);

  // --- levels -------------------------------------------------------------
  let dcSum = 0;
  for (let i = 0; i < input.speech.length; i++) dcSum += input.speech[i];
  const dcOffset = input.speech.length ? dcSum / input.speech.length : 0;

  const quiet = removeDc(input.quiet, sr);
  const speech = removeDc(input.speech, sr);

  const settle = Math.round(250 / FRAME_MS);
  const quietFramesAll = frameRmsDb(quiet, frameLen);
  const quietFrames = quietFramesAll.length > settle * 2 ? quietFramesAll.subarray(settle) : quietFramesAll;
  const noiseFloorDb = quietFrames.length ? Math.max(-120, median(quietFrames)) : -120;

  const speechFrames = frameRmsDb(speech, frameLen);
  const thresh = Math.max(noiseFloorDb + 9, -62);
  const active = new Uint8Array(speechFrames.length);
  const activeDb: number[] = [];
  for (let f = 0; f < speechFrames.length; f++) {
    if (speechFrames[f] > thresh) {
      active[f] = 1;
      activeDb.push(speechFrames[f]);
    }
  }
  const activeRatio = speechFrames.length ? activeDb.length / speechFrames.length : 0;
  const speechLevelDb = activeDb.length ? meanDb(activeDb) : -Infinity;

  let peak = 0;
  let clipped = 0;
  for (let i = 0; i < input.speech.length; i++) {
    const a = Math.abs(input.speech[i]);
    if (a > peak) peak = a;
    if (a >= 0.985) clipped++;
  }
  const peakDb = ampToDb(peak);
  const clipPercent = input.speech.length ? (clipped / input.speech.length) * 100 : 0;
  const snrDb = speechLevelDb - noiseFloorDb;

  const voiceDetected = activeRatio >= 0.12 && activeDb.length * FRAME_MS >= 700 && snrDb >= 6;

  // --- spectra ------------------------------------------------------------
  const fftSize = sr > 32000 ? 8192 : 4096;
  const keepActive = (s: number, e: number) => {
    let n = 0;
    let t = 0;
    for (let f = Math.floor(s / frameLen); f < Math.min(active.length, Math.ceil(e / frameLen)); f++) {
      t++;
      n += active[f];
    }
    return t > 0 && n / t >= 0.5;
  };
  let speechSpec = welch(speech, fftSize, keepActive);
  if (speechSpec.segments === 0) speechSpec = welch(speech, fftSize);
  const noiseSpec = welch(quiet.length >= fftSize ? quiet : speech, fftSize);
  const speechPsd = speechSpec.psd;
  const noisePsd = noiseSpec.psd;

  const bandwidthHz = estimateBandwidth(speechPsd, fftSize, sr);
  const bandwidthClass = classifyBandwidth(bandwidthHz);
  const tone = analyzeToneBalance(speechPsd, noisePsd, fftSize, sr, bandwidthHz);
  const hum = detectHum(noisePsd, fftSize, sr);
  const clicksPerSec = detectClicks(quiet, sr);
  const dropouts = detectDropouts(input.speech, sr, active, frameLen);

  const lowShare = bandPower(noisePsd, 20, 300, fftSize, sr) / Math.max(1e-20, bandPower(noisePsd, 20, sr / 2, fftSize, sr));
  const hissFlat = spectralFlatness(noisePsd, 2000, Math.min(8000, sr / 2 * 0.95), fftSize, sr);
  const hissLevel = powToDb(bandPower(noisePsd, 2000, Math.min(8000, sr / 2 * 0.95), fftSize, sr));

  // --- metrics & scoring ---------------------------------------------------
  const metrics: Metric[] = [];
  const issues: Array<{ weight: number; text: string }> = [];
  let score = 100;

  // Voice level
  {
    let status: Status = 'great';
    let pen = 0;
    let detail = 'Your voice comes through at a healthy, consistent level.';
    let tip: string | undefined;
    if (!voiceDetected) {
      status = 'poor';
      detail = 'We could barely hear you over the background.';
      tip = 'Check the mic isn’t muted, move it closer to your mouth, or pick another input.';
    } else if (speechLevelDb < -45) {
      status = 'poor'; pen = 28; detail = 'Your voice is very quiet.';
      tip = 'Move the mic closer (2–4 finger widths from your mouth) or raise the input volume.';
    } else if (speechLevelDb < -36) {
      status = 'fair'; pen = 14; detail = 'Your voice is on the quiet side. Most call apps will boost it, along with the noise.';
      tip = 'Bring the mic a little closer to your mouth.';
    } else if (speechLevelDb < -30) {
      status = 'good'; pen = 4; detail = 'A little quiet, but call apps will handle it fine.';
    } else if (speechLevelDb > -10 || peakDb > -0.5) {
      status = 'fair'; pen = 8; detail = 'Your voice is very hot and close to the maximum level.';
      tip = 'Move the mic slightly away from your mouth or turn the input gain down.';
    }
    score -= pen;
    if (pen >= 8 || !voiceDetected) issues.push({ weight: pen || 50, text: detail });
    const word = !voiceDetected ? 'Not heard' : speechLevelDb < -45 ? 'Very quiet' : speechLevelDb < -36 ? 'Quiet' : speechLevelDb < -30 ? 'A bit quiet' : status === 'fair' ? 'Very loud' : 'Healthy';
    metrics.push({ id: 'level', label: 'Voice level', value: isFinite(speechLevelDb) && voiceDetected ? `${word} · ${speechLevelDb.toFixed(0)} dB` : word, status, detail, tip });
  }

  // Distortion / clipping
  {
    let status: Status = 'great';
    let pen = 0;
    let detail = 'No clipping. Your loudest moments stay clean.';
    let tip: string | undefined;
    if (clipPercent > 1) {
      status = 'poor'; pen = 28; detail = 'Heavy clipping. Loud words will sound crunchy and distorted.';
      tip = 'Lower the input volume or move the mic away from your mouth.';
    } else if (clipPercent > 0.1) {
      status = 'fair'; pen = 14; detail = 'Some clipping on loud syllables.';
      tip = 'Back the mic off slightly, or angle it so you don’t breathe straight into it.';
    } else if (clipPercent > 0.005) {
      status = 'good'; pen = 4; detail = 'Occasional peaks touch the maximum level.';
    }
    score -= pen;
    if (pen >= 14) issues.push({ weight: pen, text: detail });
    metrics.push({ id: 'clipping', label: 'Distortion', value: clipPercent > 0.005 ? `${clipPercent.toFixed(2)}% clipped` : 'Clean', status, detail, tip });
  }

  // Background noise + SNR (combined penalty so they don't double count)
  {
    let noisePen = 0;
    let nStatus: Status = 'great';
    let character = lowShare > 0.6 ? 'low rumble (fan, traffic or wind)' : hissFlat > 0.45 && hissLevel > -70 ? 'steady hiss' : 'room noise';
    if (noiseFloorDb <= -100) character = 'digital silence (noise gate active)';
    let nDetail = 'Very quiet background. Great.';
    let nTip: string | undefined;
    if (noiseFloorDb > -35) {
      nStatus = 'poor'; noisePen = 24; nDetail = `Loud background noise: ${character}.`;
      nTip = 'Find a quieter spot, close windows, or turn on noise suppression in your call app.';
    } else if (noiseFloorDb > -45) {
      nStatus = 'fair'; noisePen = 13; nDetail = `Noticeable background noise: ${character}.`;
      nTip = 'Turn off fans, or use a headset with a mic boom close to your mouth.';
    } else if (noiseFloorDb > -55) {
      nStatus = 'good'; noisePen = 5; nDetail = `A little ${character}. Barely noticeable on calls.`;
    }

    let snrPen = 0;
    let sStatus: Status = 'great';
    let sDetail = 'Your voice stands well clear of the background.';
    let sTip: string | undefined;
    if (!voiceDetected) {
      sStatus = 'poor'; sDetail = 'Your voice wasn’t clearly louder than the background.';
    } else if (snrDb < 10) {
      sStatus = 'poor'; snrPen = 24; sDetail = 'Your voice is barely louder than the background. Listeners will struggle.';
      sTip = 'Get the mic closer to your mouth. That improves this more than anything else.';
    } else if (snrDb < 18) {
      sStatus = 'fair'; snrPen = 13; sDetail = 'Background noise competes with your voice.';
      sTip = 'Move the mic closer or reduce the noise around you.';
    } else if (snrDb < 25) {
      sStatus = 'good'; snrPen = 5; sDetail = 'Good separation between your voice and the background.';
    }
    const pen = Math.max(noisePen, snrPen) + 0.35 * Math.min(noisePen, snrPen);
    score -= pen;
    if (noisePen >= 13) issues.push({ weight: noisePen, text: nDetail });
    if (snrPen >= 13) issues.push({ weight: snrPen, text: sDetail });
    const nWord = nStatus === 'great' ? 'Very quiet' : nStatus === 'good' ? 'Low' : nStatus === 'fair' ? 'Noticeable' : 'Loud';
    const sWord = sStatus === 'great' ? 'Excellent' : sStatus === 'good' ? 'Good' : sStatus === 'fair' ? 'Weak' : 'Poor';
    metrics.push({ id: 'noise', label: 'Background noise', value: noiseFloorDb <= -100 ? 'Silent' : `${nWord} · ${noiseFloorDb.toFixed(0)} dB`, status: nStatus, detail: nDetail, tip: nTip });
    metrics.push({ id: 'snr', label: 'Voice vs. noise', value: voiceDetected && isFinite(snrDb) ? `${sWord} · ${snrDb.toFixed(0)} dB` : '—', status: sStatus, detail: sDetail, tip: sTip });
  }

  // Bandwidth / clarity
  {
    const map: Record<BandwidthClass, { status: Status; pen: number; value: string; detail: string; tip?: string }> = {
      narrowband: {
        status: 'poor', pen: 24, value: `Phone-line · ${formatHz(bandwidthHz)}`,
        detail: 'Old-phone-line quality. This usually means a Bluetooth headset has dropped into its low-quality “hands-free” mic mode.',
        tip: 'Bluetooth headsets often sound like this when the mic is in use. Try a wired headset or USB mic, a headset with LE Audio or a USB dongle, or the phone’s built-in mic.',
      },
      wideband: {
        status: 'good', pen: 7, value: `HD voice · ${formatHz(bandwidthHz)}`,
        detail: 'Clear “HD voice” quality, typical of good Bluetooth headsets.',
      },
      superwideband: {
        status: 'great', pen: 2, value: `Crisp · ${formatHz(bandwidthHz)}`,
        detail: 'Crisp and detailed. Better than most call apps will even transmit.',
      },
      fullband: {
        status: 'great', pen: 0, value: `Full range · ${formatHz(bandwidthHz)}`,
        detail: 'Studio-grade frequency range. Nothing is being cut off.',
      },
    };
    const m = map[bandwidthClass];
    if (voiceDetected) {
      score -= m.pen;
      if (m.pen >= 20) issues.push({ weight: m.pen, text: 'Your mic sounds like an old phone line (narrowband audio).' });
    }
    metrics.push({ id: 'clarity', label: 'Clarity', value: voiceDetected ? m.value : '—', status: voiceDetected ? m.status : 'fair', detail: voiceDetected ? m.detail : 'Needs a voice sample to measure.', tip: voiceDetected ? m.tip : undefined });
  }

  // Tone balance
  {
    let status: Status = 'great';
    let pen = 0;
    let detail = 'Natural, balanced tone. Bass and treble both sit where they should.';
    let tip: string | undefined;
    const l = tone.label;
    if (!voiceDetected) {
      status = 'fair'; detail = 'Needs a voice sample to measure.';
    } else if (l !== 'Balanced') {
      const severe = Math.abs(tone.bassDb) > 14 || tone.trebleDb < -15 || tone.trebleDb > 12;
      status = severe ? 'poor' : 'fair';
      pen = bandwidthClass === 'narrowband' && l.startsWith('Muffled') ? 0 : severe ? 12 : 6;
      const reasons: Record<string, [string, string]> = {
        'Muffled': ['Your voice sounds dull and muffled. Consonants are softened.', 'Make sure nothing (hair, collar, a case) is covering the mic, and point it toward your mouth.'],
        'Muffled & boomy': ['Muffled and boomy, like talking through a pillow.', 'Uncover the mic and move it slightly away from your mouth.'],
        'Boomy': ['Extra bass makes your voice boomy (often from being too close).', 'Move the mic a little farther from your mouth.'],
        'Thin': ['Thin and tinny. Low tones are missing.', 'Common with tiny earbud mics. A boom or USB mic will sound fuller.'],
        'Thin & harsh': ['Thin and harsh. Highs are exaggerated and lows are missing.', 'Try another mic, or lower the mic’s “enhancement” settings if it has any.'],
        'Harsh': ['Bright and harsh. “S” sounds may hiss.', 'Angle the mic slightly off to the side of your mouth.'],
      };
      [detail, tip] = reasons[l] ?? [detail, undefined];
    }
    score -= pen;
    if (pen >= 12) issues.push({ weight: pen, text: detail });
    metrics.push({ id: 'tone', label: 'Tone balance', value: voiceDetected ? tone.label : '—', status, detail, tip });
  }

  // Hum
  {
    let status: Status = 'great';
    let pen = 0;
    let detail = 'No electrical hum detected.';
    let tip: string | undefined;
    if (hum.hz) {
      const rel = isFinite(speechLevelDb) ? speechLevelDb - hum.levelDb : 0;
      if (rel < 25) { status = 'poor'; pen = 16; } else { status = 'fair'; pen = 7; }
      detail = `Electrical hum at ${hum.hz} Hz${hum.hz === 60 ? ' (North American mains)' : ' (mains power)'}.`;
      tip = 'Often from a charger, a ground loop, or a nearby power supply. Unplug the charger and try again.';
    }
    score -= pen;
    if (pen >= 7) issues.push({ weight: pen, text: detail });
    metrics.push({ id: 'hum', label: 'Hum / buzz', value: hum.hz ? `${hum.hz} Hz hum` : 'None', status, detail, tip });
  }

  // Static / crackle
  {
    let status: Status = 'great';
    let pen = 0;
    let detail = 'No static, crackle or pops.';
    let tip: string | undefined;
    const hiss = hissFlat > 0.5 && hissLevel > -52;
    if (clicksPerSec > 2) {
      status = 'poor'; pen = 18; detail = 'Frequent crackle or static pops.';
      tip = 'Check the cable and connector, or re-pair the Bluetooth headset. Crackle is often a loose plug or weak signal.';
    } else if (clicksPerSec > 0.4) {
      status = 'fair'; pen = 8; detail = 'Occasional pops or crackles.';
      tip = 'Wiggle-test the cable. For Bluetooth, keep the phone closer to the headset.';
    } else if (hiss) {
      status = 'fair'; pen = 6; detail = 'Steady hiss under your voice.';
      tip = 'Hiss usually comes from cheap mic preamps or high input gain. Lower the gain and speak closer.';
    }
    score -= pen;
    if (pen >= 8) issues.push({ weight: pen, text: detail });
    metrics.push({ id: 'static', label: 'Static & crackle', value: clicksPerSec > 0.4 ? `${clicksPerSec.toFixed(1)} pops/s` : hiss ? 'Hiss' : 'None', status, detail, tip });
  }

  // Dropouts
  {
    let status: Status = 'great';
    let pen = 0;
    let detail = 'No audio dropouts. The signal stayed connected the whole time.';
    let tip: string | undefined;
    if (dropouts >= 3) {
      status = 'poor'; pen = 22; detail = `${dropouts} dropouts. Audio cut out mid-sentence.`;
      tip = 'Usually a Bluetooth range or interference issue. Move closer to the phone and away from Wi-Fi routers or microwaves.';
    } else if (dropouts >= 1) {
      status = 'fair'; pen = 9; detail = `${dropouts} brief dropout${dropouts > 1 ? 's' : ''} detected.`;
      tip = 'Keep the phone close to your headset during calls.';
    }
    score -= pen;
    if (pen >= 9) issues.push({ weight: pen, text: detail });
    metrics.push({ id: 'dropouts', label: 'Dropouts', value: dropouts ? `${dropouts}` : 'None', status, detail, tip });
  }

  if (Math.abs(dcOffset) > 0.05) score -= 3;

  score = Math.round(Math.max(0, Math.min(100, score)));
  // "Excellent" means nothing needs attention.
  if (metrics.some((m) => m.status === 'fair' || m.status === 'poor')) score = Math.min(score, 89);
  // Narrowband speech is a hard ceiling: it is intelligible but never "good".
  if (voiceDetected && bandwidthClass === 'narrowband') score = Math.min(score, 66);
  if (!voiceDetected) score = Math.min(score, 25);
  const grade = voiceDetected ? gradeFor(score) : 'No voice';

  issues.sort((a, b) => b.weight - a.weight);
  let headline: string;
  let summary: string;
  if (!voiceDetected) {
    headline = 'We couldn’t hear you';
    summary = 'Your voice didn’t come through clearly. Check that the right mic is selected and not muted, then try again.';
  } else if (score >= 90) {
    headline = 'You sound great';
    summary = 'Your mic is call-ready. Clear, clean and well balanced.';
  } else if (score >= 75) {
    headline = 'You sound good';
    summary = issues.length ? `Ready for calls. One thing to improve: ${lowerFirst(issues[0].text)}` : 'Ready for calls with only minor imperfections.';
  } else if (score >= 60) {
    headline = 'You’ll be understood';
    summary = issues.length ? `But it could be better. ${issues[0].text}` : 'Usable, but there’s room to improve.';
  } else {
    headline = 'Fix this before your call';
    summary = issues.slice(0, 2).map((i) => i.text).join(' ');
  }

  return {
    voiceDetected,
    score,
    grade,
    headline,
    summary,
    metrics,
    speechLevelDb,
    peakDb,
    noiseFloorDb,
    snrDb,
    bandwidthHz,
    bandwidthClass,
    tone,
    humHz: hum.hz,
    clicksPerSec,
    dropouts,
    clipPercent,
    spectrum: spectrumCurve(speechPsd, noisePsd, fftSize, sr),
    sampleRate: sr,
  };
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// -------------------------------------------------------------------------
// Echo leak: play a test sound through the speaker and measure how much of it
// the microphone picks up.

export interface EchoReport {
  leakDb: number;
  status: Status;
  label: string;
  detail: string;
}

export function analyzeEchoLeak(before: Float32Array, during: Float32Array, sr: number): EchoReport {
  const n = 2048;
  const b = welch(removeDc(before, sr), n).psd;
  const d = welch(removeDc(during, sr), n).psd;
  const pb = bandPower(b, 500, 4000, n, sr);
  const pd = bandPower(d, 500, 4000, n, sr);
  const leakDb = powToDb(pd) - powToDb(pb);
  if (leakDb < 6) {
    return { leakDb, status: 'great', label: 'No echo', detail: 'Your mic didn’t pick up the test sound, so the other side won’t hear themselves echo.' };
  }
  if (leakDb < 18) {
    return { leakDb, status: 'good', label: 'Slight leak', detail: 'A little of your speaker reaches the mic. Call apps’ echo cancellation will handle it.' };
  }
  return {
    leakDb,
    status: 'fair',
    label: 'Speaker reaches mic',
    detail: 'Your mic clearly hears your speaker. That’s expected on speakerphone. If you’re wearing headphones, the sound is going to the phone speaker instead.',
  };
}

/** Utility for tests & visualisation: dominant frequency in a PSD. */
export function dominantFrequency(psd: Float64Array, fftSize: number, sr: number): number {
  let best = 1;
  for (let k = 1; k < psd.length; k++) if (psd[k] > psd[best]) best = k;
  return binFreq(best, fftSize, sr);
}

export { dbToPow };
