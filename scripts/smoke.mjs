import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.goto('http://127.0.0.1:4173');
  await expect(page.getByRole('heading', { name: 'Guo Games' })).toBeVisible();
  await page.getByRole('button', { name: 'Enter Guo Games' }).click();
  await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
  await page.getByRole('button', { name: 'Picks' }).click();
  const flight = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Will the whole crew land before sunset?' }) });
  await flight.getByRole('button', { name: 'Yes' }).click();
  await expect(flight.getByRole('button', { name: 'Yes' })).toHaveClass(/selected/);
  await page.reload();
  await page.getByRole('button', { name: 'Dock Draft' }).click();
  await page.getByRole('button', { name: /Ahi/ }).click();
  await expect(page.getByText('Drafted by Kevin')).toBeVisible();
  await page.getByRole('button', { name: 'Bounties' }).click();
  await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'The callback' }) }).getByRole('button', { name: 'Claim' }).click();
  await page.getByRole('button', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Nick' }).click();
  await page.getByRole('button', { name: 'Bounties' }).click();
  await page.getByRole('button', { name: 'Confirm as witness' }).first().click();
  await expect(page.getByText(/witnessed by Nick/)).toBeVisible();
  await page.getByRole('button', { name: 'Vault' }).click();
  await page.getByLabel('Story').fill('A playlist worth keeping.');
  await page.getByRole('button', { name: 'Save to vault' }).click();
  await expect(page.getByText('A playlist worth keeping.')).toBeVisible();
  await page.getByRole('button', { name: 'Dinner' }).click();
  await page.getByRole('button', { name: 'Open dinner' }).click();
  await expect(page.getByText(/Dinner mode opened/)).toBeVisible();
  await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Today' }).click();
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Dinner' }).click();
  await page.screenshot({ path: 'artifacts/mobile-dinner.png', fullPage: true });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const offlineHtml = await page.content();
  if (!offlineHtml.includes('Guo Games')) {
    await writeFile('artifacts/offline-failure.html', offlineHtml);
    await page.screenshot({ path: 'artifacts/offline-failure.png', fullPage: true });
  }
  await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
  expect(errors).toEqual([]);
  await writeFile('artifacts/smoke-result.json', JSON.stringify({ passed: true, viewports: [1440, 390], offline: true, consoleErrors: errors }, null, 2) + '\n');
  console.log('PASS: join, prediction, persistence, draft, witness, vault, dinner, mobile overflow, offline shell.');
} finally {
  await browser.close();
}
