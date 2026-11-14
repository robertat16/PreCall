import { describeMediaError, releaseStream, trackStream } from '../audio/engine';
import { analyzeFrame, averageStats, type FrameStats } from './analysis';
import { sleep } from '../ui/dom';
import { detectFace } from './face';
import type { FaceBox } from './framing';

export type Facing = 'user' | 'environment';

export async function openCamera(facing: Facing, withAudio = false): Promise<MediaStream> {
  const video: MediaTrackConstraints = {
    facingMode: { ideal: facing },
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  };
  try {
    return trackStream(await navigator.mediaDevices.getUserMedia({
      video,
      audio: withAudio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
    }));
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === 'OverconstrainedError' || name === 'NotReadableError') {
      // retry with minimal constraints (some devices reject resolution hints)
      try {
        return trackStream(await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: withAudio }));
      } catch (e2) {
        throw describeMediaError(e2, 'camera');
      }
    }
    throw describeMediaError(e, 'camera');
  }
}

export function stopStream(s: MediaStream | null | undefined): void {
  releaseStream(s);
}

type RVFC = (cb: (now: number, meta: { mediaTime: number; presentedFrames: number }) => void) => number;

/** Samples frames from a playing <video> for live HUD readouts and analysis. */
export class CameraSampler {
  private canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private frames: number[] = [];
  private rvfcId = 0;
  private running = true;
  private lastStats: FrameStats | null = null;
  private collect: FrameStats[] | null = null;
  private timer = 0;
  private faceTimer = 0;
  private faceBusy = false;
  private lastFace: FaceBox | null | undefined = undefined;
  private faceAvailable = false;
  private faceCollect: Array<FaceBox | null> | null = null;

  constructor(private video: HTMLVideoElement, private faceContainer?: () => { width: number; height: number }) {
    this.g = this.canvas.getContext('2d', { willReadFrequently: true })!;
    const rvfc = (video as unknown as { requestVideoFrameCallback?: RVFC }).requestVideoFrameCallback?.bind(video);
    if (rvfc) {
      const onFrame = (now: number) => {
        if (!this.running) return;
        this.frames.push(now);
        const cutoff = now - 2000;
        while (this.frames.length && this.frames[0] < cutoff) this.frames.shift();
        this.rvfcId = rvfc(onFrame);
      };
      this.rvfcId = rvfc(onFrame);
    }
    this.timer = window.setInterval(() => this.sample(), 250);
    if (faceContainer) this.faceTimer = window.setInterval(() => void this.sampleFace(), 450);
  }

  private async sampleFace(): Promise<void> {
    if (!this.running || this.faceBusy || this.video.readyState < 2 || !this.faceContainer) return;
    this.faceBusy = true;
    try {
      const f = await detectFace(this.video, this.faceContainer());
      if (!this.running) return;
      if (f !== undefined) {
        this.faceAvailable = true;
        this.lastFace = f;
        this.faceCollect?.push(f);
      }
    } finally {
      this.faceBusy = false;
    }
  }

  /** Latest face box (normalised to the preview), null if no face, undefined if detection unavailable. */
  face(): FaceBox | null | undefined {
    return this.faceAvailable ? this.lastFace : undefined;
  }

  faceSupported(): boolean {
    return this.faceAvailable;
  }

  private sample(): void {
    const v = this.video;
    if (!this.running || v.readyState < 2 || !v.videoWidth) return;
    const w = 240;
    const hgt = Math.round((v.videoHeight / v.videoWidth) * w) || 180;
    if (this.canvas.width !== w || this.canvas.height !== hgt) {
      this.canvas.width = w;
      this.canvas.height = hgt;
    }
    try {
      this.g.drawImage(v, 0, 0, w, hgt);
      const img = this.g.getImageData(0, 0, w, hgt);
      this.lastStats = analyzeFrame(img.data, w, hgt);
      this.collect?.push(this.lastStats);
    } catch {
      /* frame not ready */
    }
  }

  fps(): number {
    if (this.frames.length >= 2) {
      const span = this.frames[this.frames.length - 1] - this.frames[0];
      if (span > 300) return ((this.frames.length - 1) * 1000) / span;
    }
    const s = (this.video.srcObject as MediaStream | null)?.getVideoTracks()[0]?.getSettings();
    return s?.frameRate ?? 0;
  }

  stats(): FrameStats | null {
    return this.lastStats;
  }

  /** Collect frame stats for `ms` and return their average. */
  async gather(ms: number, signal?: AbortSignal): Promise<FrameStats | null> {
    this.collect = [];
    this.faceCollect = [];
    try {
      await sleep(ms, signal);
    } catch (e) {
      this.collect = null;
      this.faceCollect = null;
      throw e;
    }
    const list = this.collect ?? [];
    this.collect = null;
    this.lastFaces = this.faceCollect ?? [];
    this.faceCollect = null;
    if (!list.length) return this.lastStats;
    return averageStats(list);
  }

  /** Face boxes seen during the last gather(). */
  lastFaces: Array<FaceBox | null> = [];

  stop(): void {
    this.running = false;
    clearInterval(this.timer);
    clearInterval(this.faceTimer);
    const cancel = (this.video as unknown as { cancelVideoFrameCallback?: (id: number) => void }).cancelVideoFrameCallback;
    if (cancel && this.rvfcId) cancel.call(this.video, this.rvfcId);
  }
}

export function pickRecorderMime(): string {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  if (typeof MediaRecorder === 'undefined') return '';
  for (const c of candidates) if (MediaRecorder.isTypeSupported(c)) return c;
  return '';
}
