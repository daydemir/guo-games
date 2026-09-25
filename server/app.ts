/**
 * The Wedding Markets server: a few JSON routes over `apply`, the same rules
 * every phone runs. It is the source of truth for prices and balances, and it
 * trusts nothing a phone says beyond who is asking, which is a name picked
 * from the roster, exactly as in the app.
 *
 *   GET  /health             for the host's health check
 *   POST /parties            start a party; answers with its key
 *   GET  /party?since=N      the ledger, or 204 when it is still version N
 *   POST /party              { who, command }; answers with the new ledger
 *
 * The party key travels in an `x-party-key` header, never in a URL, so it
 * stays out of request logs.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { apply, requestSchema } from '../src/core/market.ts';
import type { Store } from './store.ts';

export type Options = {
  store: Store;
  /** Browser origins allowed to call. Requests with no Origin (curl, health checks) are let through. */
  origins: readonly string[];
  now?: () => number;
  /** Overrides for tests that need more room than a real party does. */
  limits?: Partial<Limits>;
};

export type Limits = { [K in keyof typeof LIMITS]: number };

export const LIMITS = {
  body: 4_096,
  /** Per client address, per minute. Seven phones behind one venue's wifi poll about 150 times a minute. */
  requests: 600,
  /** Per party, per minute. */
  writes: 120,
  /** New parties, per client address and in total, per hour. */
  createsPerAddress: 5,
  createsTotal: 30,
  parties: 500,
} as const;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

class Refusal extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function createApp({ store, origins, now = Date.now, limits: overrides }: Options) {
  const limits: Limits = { ...LIMITS, ...overrides };
  const requests = limiter(limits.requests, MINUTE);
  const writes = limiter(limits.writes, MINUTE);
  const createsHere = limiter(limits.createsPerAddress, HOUR);
  const createsAll = limiter(limits.createsTotal, HOUR);

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (!origins.includes(origin)) throw new Refusal(403, 'This origin may not use the market.');
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, x-party-key');
      res.setHeader('Access-Control-Max-Age', '600');
      res.writeHead(204).end();
      return;
    }

    if (url.pathname === '/health' && req.method === 'GET') return send(res, 200, { ok: true });

    const address = clientAddress(req);
    if (!requests(address, now())) throw new Refusal(429, 'Too many requests. Wait a minute.');

    if (url.pathname === '/parties' && req.method === 'POST') {
      if (store.count() >= limits.parties) throw new Refusal(503, 'The market is full. No new parties can start.');
      if (!createsHere(address, now()) || !createsAll('all', now())) {
        throw new Refusal(429, 'Too many new parties. Wait a while.');
      }
      const { key, party } = store.create(now());
      return send(res, 201, { key, ledger: party.ledger });
    }

    if (url.pathname !== '/party') throw new Refusal(404, 'Not found.');
    const key = req.headers['x-party-key'];
    const party = typeof key === 'string' ? store.find(key) : null;
    if (!party) throw new Refusal(404, 'This party link is not recognised. Ask Deniz or Nick for the link again.');

    if (req.method === 'GET') {
      if (url.searchParams.get('since') === String(party.ledger.version)) {
        res.writeHead(204, { 'Cache-Control': 'no-store' }).end();
        return;
      }
      return send(res, 200, party.ledger);
    }

    if (req.method === 'POST') {
      if (!writes(party.id, now())) throw new Refusal(429, 'The market is busy. Try again in a minute.');
      const parsed = requestSchema.safeParse(await readJson(req, limits.body));
      if (!parsed.success) throw new Refusal(400, 'That request does not make sense to the market.');
      let next;
      try {
        next = apply(party.ledger, parsed.data.who, parsed.data.command, now());
      } catch (error) {
        throw new Refusal(409, error instanceof Error ? error.message : 'The market refused that.');
      }
      if (next !== party.ledger) store.commit(party, next);
      return send(res, 200, party.ledger);
    }

    throw new Refusal(405, 'Method not allowed.');
  }

  return (req: IncomingMessage, res: ServerResponse): void => {
    route(req, res).catch((error: unknown) => {
      if (res.headersSent) return;
      if (error instanceof Refusal) {
        send(res, error.status, { error: error.message });
      } else {
        console.error(error);
        send(res, 500, { error: 'The market hit a problem. Try again.' });
      }
    });
  };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

/** The request body as JSON, refusing anything larger than a command needs. */
async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > limit) throw new Refusal(413, 'That request is too large.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Refusal(413, 'That request is too large.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Refusal(400, 'That request is not JSON.');
  }
}

/**
 * The caller's address for rate limiting. Behind the host's proxy that is the
 * first X-Forwarded-For entry, which a client can forge, so these per-address
 * limits are a courtesy; the per-party and total limits are what hold.
 */
function clientAddress(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

/** A fixed-window counter: true while `key` is under `limit` for this window. */
function limiter(limit: number, window: number) {
  const hits = new Map<string, { start: number; count: number }>();
  return (key: string, at: number): boolean => {
    const entry = hits.get(key);
    if (!entry || at - entry.start >= window) {
      // Bounded memory: a flood of addresses resets everyone's window, which is only generous.
      if (hits.size >= 10_000) hits.clear();
      hits.set(key, { start: at, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
