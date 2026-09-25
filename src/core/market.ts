/**
 * Wedding Markets: yes or no questions that trade like Kalshi, in pretend
 * dollars. Nobody needs a counterparty on the same phone, because an automatic
 * market maker (a logarithmic scoring rule) always takes the other side: every
 * buy nudges the price, and a winning share pays $1 when a Clerk resolves it.
 *
 * The dollars are fictional wedding balances. No real money is deposited,
 * withdrawn, paid out or transferred, pretend dollars are never redeemable, and
 * nothing leaves this phone.
 */

/** Everyone's pretend starting balance, in cents. */
export const STARTING_CENTS = 100_00;
/** What one buy can spend, in dollars. */
export const BUY_DOLLARS = [1, 5, 10, 25] as const;
export type BuyDollars = (typeof BUY_DOLLARS)[number];
export const MAX_QUESTION_CHARS = 120;
export const MAX_CLOSES_CHARS = 60;
/** Limits on what is still in play. Settled markets and their trades never count. */
export const MAX_LIVE_MARKETS = 20;
export const MAX_LIVE_TRADES = 400;

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

/** "$12.50", "$0.40". */
export const dollars = (cents: number): string =>
  `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

/** "62¢", clamped so a lopsided market still reads as a price. */
export const priceLabel = (chance: number): string => `${Math.min(99, Math.max(1, Math.round(chance * 100)))}¢`;
