import { afterEach, beforeEach, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, LIMITS } from './app.ts';
import { openStore } from './store.ts';
import type { Ledger } from '../src/core/market.ts';
import { STARTING_CENTS, wallet } from '../src/core/market.ts';

const PAGES = 'https://daydemir.github.io';
let dir: string;
let server: Server;
let base: string;

function start(limits: { parties?: number } = {}) {
  server = createServer(createApp({ store: openStore(dir), origins: [PAGES], limits }));
  return new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    }),
  );
}
const stop = () => new Promise<void>((resolve) => server.close(() => resolve()));

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'guo-markets-'));
  await start();
});
afterEach(stop);

async function party(): Promise<string> {
  const response = await fetch(`${base}/parties`, { method: 'POST' });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { key: string; ledger: Ledger };
  expect(body.ledger).toEqual({ version: 0, markets: [], trades: [] });
  return body.key;
}

const read = (key: string, since?: number) =>
  fetch(`${base}/party${since === undefined ? '' : `?since=${since}`}`, { headers: { 'x-party-key': key } });

const post = (key: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/party`, {
    method: 'POST',
    headers: { 'x-party-key': key, 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

async function ok(response: Response): Promise<Ledger> {
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as Ledger;
}

async function refused(response: Response, status: number): Promise<string> {
  expect(response.status).toBe(status);
  return ((await response.json()) as { error: string }).error;
}

it('answers the health check', async () => {
  expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true });
});

it('runs a market from open to paid, the same for every phone on the link', async () => {
  const key = await party();
  await ok(await post(key, { who: 'Jack', command: { type: 'open', id: 'market-0001', question: 'Rain?', closes: '' } }));
  let ledger = await ok(await post(key, { who: 'Nate', command: { type: 'buy', id: 'trade-00001', market: 'market-0001', side: 'yes', dollars: 10 } }));
  expect(ledger.version).toBe(2);

  // A second phone reads the same ledger, and polling at that version costs nothing.
  expect(await ok(await read(key))).toEqual(ledger);
  const unchanged = await read(key, 2);
  expect(unchanged.status).toBe(204);
  expect(await unchanged.text()).toBe('');

  expect(await refused(await post(key, { who: 'Jack', command: { type: 'resolve', market: 'market-0001', outcome: 'yes' } }), 409)).toBe(
    'Only a Clerk can resolve a market. Ask Deniz or Nick.',
  );
  ledger = await ok(await post(key, { who: 'Nick', command: { type: 'resolve', market: 'market-0001', outcome: 'yes' } }));
  expect(wallet(ledger, 'Nate').cash).toBeGreaterThan(STARTING_CENTS);
  expect(await refused(await post(key, { who: 'Nick', command: { type: 'resolve', market: 'market-0001', outcome: 'no' } }), 409)).toMatch(
    /already settled/,
  );
});

it('applies a retried buy once', async () => {
  const key = await party();
  await ok(await post(key, { who: 'Jack', command: { type: 'open', id: 'market-0001', question: 'Rain?', closes: '' } }));
  const buy = { who: 'Nate', command: { type: 'buy', id: 'trade-00001', market: 'market-0001', side: 'no', dollars: 25 } };
  const first = await ok(await post(key, buy));
  const again = await ok(await post(key, buy));
  expect(again).toEqual(first);
  expect(wallet(again, 'Nate').cash).toBe(STARTING_CENTS - 2500);
});

it('keeps parties apart, and opens nothing without the right key', async () => {
  const one = await party();
  const two = await party();
  await ok(await post(one, { who: 'Jack', command: { type: 'open', id: 'market-0001', question: 'Private?', closes: '' } }));
  expect((await ok(await read(two))).markets).toEqual([]);

  for (const key of ['', 'GUO27', `${one.slice(0, -1)}x`, 'a'.repeat(500)]) {
    expect(await refused(await read(key), 404)).toMatch(/not recognised/);
  }
  expect((await fetch(`${base}/party`)).status).toBe(404);
});

it('refuses what a party should never hold', async () => {
  const key = await party();
  expect(await refused(await post(key, '{not json'), 400)).toMatch(/not JSON/);
  expect(await refused(await post(key, { who: 'Mallory', command: { type: 'open', id: 'market-0001', question: 'Hi', closes: '' } }), 400)).toMatch(
    /does not make sense/,
  );
  expect(await refused(await post(key, { who: 'Jack', command: { type: 'open', id: 'market-0001', question: 'x'.repeat(5_000), closes: '' } }), 413)).toMatch(
    /too large/,
  );
  await ok(await post(key, { who: 'Jack', command: { type: 'open', id: 'market-0001', question: 'Rain?', closes: '' } }));
  expect(
    await refused(await post(key, { who: 'Nate', command: { type: 'buy', id: 'trade-00001', market: 'market-0001', side: 'yes', dollars: 1_000 } }), 409),
  ).toBe('Buys are $1, $5, $10 or $25.');
  expect((await fetch(`${base}/party`, { method: 'DELETE', headers: { 'x-party-key': key } })).status).toBe(405);
});

it('lets the Pages origin in and keeps other sites out', async () => {
  const preflight = await fetch(`${base}/party`, {
    method: 'OPTIONS',
    headers: { origin: PAGES, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type, x-party-key' },
  });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get('access-control-allow-origin')).toBe(PAGES);
  expect(preflight.headers.get('access-control-allow-headers')).toContain('x-party-key');

  const key = await party();
  const allowed = await fetch(`${base}/party`, { headers: { origin: PAGES, 'x-party-key': key } });
  expect(allowed.headers.get('access-control-allow-origin')).toBe(PAGES);

  const elsewhere = await fetch(`${base}/party`, { headers: { origin: 'https://evil.example', 'x-party-key': key } });
  expect(elsewhere.status).toBe(403);
  expect(elsewhere.headers.get('access-control-allow-origin')).toBeNull();
  expect((await fetch(`${base}/parties`, { method: 'POST', headers: { origin: 'https://evil.example' } })).status).toBe(403);
});

it('survives a restart, writes whole files, and never names a file after its key', async () => {
  const key = await party();
  const before = await ok(await post(key, { who: 'Jack', command: { type: 'open', id: 'market-0001', question: 'Rain?', closes: '' } }));
  const files = readdirSync(dir);
  expect(files).toHaveLength(1);
  expect(files[0]).not.toContain(key);
  expect(files[0]).toMatch(/^[0-9a-f]{32}\.json$/);

  await stop();
  await start();
  expect(await ok(await read(key))).toEqual(before);
});

it('refuses to start over a party file it cannot read, and leaves the file alone', async () => {
  const broken = join(dir, `${'0'.repeat(32)}.json`);
  writeFileSync(broken, '{ half a party');
  expect(() => openStore(dir)).toThrow(/cannot be read by this version of the server/);
  expect(readFileSync(broken, 'utf8')).toBe('{ half a party');
});

it('limits new parties, per caller and in total', async () => {
  for (let i = 0; i < LIMITS.createsPerAddress; i += 1) await party();
  expect(await refused(await fetch(`${base}/parties`, { method: 'POST' }), 429)).toMatch(/Too many new parties/);

  await stop();
  await start({ parties: 1 });
  expect(await refused(await fetch(`${base}/parties`, { method: 'POST' }), 503)).toMatch(/full/);
});
