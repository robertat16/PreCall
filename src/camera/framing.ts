import type { Metric, Status } from '../audio/analysis';

/** Face box in normalised coordinates of the *visible* preview (0..1). */
export interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FramingIssue = 'none' | 'noface' | 'close' | 'far' | 'left' | 'right' | 'high' | 'low' | 'cutoff';

export interface FramingResult {
  issue: FramingIssue;
  hint: string;
}

/**
 * The preview uses object-fit: cover, so part of the camera frame is cropped away.
 * Returns the visible region of the video frame, in video pixels.
 */
export function visibleRect(vw: number, vh: number, cw: number, ch: number): { x: number; y: number; w: number; h: number } {
  if (!vw || !vh || !cw || !ch) return { x: 0, y: 0, w: vw, h: vh };
  const scale = Math.max(cw / vw, ch / vh);
  const w = cw / scale;
  const h = ch / scale;
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
}

/** Classify how well a face is framed for a video call. */
export function judgeFraming(box: FaceBox | null): FramingResult {
  if (!box) return { issue: 'noface', hint: 'Can’t see your face' };
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const edge = 0.02;
  const cut = box.x < edge || box.y < edge || box.x + box.w > 1 - edge || box.y + box.h > 1 - edge;
  if (box.h > 0.62 || box.w > 0.8) return { issue: 'close', hint: 'Move back a little' };
  if (cut && box.h > 0.4) return { issue: 'close', hint: 'Move back a little' };
  if (cut) return { issue: 'cutoff', hint: 'Center your face' };
  if (box.h < 0.16) return { issue: 'far', hint: 'Move a bit closer' };
  if (cx < 0.33) return { issue: 'left', hint: 'Move to the center' };
  if (cx > 0.67) return { issue: 'right', hint: 'Move to the center' };
  if (cy < 0.22) return { issue: 'high', hint: 'Lower the camera slightly' };
  if (cy > 0.62) return { issue: 'low', hint: 'Raise the camera to eye level' };
  return { issue: 'none', hint: 'Well framed' };
}

/** Turn the face boxes seen during analysis into a report metric. */
export function framingMetric(boxes: Array<FaceBox | null>, available: boolean): { metric: Metric; pen: number } | null {
  if (!available || boxes.length === 0) return null;
  const found = boxes.filter((b): b is FaceBox => !!b);
  if (found.length < boxes.length * 0.4) {
    return {
      pen: 16,
      metric: {
        id: 'framing', label: 'Framing', value: 'No face', status: 'poor',
        detail: 'We couldn’t find your face in the picture.',
        tip: 'Face the camera, hold the phone about an arm’s length away, and make sure your face is well lit.',
      },
    };
  }
  const avg = (k: keyof FaceBox) => found.reduce((s, b) => s + b[k], 0) / found.length;
  const r = judgeFraming({ x: avg('x'), y: avg('y'), w: avg('w'), h: avg('h') });
  const table: Record<FramingIssue, [Status, number, string, string, string?]> = {
    none: ['great', 0, 'Centered', 'Your face is centered and nicely sized in the frame.'],
    noface: ['poor', 16, 'No face', 'We couldn’t find your face in the picture.'],
    close: ['fair', 12, 'Too close', 'You’re too close. Part of your face is cut off, and close-ups are unflattering on calls.', 'Hold the phone about an arm’s length away, so your head and shoulders fit in the frame.'],
    cutoff: ['fair', 10, 'Cut off', 'Part of your face is outside the frame.', 'Move so your whole face sits inside the outline.'],
    far: ['fair', 6, 'Too far', 'You look small in the frame. Others will see more room than you.', 'Move a bit closer, so your face fills about a third of the screen height.'],
    left: ['fair', 7, 'Off-center', 'You’re off to one side of the frame.', 'Move so your face lines up with the outline in the middle.'],
    right: ['fair', 7, 'Off-center', 'You’re off to one side of the frame.', 'Move so your face lines up with the outline in the middle.'],
    high: ['fair', 6, 'Too high', 'Your face sits near the top of the frame.', 'Tilt the phone up slightly, or lower it, so your eyes are about a third of the way down.'],
    low: ['fair', 8, 'Too low', 'Your face sits low in the frame (often a sign the camera is below you).', 'Raise the camera to eye level. It’s also more flattering.'],
  };
  const [status, pen, value, detail, tip] = table[r.issue];
  return { pen, metric: { id: 'framing', label: 'Framing', value, status, detail, tip } };
}
