import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'test-results/screenshots';
mkdirSync(SHOTS, { recursive: true });
const shot = (name: string) => `${SHOTS}/${name}.png`;

async function join(page: Page, who: string) {
  await page.getByLabel('Who are you').selectOption(who);
  await page.getByRole('button', { name: 'Join the party' }).click();
}

const wallet = (page: Page) =>
  page.evaluate(() => {
    const party = JSON.parse(localStorage.getItem('guo-games/party') ?? '{}');
    return (party.trades ?? []).map((trade: { buyer: string; side: string; cents: number }) => `${trade.buyer} ${trade.side} ${trade.cents}`);
  });

test('a market opens, trades, closes and resolves, and the winner is paid once', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/');
  // Kevin, because the demo party leaves him untouched.
  await join(page, 'Kevin');

  // Open a market from Picks.
  await page.getByRole('link', { name: 'Picks', exact: true }).click();
  await page.getByLabel('A yes or no question').fill('Does the best man mention the boat?');
  await page.getByLabel('Closes (optional)').fill('End of speeches');
  await page.getByRole('button', { name: 'Open market' }).click();
  const market = page.locator('article', { has: page.getByRole('heading', { name: 'Does the best man mention the boat?' }) });
  await expect(market.getByRole('button', { name: 'Yes 50¢' })).toBeVisible();

  // Buy Yes for $25; the price moves and the balance drops.
  await market.getByRole('button', { name: 'Yes 50¢' }).click();
  await market.getByRole('button', { name: '$25' }).click();
  await expect(market.getByText(/Pays \$[\d.]+ if Yes\./)).toBeVisible();
  await market.screenshot({ path: shot(`${info.project.name}-markets-01-quote`) });
  await market.getByRole('button', { name: 'Buy Yes for $25' }).click();
  await expect(page.getByRole('heading', { name: 'You have $75.00' })).toBeVisible();
  await expect(market.getByRole('button', { name: /^Yes (7|8)\d¢/ })).toBeVisible();

  // A Clerk closes trading, then resolves after confirming.
  await page.getByRole('link', { name: /^You:/ }).click();
  await page.getByLabel('Switch identity').selectOption('Nick');
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('link', { name: 'Picks', exact: true }).click();
  await market.getByRole('button', { name: 'Close trading' }).click();
  await expect(market.getByText('Trading closed')).toBeVisible();
  await market.getByRole('button', { name: 'Resolve Yes' }).click();
  await market.getByRole('button', { name: 'Yes, resolve Yes' }).click();
  await expect(market.getByText('Resolved Yes', { exact: true })).toBeVisible();
  await expect(market.getByRole('button', { name: /Resolve/ })).toHaveCount(0);
  await page.locator('#markets').locator('..').screenshot({ path: shot(`${info.project.name}-markets-02-resolved`) });

  // Kevin was paid, and the feed has the audit trail.
  await page.getByRole('link', { name: /^You:/ }).click();
  await page.getByLabel('Switch identity').selectOption('Kevin');
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('link', { name: 'Picks', exact: true }).click();
  const title = (await page.getByRole('heading', { name: /^You have \$/ }).textContent()) ?? '';
  expect(Number(title.replace(/[^\d.]/g, ''))).toBeGreaterThan(100);
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByText('Resolved Yes, winning shares pay $1: Does the best man mention the boat?')).toBeVisible();
  expect(errors).toEqual([]);
});

test('two tabs on one phone trade the same market without losing a buy', async ({ page, context }) => {
  await page.goto('/');
  await join(page, 'Deniz');
  await page.getByRole('link', { name: 'Picks', exact: true }).click();

  const second = await context.newPage();
  await second.goto('/#picks/markets');
  const inSecond = second.locator('article', { has: second.getByRole('heading', { name: 'Does the DJ play the Macarena?' }) });
  await inSecond.getByRole('button', { name: /^No \d+¢/ }).click();
  await inSecond.getByRole('button', { name: 'Buy No for $5' }).click();
  await expect(second.getByRole('heading', { name: 'You have $95.00' })).toBeVisible();

  // The first tab catches up without a reload, then buys on top.
  await expect(page.getByRole('heading', { name: 'You have $95.00' })).toBeVisible();
  const inFirst = page.locator('article', { has: page.getByRole('heading', { name: 'Does the DJ play the Macarena?' }) });
  await inFirst.getByRole('button', { name: /^Yes \d+¢/ }).click();
  await inFirst.getByRole('button', { name: 'Buy Yes for $5' }).click();
  await expect(page.getByRole('heading', { name: 'You have $90.00' })).toBeVisible();

  expect(await wallet(page)).toEqual(['Simon yes 1000', 'Jack no 500', 'Deniz no 500', 'Deniz yes 500']);
  await expect(second.getByRole('heading', { name: 'You have $90.00' })).toBeVisible();
});
