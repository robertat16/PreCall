/**
 * Browser/WebView audio plumbing: microphone sessions, raw PCM recording,
 * playback and test-tone generation.
 */

let ctx: AudioContext | null = null;

/** Every live mic/camera stream, so the app can release them when backgrounded. */
export const activeStreams = new Set<MediaStream>();
export function trackStream(s: MediaStream): MediaStream {
  activeStreams.add(s);
  s.getTracks().forEach((t) => t.addEventListener('ended', () => {
    if (s.getTracks().every((x) => x.readyState === 'ended')) activeStreams.delete(s);
  }));
  return s;
}
export function releaseStream(s: MediaStream | null | undefined): void {
  if (!s) return;
  s.getTracks().forEach((t) => t.stop());
  activeStreams.delete(s);
}
let workletReady: Promise<boolean> | null = null;

export function audioContext(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    workletReady = null;
  }
  return ctx;
}

export async function resumeAudio(): Promise<AudioContext> {
  const c = audioContext();
  if (c.state === 'suspended') {
    try {
      await c.resume();
    } catch {
      /* resumed on next gesture */
    }
  }
  return c;
}

function loadWorklet(c: AudioContext): Promise<boolean> {
  if (!workletReady) {
    workletReady = c.audioWorklet
      ? c.audioWorklet.addModule('recorder-worklet.js').then(() => true, () => false)
      : Promise.resolve(false);
  }
  return workletReady;
}

export interface MicOptions {
  deviceId?: string;
  /** Enable the browser's call processing (echo cancellation, noise suppression, auto gain). */
  processing: boolean;
}

export class MicError extends Error {
  constructor(public kind: 'denied' | 'notfound' | 'busy' | 'insecure' | 'unknown', message: string) {
    super(message);
  }
}

export function describeMediaError(err: unknown, what: 'microphone' | 'camera'): MicError {
  const name = (err as { name?: string })?.name ?? '';
  if (!navigator.mediaDevices?.getUserMedia) return new MicError('insecure', `This device can’t open the ${what} here.`);
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError')
    return new MicError('denied', `PreCall needs permission to use your ${what}. Allow it in your phone’s Settings → Apps → PreCall → Permissions, then try again.`);
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError')
    return new MicError('notfound', `No ${what} was found. Check it’s connected and try again.`);
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError')
    return new MicError('busy', `Your ${what} is being used by another app (maybe a call). Close it and try again.`);
  return new MicError('unknown', `Couldn’t start the ${what}. ${(err as Error)?.message ?? ''}`.trim());
}

export class MicSession {
  readonly analyser: AnalyserNode;
  private source: MediaStreamAudioSourceNode;
  private timeBuf: Float32Array<ArrayBuffer>;
  private peakHold = -120;
  private peakHoldAt = 0;
  private closed = false;

  private constructor(
    readonly ctx: AudioContext,
    readonly stream: MediaStream,
    readonly processing: boolean,
  ) {
    this.source = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;
    this.analyser.minDecibels = -110;
    this.analyser.maxDecibels = -10;
    this.source.connect(this.analyser);
    this.timeBuf = new Float32Array(this.analyser.fftSize);
  }

  static async open(opts: MicOptions): Promise<MicSession> {
    const c = await resumeAudio();
    const audio: MediaTrackConstraints = {
      echoCancellation: opts.processing,
      noiseSuppression: opts.processing,
      autoGainControl: opts.processing,
      channelCount: { ideal: 1 },
    };
    if (opts.deviceId) audio.deviceId = { exact: opts.deviceId };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    } catch (e) {
      if (opts.deviceId && (e as { name?: string }).name === 'OverconstrainedError') {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { ...audio, deviceId: undefined }, video: false }).catch((e2) => {
          throw describeMediaError(e2, 'microphone');
        });
      } else {
        throw describeMediaError(e, 'microphone');
      }
    }
    return new MicSession(c, trackStream(stream), opts.processing);
  }

  get track(): MediaStreamTrack | undefined {
    return this.stream.getAudioTracks()[0];
  }

  get label(): string {
    return this.track?.label || 'Microphone';
  }

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  /** Instantaneous RMS and held peak (dBFS) from the analyser window. */
  level(): { rmsDb: number; peakDb: number; holdDb: number; clipping: boolean } {
    this.analyser.getFloatTimeDomainData(this.timeBuf);
    let s = 0;
    let p = 0;
    for (let i = 0; i < this.timeBuf.length; i++) {
      const v = this.timeBuf[i];
      s += v * v;
      const a = Math.abs(v);
      if (a > p) p = a;
    }
    const rmsDb = 10 * Math.log10(Math.max(s / this.timeBuf.length, 1e-12));
    const peakDb = 20 * Math.log10(Math.max(p, 1e-6));
    const now = performance.now();
    if (peakDb >= this.peakHold || now - this.peakHoldAt > 1500) {
      this.peakHold = peakDb;
      this.peakHoldAt = now;
    }
    return { rmsDb, peakDb, holdDb: this.peakHold, clipping: p >= 0.985 };
  }

  waveform(): Float32Array {
    this.analyser.getFloatTimeDomainData(this.timeBuf);
    return this.timeBuf;
  }

  /**
   * Record raw PCM for `seconds`. `onProgress` gets 0..1 and the live level.
   * Resolves with mono samples at `this.sampleRate`.
   */
  async record(seconds: number, onProgress?: (t: number) => void, signal?: AbortSignal): Promise<Float32Array> {
    const c = this.ctx;
    await resumeAudio();
    const chunks: Float32Array[] = [];
    let total = 0;
    const target = Math.round(seconds * c.sampleRate);
    const sink = c.createGain();
    sink.gain.value = 0;
    sink.connect(c.destination);

    const useWorklet = await loadWorklet(c);
    return new Promise<Float32Array>((resolve, reject) => {
      let node: AudioNode;
      let finished = false;
      let raf = 0;
      const startedAt = performance.now();

      const finish = () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(raf);
        try { this.source.disconnect(node); } catch { /* already */ }
        try { node.disconnect(); } catch { /* already */ }
        try { sink.disconnect(); } catch { /* already */ }
        const out = new Float32Array(Math.min(total, target));
        let o = 0;
        for (const ch of chunks) {
          const n = Math.min(ch.length, out.length - o);
          if (n <= 0) break;
          out.set(n === ch.length ? ch : ch.subarray(0, n), o);
          o += n;
        }
        resolve(out);
      };

      const push = (data: Float32Array) => {
        if (finished) return;
        chunks.push(data);
        total += data.length;
        if (total >= target) finish();
      };

      if (useWorklet) {
        const w = new AudioWorkletNode(c, 'precall-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
        w.port.onmessage = (e: MessageEvent) => {
          if (e.data?.chunk) push(e.data.chunk as Float32Array);
        };
        w.port.postMessage('start');
        node = w;
      } else {
        const sp = c.createScriptProcessor(4096, 1, 1);
        sp.onaudioprocess = (e) => push(new Float32Array(e.inputBuffer.getChannelData(0)));
        node = sp;
      }
      this.source.connect(node);
      node.connect(sink);

      // Watchdog: if the audio thread never delivers (suspended context), fail clearly.
      const tick = () => {
        if (finished) return;
        const elapsed = (performance.now() - startedAt) / 1000;
        onProgress?.(Math.min(1, total / target));
        if (signal?.aborted) {
          finished = true;
          try { this.source.disconnect(node); node.disconnect(); sink.disconnect(); } catch { /* ignore */ }
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        if (elapsed > seconds + 4 && total === 0) {
          finished = true;
          reject(new MicError('busy', 'The microphone isn’t delivering any audio. Another app may be holding it.'));
          return;
        }
        if (elapsed > seconds + 6) {
          finish();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.source.disconnect(); } catch { /* ignore */ }
    releaseStream(this.stream);
  }
}

export interface Playback {
  stop(): void;
  done: Promise<void>;
  duration: number;
  position(): number;
}

export async function playSamples(samples: Float32Array, sampleRate: number, gain = 1): Promise<Playback> {
  const c = await resumeAudio();
  const buf = c.createBuffer(1, Math.max(1, samples.length), sampleRate);
  buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(c.destination);
  const t0 = c.currentTime;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));
  src.onended = () => resolveDone();
  src.start();
  return {
    stop: () => {
      try { src.stop(); } catch { /* ended */ }
      resolveDone();
    },
    done,
    duration: buf.duration,
    position: () => Math.min(buf.duration, c.currentTime - t0),
  };
}

/** Peak-normalise a copy for comfortable playback, never boosting more than `maxGainDb`. */
export function playbackGain(samples: Float32Array, maxGainDb = 18): number {
  let p = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > p) p = a;
  }
  if (p <= 0) return 1;
  return Math.min(0.9 / p, Math.pow(10, maxGainDb / 20));
}

// ---------------------------------------------------------------------------
// Test tones

export interface ToneHandle {
  stop(): void;
  done: Promise<void>;
}

export async function playTone(opts: {
  freq: number;
  seconds: number;
  pan?: number;
  volume?: number;
  type?: OscillatorType;
  pulses?: boolean;
}): Promise<ToneHandle> {
  const c = await resumeAudio();
  const osc = c.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.value = opts.freq;
  const g = c.createGain();
  const vol = opts.volume ?? 0.3;
  const t = c.currentTime;
  g.gain.setValueAtTime(0, t);
  if (opts.pulses) {
    // 0.25 s beeps with gaps: easier to localise left/right
    for (let s = 0; s < opts.seconds; s += 0.5) {
      g.gain.setTargetAtTime(vol, t + s, 0.01);
      g.gain.setTargetAtTime(0, t + s + 0.3, 0.02);
    }
  } else {
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol, t + opts.seconds - 0.05);
    g.gain.linearRampToValueAtTime(0, t + opts.seconds);
  }
  let out: AudioNode = g;
  if (typeof opts.pan === 'number' && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = opts.pan;
    g.connect(p);
    out = p;
  }
  osc.connect(g);
  out.connect(c.destination);
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));
  osc.onended = () => {
    try { out.disconnect(); } catch { /* ignore */ }
    resolveDone();
  };
  osc.start(t);
  osc.stop(t + opts.seconds + 0.05);
  return {
    stop: () => {
      try {
        g.gain.cancelScheduledValues(c.currentTime);
        g.gain.setTargetAtTime(0, c.currentTime, 0.01);
        osc.stop(c.currentTime + 0.06);
      } catch { /* already stopped */ }
    },
    done,
  };
}

/** Logarithmic sine sweep. `onFreq` reports the current frequency while playing. */
export async function playSweep(opts: {
  from: number;
  to: number;
  seconds: number;
  volume?: number;
  onFreq?: (f: number) => void;
}): Promise<ToneHandle & { currentFreq(): number }> {
  const c = await resumeAudio();
  const osc = c.createOscillator();
  const g = c.createGain();
  const vol = opts.volume ?? 0.25;
  const t = c.currentTime;
  osc.frequency.setValueAtTime(opts.from, t);
  osc.frequency.exponentialRampToValueAtTime(opts.to, t + opts.seconds);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.05);
  g.gain.setValueAtTime(vol, t + opts.seconds - 0.05);
  g.gain.linearRampToValueAtTime(0, t + opts.seconds);
  osc.connect(g).connect(c.destination);
  const currentFreq = () => {
    const el = Math.min(Math.max(c.currentTime - t, 0), opts.seconds);
    return opts.from * Math.pow(opts.to / opts.from, el / opts.seconds);
  };
  let raf = 0;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));
  const loop = () => {
    opts.onFreq?.(currentFreq());
    raf = requestAnimationFrame(loop);
  };
  if (opts.onFreq) raf = requestAnimationFrame(loop);
  osc.onended = () => {
    cancelAnimationFrame(raf);
    try { g.disconnect(); } catch { /* ignore */ }
    resolveDone();
  };
  osc.start(t);
  osc.stop(t + opts.seconds + 0.02);
  return {
    stop: () => {
      try {
        g.gain.cancelScheduledValues(c.currentTime);
        g.gain.setTargetAtTime(0, c.currentTime, 0.01);
        osc.stop(c.currentTime + 0.05);
      } catch { /* ignore */ }
    },
    done,
    currentFreq,
  };
}

/** A short multi-tone burst used for the echo-leak test. */
export async function playEchoProbe(seconds = 1.2, volume = 0.35): Promise<ToneHandle> {
  const c = await resumeAudio();
  const t = c.currentTime;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(volume, t + 0.02);
  g.gain.setValueAtTime(volume, t + seconds - 0.05);
  g.gain.linearRampToValueAtTime(0, t + seconds);
  g.connect(c.destination);
  const oscs = [700, 1100, 1700, 2600].map((f) => {
    const o = c.createOscillator();
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 1.3, t + seconds);
    const og = c.createGain();
    og.gain.value = 0.25;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + seconds + 0.02);
    return o;
  });
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));
  oscs[0].onended = () => {
    try { g.disconnect(); } catch { /* ignore */ }
    resolveDone();
  };
  return {
    stop: () => {
      oscs.forEach((o) => { try { o.stop(); } catch { /* ignore */ } });
      resolveDone();
    },
    done,
  };
}

export async function listAudioInputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'audioinput');
}

/** Encode mono float samples as a 16-bit PCM WAV blob (for sharing a recording). */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
