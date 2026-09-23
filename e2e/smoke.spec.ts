import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Run output goes to the ignored directory. artifacts/ holds curated captures
// that are committed, and a test run must never rewrite them.
const SHOTS = 'test-results/screenshots';
mkdirSync(SHOTS, { recursive: true });

const shot = (name: string) => `${SHOTS}/${name}.png`;

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

  // Picks: an already settled market offers no buttons, an open one does.
  await page.getByRole('link', { name: 'Picks', exact: true }).click();
  await expect(page.getByRole('group', { name: /Does the whole crew land/ })).toHaveCount(0);
  await page.getByRole('group', { name: /Do we see three different species/ }).getByRole('button', { name: 'yes' }).click();
  await expect(page.getByText('You called yes.')).toBeVisible();
  await page.screenshot({ path: shot(`${info.project.name}-03-predictions`), fullPage: true });

  // Dock draft, on the same screen: a taken species is unavailable, a free one is claimable.
  await expect(page.getByRole('button', { name: /^Ono/ })).toBeDisabled();
  await page.getByRole('button', { name: /^Mahi-mahi/ }).click();
  await expect(page.getByText('Mahi-mahi is yours.')).toBeVisible();
  await page.screenshot({ path: shot(`${info.project.name}-04-draft`), fullPage: true });

  // Private mission stays behind a tap.
  await page.getByRole('link', { name: 'Mission', exact: true }).click();
  await page.getByRole('button', { name: 'Show my mission' }).click();
  await expect(page.getByTestId('mission-text')).toBeVisible();
  await page.getByRole('button', { name: 'I will do this' }).click();
  await page.screenshot({ path: shot(`${info.project.name}-05-mission`), fullPage: true });

  // Bounty claim, then a witness confirms from the same device.
  await page.getByRole('link', { name: 'Bounties' }).click();
  await page.getByRole('button', { name: /Claim The Callback/ }).click();
  await expect(page.getByText('Kevin is carrying this one.')).toBeVisible();
  await page.screenshot({ path: shot(`${info.project.name}-06-bounties`), fullPage: true });

  await page.getByRole('link', { name: /^You:/ }).click();
  await page.getByLabel('Switch identity').selectOption('Nick');
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('link', { name: 'Bounties' }).click();
  await page.getByRole('button', { name: /confirm for Kevin/ }).click();
  await expect(page.getByText('Kevin did it. Nick saw it.')).toBeVisible();

  // Vault: a story is saved and visible to its author.
  await page.getByRole('link', { name: 'Vault' }).click();
  await page.getByLabel('The story').fill('Nick brought a spare charger for everyone, again.');
  await page.getByRole('button', { name: 'Save to the vault' }).click();
  await expect(page.getByText('Saved to the vault.')).toBeVisible();
  await page.screenshot({ path: shot(`${info.project.name}-09-vault`), fullPage: true });

  // Dinner: an organizer opens it and the award cards print.
  await page.getByRole('link', { name: 'Dinner' }).click();
  await page.getByRole('button', { name: 'Open dinner' }).click();
  await expect(page.getByRole('heading', { name: 'The Quiet Confirm' })).toBeVisible();
  // The organizer reads one story out, and it lands on the table for everyone.
  await page.getByRole('button', { name: 'Read this out' }).first().click();
  await expect(page.getByRole('heading', { name: 'Read out at dinner' })).toHaveCount(1);
  await page.screenshot({ path: shot(`${info.project.name}-07-dinner`), fullPage: true });

  // The whole party survives a reload, because it lives in localStorage.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByText('Nick confirmed The Callback for Kevin.')).toBeVisible();
  await page.screenshot({ path: shot(`${info.project.name}-08-today-feed`), fullPage: true });

  await page.getByRole('link', { name: /^You:/ }).click();
  await page.screenshot({ path: shot(`${info.project.name}-10-you`), fullPage: true });
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

  for (const name of ['Today', 'Picks', 'Bounties', 'Mission', 'Vault', 'Dinner', 'You']) {
    await (name === 'You'
      ? page.getByRole('link', { name: /^You:/ })
      : page.getByRole('link', { name, exact: true })
    ).click();

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

test('a full size phone photo is resized instead of rejected', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Party code').fill('GUO27');
  await page.getByLabel('Who are you').selectOption('Kevin');
  await page.getByRole('button', { name: 'Join the party' }).click();
  await page.getByRole('link', { name: 'Vault' }).click();

  // A noisy 3000x2000 JPEG, which is the shape of a real camera roll file and
  // megabytes once encoded. The old build rejected this on sight.
  const encoded = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 3000;
    canvas.height = 2000;
    const context = canvas.getContext('2d')!;
    const pixels = context.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = (i * 7) % 255;
      pixels.data[i + 1] = (i * 13) % 255;
      pixels.data[i + 2] = (i * 29) % 255;
      pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
  });

  const buffer = Buffer.from(encoded, 'base64');
  expect(buffer.byteLength).toBeGreaterThan(300_000);

  await page
    .getByLabel(/Photo or voice note/)
    .setInputFiles({ name: 'IMG_4821.jpg', mimeType: 'image/jpeg', buffer });

  await expect(page.getByText(/IMG_4821\.jpg attached, \d+ KB/)).toBeVisible();

  await page.getByLabel('The story').fill('The view from the boat.');
  await page.getByRole('button', { name: 'Save to the vault' }).click();
  await expect(page.getByText('Saved to the vault.')).toBeVisible();
  await expect(page.getByRole('img', { name: /Attached to a memory/ })).toBeVisible();
});

test('the whole app opens with no network once it has been visited', async ({ page, context, browserName }) => {
  // Playwright's WebKit cannot emulate offline for a page a service worker
  // controls: reload fails inside the engine before the worker is consulted.
  // Chromium exercises the same worker code, so it carries this check.
  test.skip(browserName === 'webkit', 'Playwright WebKit cannot go offline under a service worker');
  await page.goto('/');
  // Wait until the worker has installed the shell and controls the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve));
    }
  });

  await context.setOffline(true);
  await page.reload();
  await page.getByLabel('Who are you').selectOption('Kevin');
  await page.getByRole('button', { name: 'Join the party' }).click();
  await expect(page.getByRole('heading', { name: 'Call one thing' })).toBeVisible();

  // A deep link with no signal still gets the shell rather than an error page.
  await page.goto('/dinner');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await context.setOffline(false);
});

test('a spectator can follow along with nothing to tap that would be refused', async ({ page }, info) => {
  await page.goto('/');
  await page.getByLabel('Who are you').selectOption('Spectator');
  await page.getByRole('button', { name: 'Join the party' }).click();
  await expect(page.getByRole('heading', { name: 'You are watching' })).toBeVisible();
  await page.screenshot({ path: shot(`${info.project.name}-11-spectator`), fullPage: true });

  await page.getByRole('link', { name: 'Picks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'yes', exact: true })).toHaveCount(0);
});

test('the offline shell only substitutes itself for page navigations', async ({ page }) => {
  await page.goto('/');
  const worker = await (await page.request.get('/sw.js')).text();

  expect(worker).toContain("event.request.mode === 'navigate'");
  expect(worker).toContain('Response.error()');
  // Answers come from this build's cache, and activation clears only this
  // app's old caches, never another app's on the same origin.
  expect(worker).toContain('caches.open(CACHE).then((cache) => cache.match(request');
  expect(worker).toContain("key.startsWith('guo-games-') && key !== CACHE");
});
