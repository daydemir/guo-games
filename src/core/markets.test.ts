import { expect, it } from 'vitest';
import { act, wallet } from './actions';
import { marketBoard, quote } from './selectors';
import { MAX_LIVE_MARKETS, STARTING_CENTS, VOIDED_QUESTION, dollars, priceLabel, sharesFor, yesPrice } from './market';
import { ATTENDEES } from './content';
import { stateSchema } from './state';
import { readBackup, writeBackup } from './backup';
import { NOW, as } from './fixtures';
import type { Attendee } from './content';
import type { State } from './state';

const question = 'Does Kevin cry during the vows?';
const open = (state: State = as('Jack')) => act(state, { type: 'openMarket', question, closes: 'End of the vows' }, NOW);
const idOf = (state: State) => state.markets[state.markets.length - 1].id;
const buy = (state: State, buyer: Attendee, side: 'yes' | 'no', amount = 10, by: Attendee = buyer) =>
  act(as(by, state), { type: 'buy', market: idOf(state), buyer, side, dollars: amount }, NOW);
const resolve = (state: State, outcome: 'yes' | 'no' | 'void', by: Attendee = 'Nick') =>
  act(
    as(by, state),
    outcome === 'void' ? { type: 'voidMarket', id: idOf(state) } : { type: 'resolveMarket', id: idOf(state), outcome },
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
});

it('opens a market for anyone playing, and says so in the feed', () => {
  const state = open();
  expect(marketBoard(state, 'Jack')[0]).toMatchObject({ chance: 0.5, volume: 0, market: { question, status: 'open', creator: 'Jack' } });
  expect(state.feed[0].text).toBe('Jack opened a market.');
  expect(() => act(as('Jack'), { type: 'openMarket', question: '  ', closes: '' }, NOW)).toThrow(/1 to 120/);
  expect(() => act(as('Jack'), { type: 'openMarket', question, closes: 'x'.repeat(61) }, NOW)).toThrow(/60 characters/);
});

it('buys shares at the quoted price, spends pretend dollars, and moves the price', () => {
  let state = open();
  const expected = quote(state, idOf(state), 'yes', 10);
  state = buy(state, 'Nate', 'yes', 10);

  const [row] = marketBoard(state, 'Nate');
  expect(row.mine.yes).toBeCloseTo(expected.shares, 10);
  expect(row.volume).toBe(1000);
  expect(row.chance).toBeGreaterThan(0.5);
  expect(wallet(state, 'Nate')).toEqual({ cash: STARTING_CENTS - 1000, inPlay: 1000 });
  expect(state.feed[0].text).toBe('Nate bought Yes for $10.00.');

  state = buy(state, 'Simon', 'no', 25);
  expect(marketBoard(state, null)[0].chance).toBeLessThan(0.5);
});

it('refuses buys it should: bad amounts, more than the balance, closed markets', () => {
  let state = open();
  expect(() => buy(state, 'Nate', 'yes', 7)).toThrow('Buys are $1, $5, $10 or $25.');
  for (let i = 0; i < 4; i += 1) state = buy(state, 'Nate', 'yes', 25);
  expect(() => buy(state, 'Nate', 'no', 1)).toThrow('You have $0.00 to play with.');

  state = act(as('Nick', state), { type: 'closeMarket', id: idOf(state) }, NOW);
  expect(() => buy(state, 'Simon', 'yes', 1)).toThrow(/closed/);
});

it('lets a Clerk buy for whoever holds the desk phone, and nobody else', () => {
  const state = open();
  expect(() => buy(state, 'Kevin', 'yes', 5, 'Jack')).toThrow(/only buy for yourself/);
  expect(wallet(buy(state, 'Kevin', 'yes', 5, 'Deniz'), 'Kevin').inPlay).toBe(500);
  expect(() => act(as('Spectator', state), { type: 'buy', market: idOf(state), buyer: 'Jack', side: 'yes', dollars: 5 }, NOW)).toThrow(
    /spectators/i,
  );
});

it('pays $1 a winning share exactly once, and never touches the trades', () => {
  let state = open();
  state = buy(state, 'Nate', 'yes', 10);
  state = buy(state, 'Simon', 'no', 10);
  const nateShares = marketBoard(state, 'Nate')[0].mine.yes;
  const trades = structuredClone(state.trades);

  expect(() => resolve(state, 'yes', 'Jack')).toThrow(/organizer/i);
  state = resolve(state, 'yes');

  expect(wallet(state, 'Nate')).toEqual({ cash: STARTING_CENTS - 1000 + Math.round(nateShares * 100), inPlay: 0 });
  expect(wallet(state, 'Simon')).toEqual({ cash: STARTING_CENTS - 1000, inPlay: 0 });
  expect(state.trades).toEqual(trades);
  expect(state.feed[0].text).toBe(`Resolved Yes, winning shares pay $1: ${question}`);

  expect(() => resolve(state, 'no')).toThrow(/already settled/);
  expect(() => resolve(state, 'void')).toThrow(/already settled/);
  expect(wallet(state, 'Nate').cash).toBe(STARTING_CENTS - 1000 + Math.round(nateShares * 100));
});

it('refunds every buy when a market is voided', () => {
  let state = buy(buy(open(), 'Nate', 'yes', 25), 'Simon', 'no', 5);
  state = resolve(state, 'void');
  for (const who of ATTENDEES) expect(wallet(state, who)).toEqual({ cash: STARTING_CENTS, inPlay: 0 });
});

it('keeps each wallet honest across a busy night', () => {
  let state = as('Jack');
  for (const outcome of ['yes', 'no', 'void'] as const) {
    state = open(state);
    state = buy(state, 'Nate', 'yes', 25);
    state = buy(state, 'Simon', 'no', 10);
    state = buy(state, 'Nate', 'no', 5);
    state = resolve(state, outcome);
  }
  const spent = (who: Attendee) =>
    state.trades.filter((trade) => trade.buyer === who && state.markets.find((m) => m.id === trade.market)?.status !== 'void');
  for (const who of ['Nate', 'Simon'] as const) {
    const paidIn = spent(who).reduce((sum, trade) => sum + trade.cents, 0);
    const paidOut = spent(who)
      .filter((trade) => state.markets.find((m) => m.id === trade.market)?.outcome === trade.side)
      .reduce((sum, trade) => sum + Math.round(trade.shares * 100), 0);
    expect(wallet(state, who).cash).toBe(STARTING_CENTS - paidIn + paidOut);
  }
});

it('refuses the closed trip, like every other command', () => {
  const state = as('Jack');
  expect(() => act(state, { type: 'openMarket', question, closes: '' }, Date.parse(state.settings.expiresAt))).toThrow(/read-only/);
});

it('survives a backup round trip, opens older saves empty, and treats a broken market as unreadable', () => {
  const state = resolve(buy(open(), 'Nate', 'yes'), 'no');
  const restored = readBackup(writeBackup(state));
  expect(restored.markets).toEqual(state.markets);
  expect(restored.trades).toEqual(state.trades);

  expect(stateSchema.parse({ version: 3 })).toMatchObject({ markets: [], trades: [] });
  // A trade whose market is missing counts as refunded rather than lost.
  expect(wallet({ ...state, markets: [] }, 'Nate')).toEqual({ cash: STARTING_CENTS, inPlay: 0 });

  const valid = (patch: Partial<State>) => stateSchema.safeParse({ ...structuredClone(state), ...patch }).success;
  expect(valid({})).toBe(true);
  expect(valid({ trades: [{ ...state.trades[0], cents: 700 as 100 }] })).toBe(false);
  expect(valid({ trades: [{ ...state.trades[0], shares: -1 }] })).toBe(false);
  expect(valid({ markets: [{ ...state.markets[0], outcome: undefined }] })).toBe(false);
  expect(valid({ markets: [{ ...state.markets[0], status: 'open' }] })).toBe(false);
});

it('limits only what is still live, so resolving a market always makes room', () => {
  let state = as('Jack');
  for (let i = 0; i < MAX_LIVE_MARKETS; i += 1) state = open(state);
  expect(() => open(state)).toThrow(`Up to ${MAX_LIVE_MARKETS} markets can be live at once. Resolve one first.`);
  state = resolve(state, 'void');
  expect(open(state).markets).toHaveLength(MAX_LIVE_MARKETS + 1);
});

it('shows exactly what the wallet was paid, rounded per trade the same way', () => {
  let state = open();
  for (let i = 0; i < 3; i += 1) state = buy(state, 'Nate', 'yes', 1);
  state = resolve(state, 'yes');
  const [row] = marketBoard(state, 'Nate');
  expect(wallet(state, 'Nate').cash).toBe(STARTING_CENTS - 300 + row.mine.paid);
});

it('lets anyone playing void a live market, refunding every buy and clearing its words everywhere', () => {
  let state = buy(buy(open(), 'Nate', 'yes', 25), 'Simon', 'no', 5);
  state = act(as('Nick', state), { type: 'closeMarket', id: idOf(state) }, NOW);
  const trades = structuredClone(state.trades);

  expect(() => act(as('Spectator', state), { type: 'voidMarket', id: idOf(state) }, NOW)).toThrow(/spectators/i);
  state = resolve(state, 'void', 'Kevin');

  expect(state.markets[0]).toMatchObject({ status: 'void', question: VOIDED_QUESTION, closes: '' });
  expect(state.trades).toEqual(trades);
  for (const who of ATTENDEES) expect(wallet(state, who)).toEqual({ cash: STARTING_CENTS, inPlay: 0 });
  expect(state.feed[0].text).toBe('Kevin voided a market. Every buy was refunded.');
  expect(JSON.stringify(state)).not.toContain('Kevin cry');
  expect(writeBackup(state)).not.toContain('End of the vows');
});

it('keeps closing and resolving to a Clerk, and a resolved market can no longer be voided', () => {
  let state = buy(open(), 'Nate', 'yes');
  expect(() => act(as('Jack', state), { type: 'closeMarket', id: idOf(state) }, NOW)).toThrow(/organizer/i);
  expect(() => act(as('Jack', state), { type: 'resolveMarket', id: idOf(state), outcome: 'yes' }, NOW)).toThrow(/organizer/i);
  state = resolve(state, 'yes');
  expect(() => resolve(state, 'void', 'Jack')).toThrow(/already settled/);
  expect(state.markets[0].question).toBe(question);
});
