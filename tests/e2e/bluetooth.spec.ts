import { expect, test } from '@playwright/test';
import { shot, watchErrors } from './helpers';

test.use({
  launchOptions: {
    executablePath: process.env.CHROME_PATH || undefined,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${process.cwd()}/tests/fixtures/voice-bt.wav`,
    ],
  },
});

test('narrowband Bluetooth-style mic is flagged', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/#/call');
  await page.getByRole('button', { name: 'Start test call' }).click();
  await expect(page.getByRole('button', { name: 'Hear yourself' })).toBeVisible({ timeout: 25000 });
  await page.waitForTimeout(1300);
  await expect(page.getByText(/Narrowband/).first()).toBeVisible();
  const score = Number(await page.locator('.ring .num').first().textContent());
  expect(score).toBeLessThanOrEqual(66);
  await shot(page, '22-call-bluetooth');
  expect(errors).toEqual([]);
});
