/**
 * Small, dependency-free DSP toolkit used by the analysis engine.
 * Everything here is pure and synchronous so it can be unit tested in Node.
 */

export const EPS = 1e-12;

/** Convert a linear amplitude/power ratio to decibels. */
export function ampToDb(a: number): number {
  return 20 * Math.log10(Math.max(Math.abs(a), EPS));
}
export function powToDb(p: number): number {
  return 10 * Math.log10(Math.max(p, EPS));
}
export function dbToPow(db: number): number {
  return Math.pow(10, db / 10);
}

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

const windowCache = new Map<number, Float32Array>();
/** Periodic Hann window (cached). */
export function hann(n: number): Float32Array {
  let w = windowCache.get(n);
  if (!w) {
    w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    windowCache.set(n, w);
  }
  return w;
}

/**
 * In-place iterative radix-2 complex FFT.
 * `re` and `im` must have the same power-of-two length.
 */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) throw new Error('fft: length must be a power of two');
  // bit reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/**
 * Averaged power spectral density (Welch's method, Hann, 50% overlap).
 * Returns one-sided power per bin (linear, arbitrary but consistent scale:
 * a full-scale sine yields roughly 0 dB summed over its main lobe).
 * Segments selected by `keep` (if given) are the only ones averaged.
 */
export function welch(
  x: Float32Array,
  fftSize = 4096,
  keep?: (segStart: number, segEnd: number) => boolean,
): { psd: Float64Array; segments: number } {
  const n = fftSize;
  const w = hann(n);
  let wPow = 0;
  for (let i = 0; i < n; i++) wPow += w[i] * w[i];
  const bins = n / 2 + 1;
  const acc = new Float64Array(bins);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const hop = n >> 1;
  let segments = 0;
  for (let start = 0; start + n <= x.length; start += hop) {
    if (keep && !keep(start, start + n)) continue;
    for (let i = 0; i < n; i++) {
      re[i] = x[start + i] * w[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < bins; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      acc[k] += k === 0 || k === bins - 1 ? p : 2 * p;
    }
    segments++;
  }
  if (segments > 0) {
    // Normalise so a sine of amplitude A sums to ~A^2/2 across its lobe.
    const norm = 1 / (segments * wPow * n);
    for (let k = 0; k < bins; k++) acc[k] *= norm;
  }
  return { psd: acc, segments };
}

export function binFreq(k: number, fftSize: number, sampleRate: number): number {
  return (k * sampleRate) / fftSize;
}

export function freqBin(f: number, fftSize: number, sampleRate: number): number {
  return Math.round((f * fftSize) / sampleRate);
}

/** Sum PSD power between two frequencies (inclusive bins). */
export function bandPower(psd: Float64Array, f1: number, f2: number, fftSize: number, sr: number): number {
  const k1 = Math.max(0, freqBin(f1, fftSize, sr));
  const k2 = Math.min(psd.length - 1, freqBin(f2, fftSize, sr));
  let s = 0;
  for (let k = k1; k <= k2; k++) s += psd[k];
  return s;
}

/** Mean of PSD bins between two frequencies (power density). */
export function bandMean(psd: Float64Array, f1: number, f2: number, fftSize: number, sr: number): number {
  const k1 = Math.max(0, freqBin(f1, fftSize, sr));
  const k2 = Math.min(psd.length - 1, freqBin(f2, fftSize, sr));
  if (k2 < k1) return 0;
  return bandPower(psd, f1, f2, fftSize, sr) / (k2 - k1 + 1);
}

/** Per-frame RMS in dBFS. Frames are non-overlapping. */
export function frameRmsDb(x: Float32Array, frameLen: number): Float32Array {
  const frames = Math.floor(x.length / frameLen);
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    const o = f * frameLen;
    for (let i = 0; i < frameLen; i++) s += x[o + i] * x[o + i];
    out[f] = powToDb(s / frameLen);
  }
  return out;
}

export function percentile(values: ArrayLike<number>, p: number): number {
  if (values.length === 0) return NaN;
  const a = Array.from(values).sort((x, y) => x - y);
  const idx = Math.min(a.length - 1, Math.max(0, (p / 100) * (a.length - 1)));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}

export function median(values: ArrayLike<number>): number {
  return percentile(values, 50);
}

/** Power-average a list of dB values. */
export function meanDb(values: ArrayLike<number>): number {
  if (values.length === 0) return -Infinity;
  let s = 0;
  for (let i = 0; i < values.length; i++) s += dbToPow(values[i]);
  return powToDb(s / values.length);
}

/** Remove DC with a one-pole high-pass (returns a new array). */
export function removeDc(x: Float32Array, sampleRate: number, cutoff = 20): Float32Array {
  const out = new Float32Array(x.length);
  const r = Math.exp((-2 * Math.PI * cutoff) / sampleRate);
  let prevX = 0;
  let prevY = 0;
  for (let i = 0; i < x.length; i++) {
    const y = x[i] - prevX + r * prevY;
    prevX = x[i];
    prevY = y;
    out[i] = y;
  }
  return out;
}

/** Spectral flatness (geometric / arithmetic mean) of PSD between f1 and f2. 1 = white noise. */
export function spectralFlatness(psd: Float64Array, f1: number, f2: number, fftSize: number, sr: number): number {
  const k1 = Math.max(1, freqBin(f1, fftSize, sr));
  const k2 = Math.min(psd.length - 1, freqBin(f2, fftSize, sr));
  if (k2 <= k1) return 0;
  let logSum = 0;
  let sum = 0;
  for (let k = k1; k <= k2; k++) {
    const p = Math.max(psd[k], EPS);
    logSum += Math.log(p);
    sum += p;
  }
  const n = k2 - k1 + 1;
  const geo = Math.exp(logSum / n);
  const arith = sum / n;
  return arith > 0 ? geo / arith : 0;
}
