/** @vitest-environment happy-dom */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from './App';
import { LIVE_KEY } from './useMarkets';
import { createApp } from '../../server/app.ts';
import { openStore } from '../../server/store.ts';
import type { Ledger } from '../core/market';

/**
 * These run the screens against the real market server, in-process, so what
 * is tested is what a phone does: every price and balance comes back from it.
 */
let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer(createApp({ store: openStore(mkdtempSync(join(tmpdir(), 'guo-screen-'))), origins: [location.origin], limits: { createsPerAddress: 100 } }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
  vi.stubEnv('VITE_MARKETS_URL', base);
});
afterEach(() => vi.unstubAllEnvs());

async function newParty(): Promise<string> {
  const response = await fetch(`${base}/parties`, { method: 'POST' });
  return ((await response.json()) as { key: string }).key;
}

/** What another phone on the same party does, straight to the server. */
async function elsewhere(key: string, who: string, command: Record<string, unknown>): Promise<Ledger> {
  const response = await fetch(`${base}/party`, {
    method: 'POST',
    headers: { 'x-party-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ who, command }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Ledger;
}

async function joinAs(who: string) {
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText(/who are you/i), who);
  await user.click(screen.getByRole('button', { name: /join the party/i }));
  return user;
}

const card = (question: string) => within(screen.getByRole('heading', { name: question }).closest('article')!);

it('lets a Clerk start the markets and hands over a party link', async () => {
  render(<App />);
  const user = await joinAs('Deniz');
  await user.click(screen.getByRole('link', { name: /^picks$/i }));

  expect(screen.getByRole('heading', { name: 'Not connected yet' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Start the markets' }));

  await screen.findByRole('heading', { name: 'You have $100.00' });
  expect(screen.getByRole('status').textContent).toBe('The markets are live. Share the party link in the group chat.');
  const link = (screen.getByLabelText('Party link') as HTMLInputElement).value;
  expect(link).toMatch(/#live\/[A-Za-z0-9_-]{22}$/);
  expect(localStorage.getItem(LIVE_KEY)).toBe(link.split('#live/')[1]);
});

it('tells a player without the link where to find it, and offers them no start button', async () => {
  render(<App />);
  const user = await joinAs('Jack');
  await user.click(screen.getByRole('link', { name: /^picks$/i }));
  expect(screen.getByText(/Tap the one Deniz or Nick posted in the group chat/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Start the markets' })).toBeNull();
});

it('takes a pasted party link, for an app opened from the home screen', async () => {
  const key = await newParty();
  render(<App />);
  const user = await joinAs('Simon');
  await user.click(screen.getByRole('link', { name: /^picks$/i }));
  await user.type(screen.getByLabelText(/paste the party link/i), 'not a link');
  await user.click(screen.getByRole('button', { name: 'Join the markets' }));
  expect(screen.getByText(/That is not a party link/)).toBeTruthy();

  await user.clear(screen.getByLabelText(/paste the party link/i));
  await user.type(screen.getByLabelText(/paste the party link/i), `https://daydemir.github.io/guo-games/#live/${key}`);
  await user.click(screen.getByRole('button', { name: 'Join the markets' }));
  await screen.findByRole('heading', { name: 'You have $100.00' });
  expect(localStorage.getItem(LIVE_KEY)).toBe(key);
});

it('joins from the party link, opens a market, buys, and sees another phone’s trade arrive', async () => {
  const key = await newParty();
  history.replaceState(null, '', `/#live/${key}`);
  render(<App />);
  const user = await joinAs('Jack');
  // The link lands on the markets and leaves the address bar clean.
  expect(location.hash).toBe('');
  await screen.findByRole('heading', { name: 'You have $100.00' });

  await user.type(screen.getByLabelText(/a yes or no question/i), 'Does the cake survive the drive?');
  await user.type(screen.getByLabelText(/closes/i), 'Cake cutting');
  await user.click(screen.getByRole('button', { name: /open market/i }));
  await screen.findByRole('heading', { name: 'Does the cake survive the drive?' });
  const cake = () => card('Does the cake survive the drive?');
  expect(cake().getByText('Open · closes Cake cutting')).toBeTruthy();
  expect(cake().getByRole('button', { name: 'Yes 50¢' })).toBeTruthy();

  await user.click(cake().getByRole('button', { name: 'Yes 50¢' }));
  await user.click(cake().getByRole('button', { name: '$10' }));
  expect(cake().getByText(/\$10 buys [\d.]+ Yes shares at \d+¢ each\. Pays \$[\d.]+ if Yes\./)).toBeTruthy();
  await user.click(cake().getByRole('button', { name: 'Buy Yes for $10' }));

  await screen.findByRole('heading', { name: 'You have $90.00' });
  expect(screen.getByRole('status').textContent).toMatch(/^Bought [\d.]+ Yes shares for \$10\.00\.$/);
  expect(cake().getByText(/You: [\d.]+ Yes, \$10\.00 in/)).toBeTruthy();

  // Nate buys No on his own phone; this one catches up without a reload.
  const ledger = (await (await fetch(`${base}/party`, { headers: { 'x-party-key': key } })).json()) as Ledger;
  await elsewhere(key, 'Nate', { type: 'buy', id: 'nate-trade-1', market: ledger.markets[0].id, side: 'no', dollars: 25 });
  await waitFor(() => expect(screen.getByText('Nate bought No: Does the cake survive the drive?')).toBeTruthy(), { timeout: 5_000 });
  expect(screen.getByRole('list', { name: 'Standings' }).textContent).toContain('Jack (you)');
});

it('lets only a Clerk resolve, after a second tap, and pays the winner', async () => {
  const key = await newParty();
  const opened = await elsewhere(key, 'Nick', { type: 'open', id: 'market-macarena', question: 'Does the DJ play the Macarena?', closes: '' });
  await elsewhere(key, 'Kevin', { type: 'buy', id: 'kevin-trade-1', market: opened.markets[0].id, side: 'yes', dollars: 25 });
  localStorage.setItem(LIVE_KEY, key);

  render(<App />);
  const user = await joinAs('Nick');
  await user.click(screen.getByRole('link', { name: /^picks$/i }));
  await screen.findByRole('heading', { name: 'Does the DJ play the Macarena?' });
  const macarena = () => card('Does the DJ play the Macarena?');

  await user.click(macarena().getByRole('button', { name: 'Resolve Yes' }));
  expect(screen.getByText('Resolve Yes? Winning shares pay $1. This cannot be undone.')).toBeTruthy();
  await user.click(macarena().getByRole('button', { name: 'Yes, resolve Yes' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Resolved Yes.'));
  expect(macarena().queryByRole('button', { name: /resolve/i })).toBeNull();
  // Settled prices, as on Kalshi: a Yes share paid $1, a No share nothing.
  expect(macarena().getByText('$1')).toBeTruthy();
  expect(macarena().getByText('0¢')).toBeTruthy();
  const standings = screen.getByRole('list', { name: 'Standings' });
  expect(within(standings).getAllByRole('listitem')[0].textContent).toMatch(/^Kevin\+\$\d+\.\d\d$/);
});

it('gives a non-Clerk no way to close, resolve or void, and a spectator nothing to tap', async () => {
  const key = await newParty();
  await elsewhere(key, 'Nick', { type: 'open', id: 'market-macarena', question: 'Does the DJ play the Macarena?', closes: '' });
  localStorage.setItem(LIVE_KEY, key);

  render(<App />);
  const user = await joinAs('Jack');
  await user.click(screen.getByRole('link', { name: /^picks$/i }));
  await screen.findByRole('heading', { name: 'Does the DJ play the Macarena?' });
  expect(card('Does the DJ play the Macarena?').queryByRole('button', { name: /resolve|void|close/i })).toBeNull();

  await user.click(screen.getByRole('link', { name: /^you/i }));
  await user.selectOptions(screen.getByLabelText(/switch identity/i), 'Spectator');
  await user.click(screen.getByRole('button', { name: /^apply$/i }));
  await user.click(screen.getByRole('link', { name: /^picks$/i }));
  expect(card('Does the DJ play the Macarena?').queryAllByRole('button')).toEqual([]);
  expect(screen.queryByLabelText(/a yes or no question/i)).toBeNull();
  expect(screen.queryByRole('heading', { name: /you have/i })).toBeNull();
});

it('shows open markets on Today, with a way in', async () => {
  const key = await newParty();
  await elsewhere(key, 'Nick', { type: 'open', id: 'market-macarena', question: 'Does the DJ play the Macarena?', closes: '' });
  localStorage.setItem(LIVE_KEY, key);

  render(<App />);
  const user = await joinAs('Kevin');
  await screen.findByRole('heading', { name: '1 open market' });
  await user.click(screen.getByRole('button', { name: /^trade$/i }));
  expect(document.activeElement?.id).toBe('markets');
});

it('says when the market cannot be reached, buys nothing, and recovers by itself', async () => {
  const key = await newParty();
  await elsewhere(key, 'Nick', { type: 'open', id: 'market-macarena', question: 'Does the DJ play the Macarena?', closes: '' });
  localStorage.setItem(LIVE_KEY, key);
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
  try {
    render(<App />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.selectOptions(screen.getByLabelText(/who are you/i), 'Jack');
    await user.click(screen.getByRole('button', { name: /join the party/i }));
    await user.click(screen.getByRole('link', { name: /^picks$/i }));
    await screen.findByRole('heading', { name: 'Does the DJ play the Macarena?' });

    vi.stubEnv('VITE_MARKETS_URL', 'http://127.0.0.1:9');
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    await screen.findByText(/Can’t reach the market\. It reconnects by itself/);
    await user.click(card('Does the DJ play the Macarena?').getByRole('button', { name: /^Yes/ }));
    expect((card('Does the DJ play the Macarena?').getByRole('button', { name: /^Buy Yes/ }) as HTMLButtonElement).disabled).toBe(true);

    vi.stubEnv('VITE_MARKETS_URL', base);
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    await waitFor(() => expect(screen.queryByText(/Can’t reach the market/)).toBeNull());
    expect((card('Does the DJ play the Macarena?').getByRole('button', { name: /^Buy Yes/ }) as HTMLButtonElement).disabled).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
