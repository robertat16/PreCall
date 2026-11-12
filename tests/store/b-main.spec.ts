import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const OUT = 'store/screenshots/raw';
const HIST = '/tmp/precall-bt-history.json';
mkdirSync(OUT, { recursive: true });

export const relabel = (label: string) => () => {
  const d = Object.getOwnPropertyDescriptor(MediaStreamTrack.prototype, 'label');
  Object.defineProperty(MediaStreamTrack.prototype, 'label', { get() { return this.kind === 'audio' ? 'Wired headset' : d?.get?.call(this); } });
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

test('good mic flows', async ({ page }) => {
  await page.addInitScript(relabel('x'));
  const bt = existsSync(HIST) ? readFileSync(HIST, 'utf8') : '[]';
  await page.addInitScript((h) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('precall.history.v1', h);
      sessionStorage.setItem('seeded', '1');
    }
  }, bt);
  // rename the BT entry's device so the compare screen reads naturally
  await page.goto('/');
  await page.evaluate(() => {
    const l = JSON.parse(localStorage.getItem('precall.history.v1') || '[]');
    for (const e of l) { e.device = 'Bluetooth earbuds'; e.createdAt -= 120000; }
    localStorage.setItem('precall.history.v1', JSON.stringify(l));
  });

  await page.goto('/#/call');
  await page.getByRole('button', { name: 'Start test call' }).click();
  await expect(page.getByRole('heading', { name: 'Read this out loud' })).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(2200);
  await snap(page, 'call-speak');
  await expect(page.getByRole('button', { name: 'Hear yourself' })).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    const l = JSON.parse(localStorage.getItem('precall.history.v1') || '[]');
    if (l[0]) l[0].device = 'Wired headset';
    localStorage.setItem('precall.history.v1', JSON.stringify(l));
  });
  await page.evaluate(() => window.scrollBy(0, 110));
  await snap(page, 'call-top');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByText('Tone balance', { exact: true }).last().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -20));
  await snap(page, 'call-tone');

  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem('precall.history.v1') || '[]').map((e: { id: string }) => e.id));
  if (ids.length >= 2) {
    await page.goto(`/#/compare/${ids[1]}/${ids[0]}`);
    await expect(page.getByText(/better by|about the same/)).toBeVisible();
    await snap(page, 'compare');
  }

  await page.goto('/');
  await snap(page, 'home');

  await page.goto('/#/check');
  await page.getByRole('button', { name: 'Begin' }).click();
  await expect(page.getByText('Results', { exact: true })).toBeVisible({ timeout: 40000 });
  await page.waitForTimeout(1400);
  await page.evaluate(() => window.scrollBy(0, 110));
  await snap(page, 'check-summary');

  await page.goto('/#/camera');
  await page.waitForTimeout(1800);
  await snap(page, 'camera-live');
  await page.getByRole('button', { name: 'Analyze' }).click();
  await expect(page.getByText('Breakdown')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1300);
  await page.evaluate(() => window.scrollBy(0, 250));
  await snap(page, 'camera-report');

  await page.goto('/#/mic');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.waitForTimeout(6000);
  await snap(page, 'mic-live');

  await page.goto('/#/about');
  await snap(page, 'about');
  await page.goto('/#/history');
  await snap(page, 'history');
});
