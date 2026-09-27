import { expect, it } from 'vitest';
import {
  MAX_LIVE_MARKETS,
  STARTING_CENTS,
  VOIDED_QUESTION,
  apply,
  board,
  dollars,
  emptyLedger,
  ledgerSchema,
  net,
  priceLabel,
  quote,
  requestSchema,
  sharesFor,
  standings,
  wallet,
  yesPrice,
} from './market';
import type { Ledger } from './market';
import { ATTENDEES } from './content';
import type { Attendee } from './content';
import { stateSchema } from './state';
import { parseParty } from './storage';

const NOW = Date.parse('2027-07-04T20:00:00Z');
const question = 'Does Kevin cry during the vows?';
let ids = 0;
const nextId = () => `test-id-${(ids += 1)}`;

const open = (ledger: Ledger = emptyLedger(), who: Attendee = 'Jack') =>
  apply(ledger, who, { type: 'open', id: nextId(), question, closes: 'End of the vows' }, NOW);
const idOf = (ledger: Ledger) => ledger.markets[ledger.markets.length - 1].id;
const buy = (ledger: Ledger, who: Attendee, side: 'yes' | 'no', amount = 10) =>
  apply(ledger, who, { type: 'buy', id: nextId(), market: idOf(ledger), side, dollars: amount }, NOW);
const settle = (ledger: Ledger, outcome: 'yes' | 'no' | 'void', who: Attendee = 'Nick') =>
  apply(
    ledger,
    who,
    outcome === 'void' ? { type: 'void', market: idOf(ledger) } : { type: 'resolve', market: idOf(ledger), outcome },
    NOW,
  );

it('prices like Kalshi: a fresh market is 50 cents, and buying Yes moves it up', () => {
  const fresh = { yes: 0, no: 0 };
  expect(yesPrice(fresh)).toBe(0.5);
  const shares = sharesFor(fresh, 'yes', 10);
  expect(shares).toBeGreaterThan(10); // under $1 a share while the price is below $1
  expect(priceLabel(yesPrice({ yes: shares, no: 0 }))).toBe('66¢');
  // Buying No from the same spot is the mirror image.
  expect(sharesFor(fresh, 'no', 10)).toBeCloseTo(shares, 10);
  expect(dollars(1250)).toBe('$12.50');
  expect([net(1250), net(-40), net(0)]).toEqual(['+$12.50', '-$0.40', '$0.00']);
});

it('opens a market for anyone playing, and bumps the version with every change', () => {
  const ledger = open();
  expect(ledger.version).toBe(1);
  expect(board(ledger, 'Jack')[0]).toMatchObject({ chance: 0.5, volume: 0, market: { question, status: 'open', creator: 'Jack' } });
  expect(buy(ledger, 'Nate', 'yes').version).toBe(2);
  expect(() => apply(emptyLedger(), 'Jack', { type: 'open', id: nextId(), question: '  ', closes: '' }, NOW)).toThrow(/1 to 120/);
  expect(() => apply(emptyLedger(), 'Jack', { type: 'open', id: nextId(), question, closes: 'x'.repeat(61) }, NOW)).toThrow(
    /60 characters/,
  );
});

it('buys shares at the quoted price, spends dollars, and moves the price', () => {
  let ledger = open();
  const expected = quote(ledger, idOf(ledger), 'yes', 10);
  ledger = buy(ledger, 'Nate', 'yes', 10);

  const [row] = board(ledger, 'Nate');
  expect(row.mine.yes).toBeCloseTo(expected.shares, 10);
  expect(row.volume).toBe(1000);
  expect(row.chance).toBeGreaterThan(0.5);
  expect(wallet(ledger, 'Nate')).toEqual({ cash: STARTING_CENTS - 1000, inPlay: 1000 });

  ledger = buy(ledger, 'Simon', 'no', 25);
  expect(board(ledger, null)[0].chance).toBeLessThan(0.5);
});

it('applies a repeated command once, so a retried request never buys twice', () => {
  const ledger = open();
  const command = { type: 'buy', id: 'retry-me-1', market: idOf(ledger), side: 'yes', dollars: 5 } as const;
  const once = apply(ledger, 'Nate', command, NOW);
  expect(apply(once, 'Nate', command, NOW)).toBe(once);
  expect(wallet(once, 'Nate').cash).toBe(STARTING_CENTS - 500);

  const opening = { type: 'open', id: 'open-me-1', question: 'Twice?', closes: '' } as const;
  const opened = apply(ledger, 'Jack', opening, NOW);
  expect(apply(opened, 'Jack', opening, NOW)).toBe(opened);

  // Somebody else's id is not a retry.
  expect(() => apply(once, 'Simon', command, NOW)).toThrow('That trade id is taken.');
  expect(() => apply(opened, 'Nate', opening, NOW)).toThrow('That market id is taken.');

  // A Clerk's ruling that already landed is a retry too; a different ruling is not.
  const resolve = { type: 'resolve', market: idOf(ledger), outcome: 'yes' } as const;
  const resolved = apply(once, 'Nick', resolve, NOW);
  expect(apply(resolved, 'Deniz', resolve, NOW)).toBe(resolved);
  expect(() => apply(resolved, 'Nick', { ...resolve, outcome: 'no' }, NOW)).toThrow(/already settled/);
  expect(() => apply(resolved, 'Jack', resolve, NOW)).toThrow(/Only a Clerk/);
  const closed = apply(once, 'Nick', { type: 'close', market: idOf(ledger) }, NOW);
  expect(apply(closed, 'Nick', { type: 'close', market: idOf(ledger) }, NOW)).toBe(closed);
});

it('refuses buys it should: bad amounts, more than the balance, closed markets', () => {
  let ledger = open();
  expect(() => buy(ledger, 'Nate', 'yes', 7)).toThrow('Buys are $1, $5, $10 or $25.');
  for (let i = 0; i < 4; i += 1) ledger = buy(ledger, 'Nate', 'yes', 25);
  expect(() => buy(ledger, 'Nate', 'no', 1)).toThrow('You have $0.00 to play with.');
  expect(wallet(ledger, 'Nate').cash).toBe(0);

  ledger = apply(ledger, 'Nick', { type: 'close', market: idOf(ledger) }, NOW);
  expect(() => buy(ledger, 'Simon', 'yes', 1)).toThrow(/closed/);
  expect(() => apply(ledger, 'Simon', { type: 'buy', id: nextId(), market: 'no-such-market', side: 'yes', dollars: 1 }, NOW)).toThrow(
    /not here/,
  );
});

it('pays $1 a winning share exactly once, and never touches the trades', () => {
  let ledger = open();
  ledger = buy(ledger, 'Nate', 'yes', 10);
  ledger = buy(ledger, 'Simon', 'no', 10);
  const nateShares = board(ledger, 'Nate')[0].mine.yes;
  const trades = structuredClone(ledger.trades);

  expect(() => settle(ledger, 'yes', 'Jack')).toThrow('Only a Clerk can resolve a market. Ask Deniz or Nick.');
  ledger = settle(ledger, 'yes');

  expect(wallet(ledger, 'Nate')).toEqual({ cash: STARTING_CENTS - 1000 + Math.round(nateShares * 100), inPlay: 0 });
  expect(wallet(ledger, 'Simon')).toEqual({ cash: STARTING_CENTS - 1000, inPlay: 0 });
  expect(ledger.trades).toEqual(trades);

  expect(() => settle(ledger, 'no')).toThrow(/already settled/);
  expect(() => settle(ledger, 'void')).toThrow(/already settled/);
  expect(wallet(ledger, 'Nate').cash).toBe(STARTING_CENTS - 1000 + Math.round(nateShares * 100));
});

it('leaves closing, resolving and voiding to a Clerk, and a void refunds every buy and clears its words', () => {
  let ledger = buy(buy(open(), 'Nate', 'yes', 25), 'Simon', 'no', 5);
  expect(() => apply(ledger, 'Jack', { type: 'close', market: idOf(ledger) }, NOW)).toThrow(/Only a Clerk/);
  expect(() => settle(ledger, 'void', 'Jack')).toThrow('Only a Clerk can void a market. Ask Deniz or Nick.');
  ledger = apply(ledger, 'Deniz', { type: 'close', market: idOf(ledger) }, NOW);
  const trades = structuredClone(ledger.trades);

  ledger = settle(ledger, 'void', 'Deniz');
  expect(ledger.markets[0]).toMatchObject({ status: 'void', question: VOIDED_QUESTION, closes: '' });
  expect(ledger.trades).toEqual(trades);
  for (const who of ATTENDEES) expect(wallet(ledger, who)).toEqual({ cash: STARTING_CENTS, inPlay: 0 });
  expect(JSON.stringify(ledger)).not.toContain('Kevin cry');
  expect(JSON.stringify(ledger)).not.toContain('End of the vows');
});

it('keeps each wallet honest across a busy night, and the standings add up to zero with the market maker', () => {
  let ledger = emptyLedger();
  for (const outcome of ['yes', 'no', 'void'] as const) {
    ledger = open(ledger);
    ledger = buy(ledger, 'Nate', 'yes', 25);
    ledger = buy(ledger, 'Simon', 'no', 10);
    ledger = buy(ledger, 'Nate', 'no', 5);
    ledger = settle(ledger, outcome);
  }
  ledger = buy(open(ledger), 'Kevin', 'yes', 5); // still open

  const counted = (who: Attendee) =>
    ledger.trades.filter((trade) => trade.buyer === who && ledger.markets.find((m) => m.id === trade.market)?.status === 'resolved');
  for (const who of ['Nate', 'Simon'] as const) {
    const paidIn = counted(who).reduce((sum, trade) => sum + trade.cents, 0);
    const paidOut = counted(who)
      .filter((trade) => ledger.markets.find((m) => m.id === trade.market)?.outcome === trade.side)
      .reduce((sum, trade) => sum + Math.round(trade.shares * 100), 0);
    expect(wallet(ledger, who).cash).toBe(STARTING_CENTS - paidIn + paidOut);
  }

  const { players, house } = standings(ledger);
  expect(players.map((row) => row.who).sort()).toEqual([...ATTENDEES].sort());
  expect(players.map((row) => row.net)).toEqual([...players.map((row) => row.net)].sort((a, b) => b - a));
  // Kevin's open $5 counts at cost, so he is flat until it resolves.
  expect(players.find((row) => row.who === 'Kevin')).toMatchObject({ cash: STARTING_CENTS - 500, inPlay: 500, net: 0 });
  expect(players.reduce((sum, row) => sum + row.net, 0) + house).toBe(0);
});

it('limits only what is still live, so resolving a market always makes room', () => {
  let ledger = emptyLedger();
  for (let i = 0; i < MAX_LIVE_MARKETS; i += 1) ledger = open(ledger);
  expect(() => open(ledger)).toThrow(`Up to ${MAX_LIVE_MARKETS} markets can be live at once.`);
  ledger = settle(ledger, 'void');
  expect(open(ledger).markets).toHaveLength(MAX_LIVE_MARKETS + 1);
});

it('shows exactly what the wallet was paid, rounded per trade the same way', () => {
  let ledger = open();
  for (let i = 0; i < 3; i += 1) ledger = buy(ledger, 'Nate', 'yes', 1);
  ledger = settle(ledger, 'yes');
  const [row] = board(ledger, 'Nate');
  expect(wallet(ledger, 'Nate').cash).toBe(STARTING_CENTS - 300 + row.mine.paid);
});

it('checks what a phone sends before any rule runs', () => {
  const valid = (body: unknown) => requestSchema.safeParse(body).success;
  const command = { type: 'buy', id: 'abcdefgh-1', market: 'abcdefgh-2', side: 'yes', dollars: 5 };
  expect(valid({ who: 'Jack', command })).toBe(true);
  expect(valid({ who: 'Spectator', command })).toBe(false);
  expect(valid({ who: 'Mallory', command })).toBe(false);
  expect(valid({ who: 'Jack', command: { ...command, side: 'maybe' } })).toBe(false);
  expect(valid({ who: 'Jack', command: { ...command, id: '../../etc' } })).toBe(false);
  expect(valid({ who: 'Jack', command: { type: 'mint', dollars: 1_000 } })).toBe(false);

  const ledger = resolveSample();
  const ok = (patch: Partial<Ledger>) => ledgerSchema.safeParse({ ...structuredClone(ledger), ...patch }).success;
  expect(ok({})).toBe(true);
  expect(ok({ trades: [{ ...ledger.trades[0], cents: 700 as 100 }] })).toBe(false);
  expect(ok({ trades: [{ ...ledger.trades[0], shares: -1 }] })).toBe(false);
  expect(ok({ markets: [{ ...ledger.markets[0], outcome: undefined }] })).toBe(false);
});

it('opens a save from the local-markets build, dropping its local markets and nothing else', () => {
  const old = { ...stateSchema.parse({ version: 3 }), markets: [{ id: 'm', question: 'Old?' }], trades: [{ id: 't' }] };
  const opened = parseParty(JSON.stringify(old));
  expect(opened).not.toBeNull();
  expect(opened).not.toHaveProperty('markets');
  expect(opened).not.toHaveProperty('trades');
});

const resolveSample = () => settle(buy(open(), 'Nate', 'yes'), 'no');
