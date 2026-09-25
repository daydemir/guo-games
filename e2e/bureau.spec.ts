import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const SHOTS = 'test-results/screenshots';
mkdirSync(SHOTS, { recursive: true });
const shot = (name: string) => `${SHOTS}/${name}.png`;

async function join(page: Page, who: string) {
  await page.getByLabel('Who are you').selectOption(who);
  await page.getByRole('button', { name: 'Join the party' }).click();
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('the Bureau opens a case, files an incident, and strikes it', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await join(page, 'Deniz');

  await expect(page.getByText(/Case GUO-27/).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Act I: Intake' })).toBeVisible();
  await page.screenshot({ path: shot(`${info.project.name}-bureau-01-today`), fullPage: true });

  await page.getByRole('button', { name: 'II Investigation' }).click();
  await expect(page.getByRole('heading', { name: 'Act II: The Investigation' })).toBeVisible();

  await page.getByLabel('What happened').fill('2114. Lime shortage, galley. One witness.');
  await page.getByRole('button', { name: 'File it' }).click();
  await expect(page.getByText('Filed as INC-0001.')).toBeVisible();
  await expect(page.locator('.case-file')).toContainText('INC-0001');
  await page.screenshot({ path: shot(`${info.project.name}-bureau-02-case-file`), fullPage: true });

  await page.getByRole('button', { name: 'Strike INC-0001 from the record' }).click();
  await expect(page.locator('.case-file')).toHaveCount(0);
  await expect(page.getByText('An entry was struck from the record.')).toBeVisible();
  await expect(page.getByText('Lime shortage')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Seven Witnesses testify on one phone and are read out without names', async ({ page }, info) => {
  await page.goto('/#card/witness');
  await join(page, 'Nick');
  await expect(page.getByRole('heading', { level: 2, name: 'Seven Witnesses' })).toBeVisible();

  await page.getByLabel('Name one small thing that just happened').fill('The cooler lid');
  await page.getByRole('button', { name: 'Open testimony' }).click();

  const accounts = [
    ['Kevin', 'It opened itself. I was elsewhere.'],
    ['Simon', 'The lid acted alone, in my professional opinion.'],
    ['Dmitriy', 'Oooooo. The lid. Oooooo.'],
  ];
  for (const [who, words] of accounts) {
    await page.getByLabel('Who is holding the phone?').selectOption(who);
    await page.getByLabel('Your testimony (twelve words or fewer)').fill(words);
    await page.getByRole('button', { name: 'Swear to it' }).click();
    await expect(page.getByText('Sworn. Hand the phone on. Do not read ahead.')).toBeVisible();
  }
  await expect(page.getByText('3 of 7 witnesses have testified.', { exact: false })).toBeVisible();
  await page.screenshot({ path: shot(`${info.project.name}-bureau-03-witness-intake`), fullPage: true });

  // At the Tribunal, the Clerk leaves the Bench and opens the reveal from a memo link.
  await page.getByRole('button', { name: 'Leave the Bench' }).click();
  await page.goto('/#card/witness-reveal');
  await page.getByRole('button', { name: 'Read the testimony' }).click();
  const stage = page.getByRole('main');
  await expect(stage.getByRole('heading', { name: /^Testimony of the / })).toHaveCount(3);
  for (const [, words] of accounts) await expect(stage.getByText(words)).toBeVisible();
  for (const name of ['Kevin', 'Simon', 'Dmitriy', 'Nick']) await expect(stage).not.toContainText(name);
  await page.screenshot({ path: shot(`${info.project.name}-bureau-04-witness-reveal`), fullPage: true });
});

test('a Tribunal vote from a deep link lands in the Case File', async ({ page }, info) => {
  await page.goto('/#card/exhibit-a');
  await join(page, 'Deniz');
  await expect(page.getByRole('heading', { level: 2, name: 'Exhibit A' })).toBeFocused();

  const hands = page.getByRole('group', { name: /Show of hands/ });
  for (let i = 0; i < 4; i += 1) await hands.getByRole('button', { name: /Authentic/ }).click();
  for (let i = 0; i < 2; i += 1) await hands.getByRole('button', { name: /Forgery/ }).click();
  await page.screenshot({ path: shot(`${info.project.name}-bureau-05-vote`), fullPage: true });
  await page.getByRole('button', { name: 'Enter the verdict' }).click();
  await expect(page.getByText('Entered as VER-0001.')).toBeVisible();

  // Keyboard: Exhibit A closes Act II, so the arrow goes back a card, and Escape leaves.
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('heading', { level: 2, name: 'Seven Witnesses' })).toBeFocused();
  await expect(page).toHaveURL(/#card\/witness$/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.case-file')).toContainText('VER-0001');
  await expect(page.locator('.case-file')).toContainText('Exhibit A ruled Authentic, 4 to 2.');
});

test('a Classified Order stays with its owner', async ({ page }, info) => {
  await page.goto('/');
  await join(page, 'Jack');
  await page.getByRole('link', { name: 'Mission', exact: true }).click();
  await page.getByRole('button', { name: 'Break the seal' }).click();
  const phrase = (await page.getByTestId('contraband-text').textContent()) ?? '';
  expect(phrase).toContain('pelagic');
  await page.screenshot({ path: shot(`${info.project.name}-bureau-06-classified`), fullPage: true });

  await page.getByRole('link', { name: /^You:/ }).click();
  await page.getByLabel('Switch identity').selectOption('Nick');
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('link', { name: 'Mission', exact: true }).click();
  await expect(page.getByTestId('contraband-text')).toHaveCount(0);

  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: /Show all/ }).first().click();
  await expect(page.getByText('pelagic')).toHaveCount(0);
});

test('a save from before the Bureau opens straight to Today, with its history intact', async ({ page }) => {
  const save = readFileSync('e2e/fixtures/pre-bureau-save.json', 'utf8');
  await page.addInitScript((raw) => {
    if (!localStorage.getItem('guo-games/party')) localStorage.setItem('guo-games/party', raw);
  }, save);
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 2, name: 'Today' })).toBeVisible();
  await expect(page.getByText('Jack drafted Marlin.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Act I: Intake' })).toBeVisible();
  await expect(page.getByText('A story you abandoned will be requested.')).toBeVisible();
  await expect(page.getByText(/could not be read/)).toHaveCount(0);
});

test('every Bench card renders, and the whole deck fits a phone without sideways scroll', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await join(page, 'Deniz');
  for (const act of ['I Intake', 'II Investigation', 'III Tribunal', 'IV Release']) {
    await page.getByRole('link', { name: 'Today', exact: true }).click();
    await page.getByRole('button', { name: act }).click();
    await page.getByRole('button', { name: 'Convene the Bench' }).click();
    const next = page.getByRole('button', { name: 'Next card' });
    for (let i = 0; i < 12; i += 1) {
      const width = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(width, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(0);
      if ((await next.count()) === 0) break;
      await next.click();
    }
    await page.screenshot({ path: shot(`${info.project.name}-bureau-07-last-card-act-${act.split(' ')[0]}`), fullPage: true });
    await page.getByRole('button', { name: 'Adjourn' }).click();
  }
  expect(errors).toEqual([]);
});
