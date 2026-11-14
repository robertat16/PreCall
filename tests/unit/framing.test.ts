import { describe, expect, it } from 'vitest';
import { framingMetric, judgeFraming, visibleRect } from '../../src/camera/framing';
import { analyzeCamera } from '../../src/camera/analysis';

describe('framing', () => {
  it('centered, well-sized face is good', () => {
    expect(judgeFraming({ x: 0.33, y: 0.25, w: 0.34, h: 0.34 }).issue).toBe('none');
  });
  it('face filling the screen is too close', () => {
    expect(judgeFraming({ x: -0.1, y: -0.05, w: 1.1, h: 0.9 }).issue).toBe('close');
  });
  it('tiny face is too far', () => {
    expect(judgeFraming({ x: 0.45, y: 0.35, w: 0.1, h: 0.1 }).issue).toBe('far');
  });
  it('face at the side is off-center', () => {
    expect(judgeFraming({ x: 0.02 + 0.01, y: 0.3, w: 0.25, h: 0.28 }).issue).toBe('left');
  });
  it('no face', () => {
    const r = framingMetric([null, null, null], true);
    expect(r?.metric.status).toBe('poor');
  });
  it('skipped when detection unavailable', () => {
    expect(framingMetric([], false)).toBeNull();
  });
  it('visible rect for cover crop', () => {
    const r = visibleRect(1280, 720, 300, 400); // landscape video in portrait box
    expect(Math.round(r.w)).toBe(540);
    expect(Math.round(r.h)).toBe(720);
  });
  it('close-up lowers the camera score and is called out', () => {
    const stats = { brightness: 130, contrast: 45, highlights: 0, shadows: 0, centerBrightness: 130, edgeBrightness: 130, sharpness: 80, r: 130, g: 128, b: 125 };
    const ok = analyzeCamera({ stats, width: 1280, height: 720, fps: 30, facing: 'user', faces: [{ x: 0.33, y: 0.25, w: 0.34, h: 0.34 }], faceDetection: true });
    const close = analyzeCamera({ stats, width: 1280, height: 720, fps: 30, facing: 'user', faces: [{ x: -0.1, y: -0.05, w: 1.1, h: 0.9 }], faceDetection: true });
    expect(ok.score).toBeGreaterThanOrEqual(90);
    expect(ok.headline).toBe('You look great');
    expect(close.score).toBeLessThan(90);
    expect(close.headline).toBe('Looking good, with one fix');
    expect(close.summary).toMatch(/^One thing to improve: you’re too close/);
  });
  it('headline never says plain "looking good" while flagging an issue', () => {
    const stats = { brightness: 130, contrast: 45, highlights: 0, shadows: 0, centerBrightness: 130, edgeBrightness: 130, sharpness: 80, r: 130, g: 128, b: 125 };
    const choppy = analyzeCamera({ stats, width: 1280, height: 720, fps: 16, facing: 'user' });
    expect(choppy.headline).toBe('Looking good, with one fix');
    expect(choppy.summary).toBe('One thing to improve: slightly choppy video.');
  });
});
