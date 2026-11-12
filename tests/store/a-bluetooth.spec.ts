import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const OUT = 'store/screenshots/raw';
const HIST = '/tmp/precall-bt-history.json';
mkdirSync(OUT, { recursive: true });

export const relabel = (label: string) => () => {
  const d = Object.getOwnPropertyDescriptor(MediaStreamTrack.prototype, 'label');
  Object.defineProperty(MediaStreamTrack.prototype, 'label', { get() { return this.kind === 'audio' ? 'Bluetooth earbuds' : d?.get?.call(this); } });
};

async function snap(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function runCall(page: Page) {
  await page.goto('/#/call');
  await page.getByRole('button', { name: 'Start test call' }).click();
  await expect(page.getByRole('button', { name: 'Hear yourself' })).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1400);
}

  test.use({
    launchOptions: {
      executablePath: process.env.CHROME_PATH || undefined,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${process.cwd()}/tests/fixtures/person.y4m`,
        `--use-file-for-fake-audio-capture=${process.cwd()}/tests/fixtures/voice-bt.wav`,
      ],
    },
  });
  test('bluetooth report', async ({ page }) => {
    await page.addInitScript(relabel('x'));
    await page.addInitScript(() => localStorage.clear());
    await runCall(page);
    await snap(page, 'bt-top');
    await page.locator('.metric', { hasText: 'Clarity' }).first().scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -140));
    await snap(page, 'bt-clarity');
    await page.getByText('Why you sound like a phone line').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -60));
    await snap(page, 'bt-card');
    const hist = await page.evaluate(() => localStorage.getItem('precall.history.v1'));
    writeFileSync(HIST, hist ?? '[]');
  });
