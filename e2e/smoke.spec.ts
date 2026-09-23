import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

mkdirSync('artifacts', { recursive: true });

const shot = (name: string) => `artifacts/${name}.png`;

test('a first-time visitor can join and reach their next action', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The Guo Games' })).toBeVisible();
  await page.screenshot({ path: shot(`${info.project.name}-01-join`), fullPage: true });

  await page.getByLabel('Party code').fill('GUO27');
  await page.getByLabel('Who are you').selectOption('Kevin');
  await page.getByRole('button', { name: 'Join the party' }).click();

  await expect(page.getByRole('heading', { name: 'Call one thing' })).toBeVisible();
  await page.screenshot({ path: shot(`${info.project.name}-02-today`), fullPage: true });

  expect(errors).toEqual([]);
});

test('the core loop works end to end in a real browser', async ({ page }, info) => {
  await page.goto('/');
  await page.getByLabel('Party code').fill('GUO27');
  await page.getByLabel('Who are you').selectOption('Kevin');
  await page.getByRole('button', { name: 'Join the party' }).click();

  // Predictions: an already settled market offers no buttons, an open one does.
  await page.getByRole('link', { name: 'Predictions' }).click();
  await expect(page.getByRole('group', { name: /Does the whole crew land/ })).toHaveCount(0);
  await page.getByRole('group', { name: /Do we see three different species/ }).getByRole('button', { name: 'yes' }).click();
  await expect(page.getByText('You called yes.')).toBeVisible();
  await page.screenshot({ path: shot(`${info.project.name}-03-predictions`), fullPage: true });

  // Dock draft: a taken species is unavailable, a free one is claimable.
  await page.getByRole('link', { name: 'Draft', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Ono/ })).toBeDisabled();
  await page.getByRole('button', { name: /^Mahi-mahi/ }).click();
  await expect(page.getByText('Mahi-mahi is yours.')).toBeVisible();
  await page.screenshot({ path: shot(`${info.project.name}-04-draft`), fullPage: true });

  // Private mission stays behind a tap.
  await page.getByRole('link', { name: 'Mission', exact: true }).click();
  await page.getByRole('button', { name: 'Show my mission' }).click();
  await expect(page.getByTestId('mission-text')).toBeVisible();
  await page.getByRole('button', { name: 'I will do this' }).click();

  // Bounty claim, then a witness confirms from the same device.
  await page.getByRole('link', { name: 'Bounties' }).click();
  await page.getByRole('button', { name: /Claim The Callback/ }).click();
  await expect(page.getByText('Kevin is carrying this one.')).toBeVisible();

  await page.getByRole('link', { name: 'You', exact: true }).click();
  await page.getByLabel('Switch identity').selectOption('Nick');
  await page.getByRole('link', { name: 'Bounties' }).click();
  await page.getByRole('button', { name: /confirm for Kevin/ }).click();
  await expect(page.getByText('Kevin did it. Nick saw it.')).toBeVisible();

  // Vault: a story is saved and visible to its author.
  await page.getByRole('link', { name: 'Vault' }).click();
  await page.getByLabel('The story').fill('Nick brought a spare charger for everyone, again.');
  await page.getByRole('button', { name: 'Save to the vault' }).click();
  await expect(page.getByText('Saved to the vault.')).toBeVisible();

  // Dinner: an organizer opens it and the award cards print.
  await page.getByRole('link', { name: 'Dinner' }).click();
  await page.getByRole('button', { name: 'Open dinner' }).click();
  await expect(page.getByRole('heading', { name: 'The Quiet Confirm' })).toBeVisible();
  await page.screenshot({ path: shot(`${info.project.name}-07-dinner`), fullPage: true });

  // The whole party survives a reload, because it lives in localStorage.
  await page.reload();
  await page.getByRole('link', { name: 'Feed' }).click();
  await expect(page.getByText('Nick confirmed The Callback for Kevin.')).toBeVisible();
  await page.screenshot({ path: shot(`${info.project.name}-08-feed`), fullPage: true });
});

test('the app ships an installable manifest and an offline shell', async ({ page }) => {
  await page.goto('/');

  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).name).toBe('The Guo Games');

  const worker = await page.request.get('/sw.js');
  expect(worker.ok()).toBe(true);
  expect(await worker.text()).toContain('guo-games-');

  // Deep links must reach the app rather than a 404, which is what the
  // Vercel rewrite is for.
  const deep = await page.goto('/dinner');
  expect(deep?.status()).toBeLessThan(400);
});

test('the join form can be completed with a keyboard alone', async ({ page }) => {
  await page.goto('/');
  // The code is prefilled, so a keyboard user tabs from it and submits.
  await page.getByLabel('Party code').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: /Call one thing/ })).toBeVisible();
  await expect(page.locator(':focus')).toHaveCount(1);
});

test('every control is labelled and every image has alternative text', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Party code').fill('GUO27');
  await page.getByLabel('Who are you').selectOption('Deniz');
  await page.getByRole('button', { name: 'Join the party' }).click();

  for (const name of ['Today', 'Predictions', 'Draft', 'Bounties', 'Mission', 'Vault', 'Dinner', 'Feed', 'You']) {
    await page.getByRole('link', { name, exact: true }).click();

    const unlabelled = await page.locator('input:not([type=hidden]), select, textarea').evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const id = node.getAttribute('id');
          const labelled =
            (id && document.querySelector(`label[for="${id}"]`)) ||
            node.closest('label') ||
            node.getAttribute('aria-label') ||
            node.getAttribute('aria-labelledby');
          return !labelled;
        })
        .map((node) => node.outerHTML.slice(0, 80)),
    );
    expect(unlabelled, `unlabelled controls on ${name}`).toEqual([]);

    const imagesWithoutAlt = await page
      .locator('img:not([alt])')
      .evaluateAll((nodes) => nodes.map((node) => node.outerHTML.slice(0, 80)));
    expect(imagesWithoutAlt, `images without alt on ${name}`).toEqual([]);

    // Exactly one h1 and one h2 per screen keeps the outline navigable.
    expect(await page.locator('h1').count(), `h1 count on ${name}`).toBe(1);
    expect(await page.locator('h2').count(), `h2 count on ${name}`).toBe(1);
  }
});
