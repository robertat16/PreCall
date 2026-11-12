import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

export async function shot(page: Page, name: string) {
  mkdirSync('test-results/shots', { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test-results/shots/${name}.png`, fullPage: true });
}
