import { gradeFor, type Metric, type Status } from '../audio/analysis';

export interface FrameStats {
  brightness: number; // mean luma 0..255
  contrast: number; // luma std dev
  highlights: number; // fraction of clipped highlights
  shadows: number; // fraction of crushed shadows
  centerBrightness: number;
  edgeBrightness: number;
  sharpness: number; // variance of Laplacian
  r: number;
  g: number;
  b: number;
}

/** Analyse one RGBA frame (typically downscaled to ~240 px wide). */
export function analyzeFrame(data: Uint8ClampedArray, w: number, h: number): FrameStats {
  const n = w * h;
  const luma = new Float32Array(n);
  let sum = 0;
  let sumSq = 0;
  let hi = 0;
  let lo = 0;
  let rs = 0;
  let gs = 0;
  let bs = 0;
  let cSum = 0;
  let cN = 0;
  let eSum = 0;
  let eN = 0;
  const cx0 = w * 0.3;
  const cx1 = w * 0.7;
  const cy0 = h * 0.25;
  const cy1 = h * 0.75;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      luma[i] = l;
      sum += l;
      sumSq += l * l;
      if (l >= 250) hi++;
      if (l <= 8) lo++;
      rs += r;
      gs += g;
      bs += b;
      if (x >= cx0 && x < cx1 && y >= cy0 && y < cy1) {
        cSum += l;
        cN++;
      } else if (x < w * 0.15 || x >= w * 0.85 || y < h * 0.12) {
        eSum += l;
        eN++;
      }
    }
  }
  const mean = sum / n;
  const contrast = Math.sqrt(Math.max(0, sumSq / n - mean * mean));

  // variance of the Laplacian (focus measure)
  let lapSum = 0;
  let lapSq = 0;
  let lapN = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - w] - luma[i + w];
      lapSum += v;
      lapSq += v * v;
      lapN++;
    }
  }
  const lapMean = lapN ? lapSum / lapN : 0;
  const sharpness = lapN ? lapSq / lapN - lapMean * lapMean : 0;

  return {
    brightness: mean,
    contrast,
    highlights: hi / n,
    shadows: lo / n,
    centerBrightness: cN ? cSum / cN : mean,
    edgeBrightness: eN ? eSum / eN : mean,
    sharpness,
    r: rs / n,
    g: gs / n,
    b: bs / n,
  };
}

export function averageStats(list: FrameStats[]): FrameStats {
  const keys = Object.keys(list[0]) as Array<keyof FrameStats>;
  const out = {} as FrameStats;
  for (const k of keys) out[k] = list.reduce((a, s) => a + s[k], 0) / list.length;
  return out;
}

export interface CameraReport {
  score: number;
  grade: string;
  headline: string;
  summary: string;
  metrics: Metric[];
  width: number;
  height: number;
  fps: number;
  stats: FrameStats;
  facing: string;
}

export function analyzeCamera(input: {
  stats: FrameStats;
  width: number;
  height: number;
  fps: number;
  facing: string;
}): CameraReport {
  const { stats: s, width, height, fps } = input;
  const metrics: Metric[] = [];
  const issues: Array<{ w: number; t: string }> = [];
  let score = 100;
  const push = (m: Metric, pen: number) => {
    metrics.push(m);
    score -= pen;
    if (pen >= 8) issues.push({ w: pen, t: m.detail });
  };

  // Resolution
  {
    const short = Math.min(width, height);
    let status: Status = 'great';
    let pen = 0;
    let detail = 'HD or better. Sharp enough for any call app.';
    let tip: string | undefined;
    if (short === 0) {
      status = 'poor'; pen = 40; detail = 'No video frames were received.';
      tip = 'Close other apps that might be using the camera, then try again.';
    } else if (short < 360) {
      status = 'poor'; pen = 20; detail = 'Low resolution. You’ll look blocky.';
      tip = 'Try the other camera. The front camera is usually best for calls.';
    } else if (short < 720) {
      status = 'good'; pen = 5; detail = 'Standard definition. Fine for most calls.';
    }
    const label = short >= 1080 ? '1080p' : short >= 720 ? '720p' : short >= 480 ? '480p' : `${short}p`;
    push({ id: 'resolution', label: 'Resolution', value: short ? `${label} · ${width}×${height}` : '—', status, detail, tip }, pen);
  }

  // Frame rate
  {
    let status: Status = 'great';
    let pen = 0;
    let detail = 'Smooth motion.';
    let tip: string | undefined;
    if (fps < 12) {
      status = 'poor'; pen = 18; detail = 'Choppy video. Motion will stutter.';
      tip = 'Low light makes cameras slow down. Add light in front of you, and close background apps.';
    } else if (fps < 20) {
      status = 'fair'; pen = 9; detail = 'Slightly choppy video.';
      tip = 'More light usually raises the frame rate.';
    } else if (fps < 26) {
      status = 'good'; pen = 3; detail = 'Mostly smooth.';
    }
    push({ id: 'fps', label: 'Frame rate', value: fps > 0 ? `${fps.toFixed(0)} fps` : '—', status, detail, tip }, pen);
  }

  // Lighting
  {
    let status: Status = 'great';
    let pen = 0;
    let detail = 'Well lit. You’re easy to see.';
    let tip: string | undefined;
    const b = s.brightness;
    if (b < 45) {
      status = 'poor'; pen = 22; detail = 'Too dark. You’ll be hard to see and the image will be grainy.';
      tip = 'Face a window or lamp. Light in front of you, not behind.';
    } else if (b < 75) {
      status = 'fair'; pen = 10; detail = 'A bit dim.';
      tip = 'Add a light source in front of you.';
    } else if (b > 205 || s.highlights > 0.2) {
      status = 'fair'; pen = 10; detail = 'Overexposed. Bright areas are washed out.';
      tip = 'Move away from direct sunlight or angle the light so it’s softer.';
    }
    push({ id: 'lighting', label: 'Lighting', value: `${Math.round((b / 255) * 100)}%`, status, detail, tip }, pen);
  }

  // Backlight
  {
    const diff = s.edgeBrightness - s.centerBrightness;
    let status: Status = 'great';
    let pen = 0;
    let detail = 'No strong light behind you.';
    let tip: string | undefined;
    if (diff > 55) {
      status = 'poor'; pen = 14; detail = 'Strong backlight. You may appear as a silhouette.';
      tip = 'Turn so the window or lamp is in front of you, not behind.';
    } else if (diff > 30) {
      status = 'fair'; pen = 6; detail = 'The background is brighter than you.';
      tip = 'Add some light in front of your face.';
    }
    push({ id: 'backlight', label: 'Backlight', value: diff > 30 ? 'Backlit' : 'Even', status, detail, tip }, pen);
  }

  // Contrast
  {
    let status: Status = 'great';
    let pen = 0;
    let detail = 'Good contrast and depth.';
    let tip: string | undefined;
    if (s.contrast < 18) {
      status = 'fair'; pen = 7; detail = 'Flat, low-contrast image (foggy or hazy).';
      tip = 'Wipe the camera lens. Smudges cause haze.';
    }
    push({ id: 'contrast', label: 'Contrast', value: s.contrast < 18 ? 'Flat' : s.contrast > 70 ? 'High' : 'Good', status, detail, tip }, pen);
  }

  // Focus
  {
    let status: Status = 'great';
    let pen = 0;
    let detail = 'Crisp detail.';
    let tip: string | undefined;
    if (s.sharpness < 12) {
      status = 'poor'; pen = 14; detail = 'Blurry image.';
      tip = 'Clean the lens and hold the phone steady about an arm’s length away.';
    } else if (s.sharpness < 35) {
      status = 'fair'; pen = 6; detail = 'Slightly soft focus.';
      tip = 'Wipe the lens with a soft cloth.';
    }
    push({ id: 'focus', label: 'Focus', value: s.sharpness < 12 ? 'Blurry' : s.sharpness < 35 ? 'Soft' : 'Sharp', status, detail, tip }, pen);
  }

  // Color
  {
    const avg = (s.r + s.g + s.b) / 3 || 1;
    const warm = (s.r - s.b) / avg;
    const green = (s.g - (s.r + s.b) / 2) / avg;
    let status: Status = 'great';
    let pen = 0;
    let value = 'Natural';
    let detail = 'Natural colors.';
    let tip: string | undefined;
    if (warm > 0.35) { value = 'Warm'; status = 'good'; pen = 3; detail = 'A warm, orange tint (typical of indoor bulbs).'; tip = 'Daylight or a “cool white” bulb gives more natural skin tones.'; }
    else if (warm < -0.3) { value = 'Cool'; status = 'good'; pen = 3; detail = 'A cool, blue tint.'; tip = 'Warmer light will make skin tones look healthier.'; }
    else if (green > 0.2) { value = 'Green tint'; status = 'fair'; pen = 5; detail = 'A green color cast (often from fluorescent lights).'; }
    push({ id: 'color', label: 'Color', value, status, detail, tip }, pen);
  }

  score = Math.round(Math.max(0, Math.min(100, score)));
  if (metrics.some((m) => m.status === 'fair' || m.status === 'poor')) score = Math.min(score, 89);
  issues.sort((a, b) => b.w - a.w);
  let headline: string;
  if (width === 0) headline = 'No video';
  else if (score >= 90) headline = 'You look great';
  else if (score >= 75) headline = 'Looking good';
  else if (score >= 60) headline = 'Watchable, could be better';
  else headline = 'Fix this before your call';
  const tips = metrics.filter((m) => m.status !== 'great').length;
  const summary = issues.length
    ? issues.slice(0, 2).map((i) => i.t).join(' ')
    : tips
      ? `Your camera is call-ready. ${tips === 1 ? 'One small tip' : `${tips} small tips`} below.`
      : 'Your camera is call-ready.';
  return { score, grade: gradeFor(score), headline, summary, metrics, width, height, fps, stats: s, facing: input.facing };
}
