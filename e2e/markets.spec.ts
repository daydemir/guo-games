import { expect, test } from '@playwright/test';
import type { Browser, Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'test-results/screenshots';
mkdirSync(SHOTS, { recursive: true });
const shot = (name: string) => `${SHOTS}/${name}.png`;

/** Live updates arrive by polling every few seconds; this is the most a player should wait. */
const LIVE = { timeout: 10_000 };

async function join(page: Page, who: string) {
  await page.getByLabel('Who are you').selectOption(who);
  await page.getByRole('button', { name: 'Join the party' }).click();
}

/** A second phone: its own browser context, so nothing is shared but the server. */
async function phone(browser: Browser, info: TestInfo): Promise<Page> {
  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = info.project.use;
  const context = await browser.newContext({ viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, reducedMotion: 'reduce' });
  return context.newPage();
}

const market = (page: Page, question: string) => page.locator('article', { has: page.getByRole('heading', { name: question }) });
const cash = async (page: Page) => Number(((await page.getByRole('heading', { name: /^You have \$/ }).textContent()) ?? '').replace(/[^\d.]/g, ''));

test('two phones share one board: a Clerk starts it, a player joins by link, trades show up live, and the Clerk settles', async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  // Deniz, a Clerk, starts the markets and copies the party link.
  await page.goto('./');
  await join(page, 'Deniz');
  await page.getByRole('link', { name: 'Picks', exact: true }).click();
  await page.getByRole('button', { name: 'Start the markets' }).click();
  await expect(page.getByRole('heading', { name: 'You have $100.00' })).toBeVisible();
  const link = await page.getByLabel('Party link').inputValue();
  expect(link).toMatch(/#live\/[A-Za-z0-9_-]{22}$/);

  // Jack taps the link on his own phone and lands on the markets.
  const jack = await phone(browser, info);
  jack.on('pageerror', (error) => errors.push(String(error)));
  await jack.goto(link);
  await join(jack, 'Jack');
  await expect(jack.getByRole('heading', { name: 'You have $100.00' })).toBeVisible();
  expect(new URL(jack.url()).hash).toBe('');

  // Deniz opens a market; it reaches Jack without a reload.
  const question = 'Does the best man mention the boat?';
  await page.getByLabel('A yes or no question').fill(question);
  await page.getByLabel('Closes (optional)').fill('End of speeches');
  await page.getByRole('button', { name: 'Open market' }).click();
  await expect(market(page, question).getByRole('button', { name: 'Yes 50¢' })).toBeVisible();
  let sent = Date.now();
  await expect(market(jack, question).getByRole('button', { name: 'Yes 50¢' })).toBeVisible(LIVE);
  const reachedJack = Date.now() - sent;

  // Jack buys Yes for $25; Deniz sees the price move and the trade.
  await market(jack, question).getByRole('button', { name: 'Yes 50¢' }).click();
  await market(jack, question).getByRole('button', { name: '$25' }).click();
  await expect(market(jack, question).getByText(/Pays \$[\d.]+ if Yes\./)).toBeVisible();
  await market(jack, question).screenshot({ path: shot(`${info.project.name}-markets-01-quote`) });
  await market(jack, question).getByRole('button', { name: 'Buy Yes for $25' }).click();
  await expect(jack.getByRole('heading', { name: 'You have $75.00' })).toBeVisible();
  sent = Date.now();
  await expect(market(page, question).getByRole('button', { name: /^Yes (7|8)\d¢/ })).toBeVisible(LIVE);
  await expect(page.getByText(`Jack bought Yes: ${question}`)).toBeVisible();
  const reachedDeniz = Date.now() - sent;

  // Deniz closes trading, then resolves Yes behind a second tap.
  await market(page, question).getByRole('button', { name: 'Close trading' }).click();
  await expect(market(jack, question).getByText('Trading closed')).toBeVisible(LIVE);
  await market(page, question).getByRole('button', { name: 'Resolve Yes' }).click();
  await market(page, question).getByRole('button', { name: 'Yes, resolve Yes' }).click();
  await expect(market(page, question).getByText('Resolved Yes', { exact: true })).toBeVisible();

  // Jack is paid once, and both phones agree on the standings.
  await expect(market(jack, question).getByText('Resolved Yes', { exact: true })).toBeVisible(LIVE);
  await expect(jack.getByRole('heading', { name: /^You have \$1[0-9]{2}\.\d\d$/ })).toBeVisible();
  const paid = await cash(jack);
  expect(paid).toBeGreaterThan(100);
  const net = `+$${(paid - 100).toFixed(2)}`;
  for (const phone of [page, jack]) {
    await expect(phone.getByRole('list', { name: 'Standings' }).getByRole('listitem').first()).toContainText(net);
  }
  await jack.locator('#markets').locator('..').screenshot({ path: shot(`${info.project.name}-markets-02-resolved`) });

  console.log(`[${info.project.name}] market reached Jack in ${reachedJack} ms, his trade reached Deniz in ${reachedDeniz} ms, Jack ended on $${paid.toFixed(2)}`);
  expect(errors).toEqual([]);
  await jack.context().close();
});
