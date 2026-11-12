import { expect, test } from '@playwright/test';
import { shot, watchErrors } from './helpers';

test('home renders and every screen opens without errors', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Run full check' })).toBeVisible();
  await shot(page, '01-home');
  for (const [hash, name, heading] of [
    ['#/call', '02-call-intro', 'Echo test call'],
    ['#/mic', '03-mic-intro', 'Live mic monitor'],
    ['#/speaker', '04-speaker', 'Speakers & headphones'],
    ['#/history', '05-history-empty', 'History'],
    ['#/about', '06-about', 'About & privacy'],
    ['#/check', '07-check-intro', 'One-minute call check'],
  ] as const) {
    await page.goto(`/${hash}`);
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    await shot(page, name);
  }
  expect(errors).toEqual([]);
});

test('live mic shows levels and spectrum', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/#/mic');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await page.waitForTimeout(2500);
  const readout = await page.locator('.big-readout').textContent();
  expect(readout).not.toBe('—');
  await shot(page, '08-mic-live');
  expect(errors).toEqual([]);
});

test('test call records, scores and plays back', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/#/call');
  await page.getByRole('button', { name: 'Start test call' }).click();
  await expect(page.getByRole('heading', { name: 'Stay quiet' })).toBeVisible({ timeout: 5000 });
  await shot(page, '09-call-quiet');
  await expect(page.getByRole('heading', { name: 'Read this out loud' })).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(2500);
  await shot(page, '10-call-speak');
  await expect(page.getByRole('button', { name: 'Hear yourself' })).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(1300);
  await shot(page, '11-call-report');
  const score = Number(await page.locator('.ring .num').first().textContent());
  expect(score).toBeGreaterThan(70);
  await page.getByRole('button', { name: 'Hear yourself' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
  // history has it
  await page.goto('/#/history');
  await expect(page.locator('.hist-item')).toHaveCount(1);
  await shot(page, '12-history');
  await page.locator('.hist-item').first().click();
  await expect(page.getByText('Breakdown')).toBeVisible();
  await shot(page, '13-report');
  expect(errors).toEqual([]);
});

test('camera analyzes', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/#/camera');
  await expect(page.locator('.cam video')).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, '14-camera-live');
  await page.getByRole('button', { name: 'Analyze' }).click();
  await expect(page.getByText('Breakdown')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await shot(page, '15-camera-report');
  expect(errors).toEqual([]);
});

test('video test call records and plays back', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/#/video');
  await page.waitForTimeout(1500);
  await shot(page, '16-video-live');
  await page.getByRole('button', { name: /Record 10s/ }).click();
  await expect(page.getByRole('heading', { name: 'Watch it back' })).toBeVisible({ timeout: 25000 });
  await shot(page, '17-video-playback');
  expect(errors).toEqual([]);
});

test('full check end to end', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/#/check');
  await page.getByRole('button', { name: 'Begin' }).click();
  await expect(page.getByRole('heading', { name: 'Listen for a short tone' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('CAMERA', { exact: true })).toBeVisible({ timeout: 15000 });
  await shot(page, '18-check-camera');
  await expect(page.getByText('Results', { exact: true })).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(1300);
  await shot(page, '19-check-summary');
  await page.getByRole('button', { name: /Microphone/ }).click();
  await shot(page, '20-check-expanded');
  expect(errors).toEqual([]);
});

test('speaker tones and sweep', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/#/speaker');
  await page.getByRole('button', { name: /^Left/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Start sweep' }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'I can’t hear it' }).click();
  await expect(page.getByText(/Stopped at/)).toBeVisible();
  await shot(page, '21-speaker-sweep');
  expect(errors).toEqual([]);
});
