import { visibleRect, type FaceBox } from './framing';

/**
 * On-device face detection (TinyFaceDetector, ~190 KB model bundled in /models).
 * Loaded lazily so the rest of the app starts instantly; if it can't load on a
 * device, framing checks are simply skipped.
 */
type FaceApi = typeof import('@vladmandic/face-api');

let api: Promise<FaceApi | null> | null = null;

export function loadFaceDetector(): Promise<FaceApi | null> {
  if (!api) {
    api = (async () => {
      try {
        const faceapi = await import('@vladmandic/face-api');
        const tf = faceapi.tf as unknown as { ready(): Promise<void>; setBackend(b: string): Promise<boolean>; getBackend(): string };
        try {
          await tf.setBackend('webgl');
        } catch {
          /* fall back to whatever backend is available */
        }
        await tf.ready();
        await faceapi.nets.tinyFaceDetector.loadFromUri('models');
        return faceapi;
      } catch {
        return null;
      }
    })();
  }
  return api;
}

/** Detect the most prominent face; returns its box normalised to the visible preview area. */
export async function detectFace(video: HTMLVideoElement, container: { width: number; height: number }): Promise<FaceBox | null | undefined> {
  const faceapi = await loadFaceDetector();
  if (!faceapi || !video.videoWidth) return undefined;
  try {
    const det = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 }));
    if (!det) return null;
    const vr = visibleRect(video.videoWidth, video.videoHeight, container.width, container.height);
    const b = det.box;
    return {
      x: (b.x - vr.x) / vr.w,
      y: (b.y - vr.y) / vr.h,
      w: b.width / vr.w,
      h: b.height / vr.h,
    };
  } catch {
    return undefined;
  }
}
