/**
 * Wedding Markets: yes or no questions that trade like Kalshi, in dollars.
 * Everyone starts with $100. An automatic market maker (a logarithmic scoring
 * rule) always takes the other side, so nobody waits for a match: every buy
 * nudges the price, and a winning share pays $1 when a Clerk resolves it.
 *
 * The markets are shared. One small server (`server/`) holds each party's
 * ledger and runs `apply` as the only way it changes; every phone runs this
 * same file to quote a buy and draw the board. The app keeps score in dollars
 * and never moves real money.
 *
 * The server runs this file straight from source under Node's type stripping,
 * which is why the imports spell out `.ts`.
 */
import { z } from 'zod';
import { ATTENDEES, ORGANIZERS } from './content.ts';
import type { Attendee } from './content.ts';

/** Everyone's starting balance, in cents. */
export const STARTING_CENTS = 100_00;
/** What one buy can spend, in dollars. */
export const BUY_DOLLARS = [1, 5, 10, 25] as const;
export const MAX_QUESTION_CHARS = 120;
export const MAX_CLOSES_CHARS = 60;
/**
 * What a voided market shows instead of its question. A void clears the words
 * from the server as well as the screen, so a question someone regrets does
 * not linger.
 */
export const VOIDED_QUESTION = 'A voided market';
/** Open or closed markets at once. */
export const MAX_LIVE_MARKETS = 20;
/** Ceilings on one party's whole history, so the server's disk stays bounded. */
export const MAX_MARKETS = 200;
export const MAX_TRADES = 5_000;

/**
 * How far one buy moves the price. At 25, the first $10 on Yes takes a fresh
 * market from 50 cents to about 67.
 */
const DEPTH = 25;

export type Side = 'yes' | 'no';
export type Book = { yes: number; no: number };

/** The chance the market gives Yes, from 0 to 1. */
export const yesPrice = ({ yes, no }: Book): number => 1 / (1 + Math.exp((no - yes) / DEPTH));

/** What the market maker has taken in so far, in dollars. Shifted to stay finite. */
function cost({ yes, no }: Book): number {
  const top = Math.max(yes, no);
  return top + DEPTH * Math.log(Math.exp((yes - top) / DEPTH) + Math.exp((no - top) / DEPTH));
}

/**
 * Shares a spend of `dollars` buys on `side`: the amount that raises the
 * market maker's take by exactly that spend. Closed form, so no iteration.
 */
export function sharesFor(book: Book, side: Side, dollars: number): number {
  const mine = book[side];
  const theirs = side === 'yes' ? book.no : book.yes;
  const after = cost(book) + dollars;
  return after + DEPTH * Math.log(1 - Math.exp((theirs - after) / DEPTH)) - mine;
}

/** "$12.50", "-$0.40". */
export const dollars = (cents: number): string =>
  `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

/** "+$12.50", "-$0.40", "$0.00": a change in someone's balance. */
export const net = (cents: number): string => (cents > 0 ? `+${dollars(cents)}` : dollars(cents));

/** "62¢", clamped so a lopsided market still reads as a price. */
export const priceLabel = (chance: number): string => `${Math.min(99, Math.max(1, Math.round(chance * 100)))}¢`;

/* ------------------------------------------------------------------ ledger */

/** Ids come from the phone that asked, so a retried request is recognised rather than applied twice. */
const id = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);
const attendee = z.enum(ATTENDEES);
const side = z.enum(['yes', 'no']);

export const marketSchema = z
  .object({
    id,
    at: z.number(),
    creator: attendee,
    question: z.string().min(1).max(MAX_QUESTION_CHARS),
    closes: z.string().max(MAX_CLOSES_CHARS),
    status: z.enum(['open', 'closed', 'resolved', 'void']),
    outcome: side.optional(),
  })
  .refine((market) => (market.status === 'resolved') === (market.outcome !== undefined), 'Only a resolved market has an outcome.');
export type Market = z.infer<typeof marketSchema>;

/**
 * One buy, in cents. Trades are never edited: prices and every balance are
 * worked out from them, so a resolution pays out exactly once, by
 * construction, and there is no second ledger to drift.
 */
export const tradeSchema = z.object({
  id,
  at: z.number(),
  market: id,
  buyer: attendee,
  side,
  cents: z.union(BUY_DOLLARS.map((amount) => z.literal(amount * 100))),
  shares: z.number().positive(),
});
export type Trade = z.infer<typeof tradeSchema>;

/** Everything one party's markets are. `version` goes up by one with every change. */
export const ledgerSchema = z.object({
  version: z.number().int().nonnegative(),
  markets: z.array(marketSchema),
  trades: z.array(tradeSchema),
});
export type Ledger = z.infer<typeof ledgerSchema>;

export const emptyLedger = (): Ledger => ({ version: 0, markets: [], trades: [] });

/**
 * What a phone may ask for. Text limits here are loose on purpose: `apply`
 * trims and checks them, and says why in a sentence a player can read.
 */
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open'), id, question: z.string().max(1_000), closes: z.string().max(1_000) }),
  z.object({ type: z.literal('buy'), id, market: id, side, dollars: z.number() }),
  z.object({ type: z.literal('close'), market: id }),
  z.object({ type: z.literal('resolve'), market: id, outcome: side }),
  z.object({ type: z.literal('void'), market: id }),
]);
export type Command = z.infer<typeof commandSchema>;

/** One request to the server: who is asking, and what for. */
export const requestSchema = z.object({ who: attendee, command: commandSchema });

export const isClerk = (who: Attendee): boolean => ORGANIZERS.includes(who);

/**
 * A party key: 16 random bytes, base64url. It rides in the party link, and it
 * is the only thing that lets a phone read or trade on that party's markets.
 */
export const PARTY_KEY = /^[A-Za-z0-9_-]{22}$/;

/**
 * The single way a party's markets change. Throws a sentence the phone shows
 * the player verbatim. A command that has already happened (the same id, or a
 * Clerk's ruling the market already carries) was a retry after a dropped
 * answer, so the ledger comes back untouched, the same object.
 */
export function apply(ledger: Ledger, who: Attendee, command: Command, now: number): Ledger {
  if (alreadyDone(ledger, who, command)) return ledger;
  const next = structuredClone(ledger);
  next.version += 1;

  switch (command.type) {
    case 'open': {
      if (ledger.markets.some((market) => market.id === command.id)) throw new Error('That market id is taken.');
      const question = command.question.trim().replace(/\s+/g, ' ');
      const closes = command.closes.trim().replace(/\s+/g, ' ');
      if (!question || question.length > MAX_QUESTION_CHARS) {
        throw new Error(`Ask a question of 1 to ${MAX_QUESTION_CHARS} characters.`);
      }
      if (closes.length > MAX_CLOSES_CHARS) throw new Error(`Say when it closes in ${MAX_CLOSES_CHARS} characters or fewer.`);
      if (ledger.markets.filter(isLive).length >= MAX_LIVE_MARKETS) {
        throw new Error(`Up to ${MAX_LIVE_MARKETS} markets can be live at once. Ask a Clerk to resolve one first.`);
      }
      if (ledger.markets.length >= MAX_MARKETS) throw new Error('This party has run as many markets as it can hold.');
      next.markets.push({ id: command.id, at: now, creator: who, question, closes, status: 'open' });
      return next;
    }

    case 'buy': {
      if (ledger.trades.some((trade) => trade.id === command.id)) throw new Error('That trade id is taken.');
      const market = mustFind(ledger, command.market);
      if (market.status !== 'open') throw new Error('Trading on this market has closed.');
      if (!BUY_DOLLARS.includes(command.dollars as never)) throw new Error('Buys are $1, $5, $10 or $25.');
      const cents = command.dollars * 100;
      const { cash } = wallet(ledger, who);
      if (cents > cash) throw new Error(`You have ${dollars(cash)} to play with.`);
      if (ledger.trades.length >= MAX_TRADES) throw new Error('This party has made as many trades as it can hold.');
      const shares = sharesFor(book(ledger, market.id), command.side, command.dollars);
      next.trades.push({ id: command.id, at: now, market: market.id, buyer: who, side: command.side, cents: cents as 100, shares });
      return next;
    }

    case 'close': {
      clerkOnly(who, 'close trading');
      const market = mustFind(next, command.market);
      if (market.status !== 'open') throw new Error('This market is not open.');
      market.status = 'closed';
      return next;
    }

    case 'resolve': {
      clerkOnly(who, 'resolve a market');
      const market = mustFind(next, command.market);
      if (!isLive(market)) throw new Error('This market is already settled.');
      market.status = 'resolved';
      market.outcome = command.outcome;
      return next;
    }

    case 'void': {
      // A Clerk's call, because other people's money is riding on it. Every
      // buy is refunded because balances come from the trades, which stay
      // untouched; only the market's own words are cleared.
      clerkOnly(who, 'void a market');
      const market = mustFind(next, command.market);
      if (!isLive(market)) throw new Error('This market is already settled.');
      market.status = 'void';
      market.question = VOIDED_QUESTION;
      market.closes = '';
      return next;
    }
  }
}

/** True when this exact command has already been applied, by this player. */
function alreadyDone(ledger: Ledger, who: Attendee, command: Command): boolean {
  switch (command.type) {
    case 'open': {
      const market = ledger.markets.find((item) => item.id === command.id);
      return market !== undefined && market.creator === who;
    }
    case 'buy': {
      const trade = ledger.trades.find((item) => item.id === command.id);
      return trade !== undefined && trade.buyer === who && trade.market === command.market && trade.side === command.side;
    }
    case 'close':
    case 'resolve':
    case 'void': {
      if (!isClerk(who)) return false;
      const market = ledger.markets.find((item) => item.id === command.market);
      if (!market) return false;
      if (command.type === 'close') return market.status === 'closed';
      if (command.type === 'void') return market.status === 'void';
      return market.status === 'resolved' && market.outcome === command.outcome;
    }
  }
}

/** Open or closed, not yet resolved or voided. */
export const isLive = (market: Market): boolean => market.status === 'open' || market.status === 'closed';

function clerkOnly(who: Attendee, what: string): void {
  if (!isClerk(who)) throw new Error(`Only a Clerk can ${what}. Ask ${ORGANIZERS.join(' or ')}.`);
}

function mustFind(ledger: Ledger, id: string): Market {
  const market = ledger.markets.find((item) => item.id === id);
  if (!market) throw new Error('That market is not here.');
  return market;
}

/** What one trade pays once its market settles: $1 a winning share, rounded per trade. */
export const payout = (trade: { shares: number }): number => Math.round(trade.shares * 100);

/** Shares bought on each side of one market so far. */
export function book(ledger: Ledger, id: string): Book {
  const shares: Book = { yes: 0, no: 0 };
  for (const trade of ledger.trades) if (trade.market === id) shares[trade.side] += trade.shares;
  return shares;
}

/**
 * A player's dollars, in cents, worked out from their trades every time.
 * `cash` is what they can still spend; `inPlay` is spent on markets not yet
 * settled. A void is a refund; a resolution pays $1 for each winning share.
 */
export function wallet(ledger: Ledger, who: Attendee): { cash: number; inPlay: number } {
  let cash = STARTING_CENTS;
  let inPlay = 0;
  for (const trade of ledger.trades) {
    if (trade.buyer !== who) continue;
    const market = ledger.markets.find((item) => item.id === trade.market);
    if (!market || market.status === 'void') continue;
    cash -= trade.cents;
    if (market.status === 'resolved') {
      if (market.outcome === trade.side) cash += payout(trade);
    } else {
      inPlay += trade.cents;
    }
  }
  return { cash, inPlay };
}

/* --------------------------------------------------------------- the board */

export type MarketRow = {
  market: Market;
  /** The chance the market gives Yes, from 0 to 1. */
  chance: number;
  /** Dollars traded, in cents. */
  volume: number;
  /** What the given player holds here, and what it paid once resolved, in cents. */
  mine: { yes: number; no: number; cents: number; paid: number };
};

const ORDER: Record<Market['status'], number> = { open: 0, closed: 1, resolved: 2, void: 3 };

/** Open markets first, then closed, then settled; newest first within each. */
export function board(ledger: Ledger, who: Attendee | null): MarketRow[] {
  return [...ledger.markets]
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.at - a.at)
    .map((market) => {
      const trades = ledger.trades.filter((trade) => trade.market === market.id);
      const mine = { yes: 0, no: 0, cents: 0, paid: 0 };
      for (const trade of trades) {
        if (trade.buyer !== who) continue;
        mine[trade.side] += trade.shares;
        mine.cents += trade.cents;
        if (market.status === 'resolved' && market.outcome === trade.side) mine.paid += payout(trade);
      }
      return {
        market,
        chance: yesPrice(book(ledger, market.id)),
        volume: trades.reduce((sum, trade) => sum + trade.cents, 0),
        mine,
      };
    });
}

/** What a buy would get before it is made: shares, what they pay if right, and the average price. */
export function quote(ledger: Ledger, id: string, side: Side, spend: number) {
  const shares = sharesFor(book(ledger, id), side, spend);
  return { shares, payout: payout({ shares }), average: spend / shares };
}

export type Standing = { who: Attendee; cash: number; inPlay: number; net: number };

/**
 * Where everyone stands, best first. Money riding on an unsettled market
 * counts at what it cost, so once every market is settled `net` is exactly
 * each player's gain or loss against their $100.
 */
export function standings(ledger: Ledger): { players: Standing[]; house: number } {
  const players = ATTENDEES.map((who) => {
    const { cash, inPlay } = wallet(ledger, who);
    return { who, cash, inPlay, net: cash + inPlay - STARTING_CENTS };
  }).sort((a, b) => b.net - a.net);
  // The market maker is the other side of every trade, so it holds the rest.
  return { players, house: -players.reduce((sum, player) => sum + player.net, 0) };
}
