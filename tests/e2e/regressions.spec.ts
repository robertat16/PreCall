import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

const trackStreams = () => {
  const w = window as unknown as { __streams: MediaStream[] };
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  w.__streams = [];
  navigator.mediaDevices.getUserMedia = async (c) => {
    const s = await orig(c);
    w.__streams.push(s);
    return s;
  };
};
const liveTracks = () =>
  (window as unknown as { __streams: MediaStream[] }).__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live').length;

test('camera is released when leaving while it is still starting', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __streams: MediaStream[] };
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    w.__streams = [];
    navigator.mediaDevices.getUserMedia = async (c) => {
      const s = await orig(c);
      w.__streams.push(s);
      await new Promise((r) => setTimeout(r, 1200));
      return s;
    };
  });
  await page.goto('/#/');
  await page.evaluate(() => (location.hash = '#/camera'));
  await page.waitForTimeout(300);
  await page.evaluate(() => (location.hash = '#/'));
  await page.waitForTimeout(2500);
  expect(await page.evaluate(liveTracks)).toBe(0);
});

test('a silent mic result can be reopened from history', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => new AudioContext().createMediaStreamDestination().stream;
  });
  await page.goto('/#/call');
  await page.getByRole('button', { name: 'Start test call' }).click();
  await expect(page.getByRole('heading', { name: 'We couldn’t hear you' })).toBeVisible({ timeout: 40000 });
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('precall.history.v1')!)[0].id);
  await page.goto(`/#/report/${id}`);
  await expect(page.getByText('Technical details')).toBeVisible();
  expect(errors).toEqual([]);
});

test('backgrounding mid-test releases the mic and saves nothing', async ({ page }) => {
  await page.addInitScript(trackStreams);
  await page.addInitScript(() => {
    const w = window as unknown as { __hidden: boolean };
    w.__hidden = false;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { if (!w.__hidden) cb(t); });
  });
  await page.goto('/#/call');
  await page.getByRole('button', { name: 'Start test call' }).click();
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    (window as unknown as { __hidden: boolean }).__hidden = true;
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(liveTracks)).toBe(0);
  await page.waitForTimeout(12000);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('precall.history.v1') || '[]').length)).toBe(0);
});

test('two results can be compared side by side', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.evaluate(() => {
    const m = (score: number, clarity: 'great' | 'poor') => ({
      voiceDetected: true, score, grade: 'x', headline: 'h', summary: 's', speechLevelDb: -25, peakDb: -8, noiseFloorDb: -65, snrDb: 40,
      bandwidthHz: clarity === 'great' ? 19000 : 3600, bandwidthClass: clarity === 'great' ? 'fullband' : 'narrowband',
      tone: { bassDb: 0, midDb: 0, trebleDb: 0, label: 'Balanced' }, humHz: null, clicksPerSec: 0, dropouts: 0, clipPercent: 0, spectrum: [], sampleRate: 48000,
      metrics: [{ id: 'clarity', label: 'Clarity', value: clarity === 'great' ? 'Full range · 19 kHz' : 'Phone-line · 3.6 kHz', status: clarity, detail: '' }],
    });
    const now = Date.now();
    localStorage.setItem('precall.history.v1', JSON.stringify([
      { id: 'b', kind: 'mic', createdAt: now, device: 'Wired', score: 96, mic: m(96, 'great') },
      { id: 'a', kind: 'mic', createdAt: now - 60000, device: 'Buds', score: 62, mic: m(62, 'poor') },
    ]));
  });
  await page.goto('/#/history');
  await page.getByRole('button', { name: 'Compare two results' }).click();
  await page.locator('.hist-item').nth(0).click();
  await page.locator('.hist-item').nth(1).click();
  await expect(page.getByText(/sounds better by 34 points: full range vs phone-line audio/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('face detection loads on-device and shows a framing hint', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/#/camera');
  await expect(page.locator('.cam .hud').getByText(/Can’t see your face|Well framed|Move|Center|Lower|Raise/)).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Analyze' }).click();
  await expect(page.getByText('Breakdown')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.metric', { hasText: 'Framing' })).toBeVisible();
  expect(errors.filter((e) => !/WebGL|webgl|GPU/i.test(e))).toEqual([]);
});
