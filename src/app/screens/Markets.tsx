import { useState } from 'react';
import type { FormEvent } from 'react';
import { ATTENDEES, isAttendee } from '../../core/content';
import type { Attendee } from '../../core/content';
import { BUY_DOLLARS, MAX_CLOSES_CHARS, MAX_QUESTION_CHARS, dollars, priceLabel } from '../../core/market';
import type { Side } from '../../core/market';
import { isOrganizer, marketBoard, me, quote, wallet } from '../../core/selectors';
import type { MarketRow } from '../../core/selectors';
import type { Action } from '../../core/actions';
import type { State } from '../../core/state';
import { Card, Empty } from '../../ui/primitives';
import type { Note } from '../useParty';

type Run = (action: Action, note?: Note) => boolean;

const SIDE: Record<Side, string> = { yes: 'Yes', no: 'No' };
const TONE = { open: 'live', closed: 'plain', resolved: 'settled', void: 'void' } as const;
const shares = (count: number) => count.toFixed(1);

/**
 * Wedding Markets: yes or no questions that trade like Kalshi, in pretend
 * dollars. Tap a side, pick an amount, see what it buys, buy. A Clerk closes
 * trading and resolves; a winning share pays $1.
 */
export function Markets({ state, locked, run }: { state: State; locked: boolean; run: Run }) {
  const who = me(state);
  const organizer = isOrganizer(state);
  const playing = isAttendee(who) && !locked;
  // A Clerk's phone is the trading desk, so a Clerk can buy for whoever holds it.
  const [desk, setDesk] = useState<Attendee | null>(null);
  const buyer: Attendee | null = isAttendee(who) ? (organizer && desk ? desk : who) : null;
  const purse = buyer ? wallet(state, buyer) : null;
  const board = marketBoard(state, buyer);

  return (
    <section className="group" aria-labelledby="markets">
      <h3 className="group-head" id="markets" tabIndex={-1}>
        Wedding Markets
      </h3>
      <p className="hint group-lede">
        Pretend wedding dollars: everyone starts with $100, and no real money goes in or comes out. A winning share pays
        one pretend dollar when a Clerk resolves the market.
      </p>

      {purse && buyer ? (
        <Card band="Wedding dollars" title={buyer === who ? `You have ${dollars(purse.cash)}` : `${buyer} has ${dollars(purse.cash)}`}>
          <p className="hint">{dollars(purse.inPlay)} riding on markets that have not been resolved.</p>
          {organizer && playing ? (
            <div className="field">
              <label htmlFor="desk-buyer">Buying for</label>
              <select id="desk-buyer" value={buyer} onChange={(event) => setDesk(event.target.value as Attendee)}>
                {ATTENDEES.map((person) => (
                  <option key={person} value={person}>
                    {person === who ? `${person} (you)` : person}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </Card>
      ) : null}

      {board.length === 0 ? <Empty>No markets yet. Ask the first question.</Empty> : null}
      {board.map((row) => (
        <MarketCard
          key={row.market.id}
          row={row}
          state={state}
          run={run}
          holder={buyer}
          you={buyer === who}
          trading={playing}
          cash={purse?.cash ?? 0}
          organizer={organizer && !locked}
        />
      ))}

      {playing ? <OpenMarket run={run} /> : null}
    </section>
  );
}

function MarketCard({
  row,
  state,
  run,
  holder,
  you,
  trading: playing,
  cash,
  organizer,
}: {
  row: MarketRow;
  state: State;
  run: Run;
  /** Whose position shows and who buys: the player, or whoever a Clerk's desk is buying for. */
  holder: Attendee | null;
  you: boolean;
  trading: boolean;
  cash: number;
  organizer: boolean;
}) {
  const { market, chance, volume, mine } = row;
  const [side, setSide] = useState<Side | null>(null);
  const [amount, setAmount] = useState<number>(BUY_DOLLARS[1]);
  /** A resolution pays out and cannot be undone, so it takes a second tap. */
  const [ruling, setRuling] = useState<Side | 'void' | null>(null);
  const trading = playing && market.status === 'open' && holder !== null;
  const buyer = holder;
  // Settled markets show what a share paid, as Kalshi does: $1 or nothing.
  const label = (option: Side) =>
    market.status === 'resolved' ? (market.outcome === option ? '$1' : '0¢') : priceLabel(option === 'yes' ? chance : 1 - chance);
  const offer = side ? quote(state, market.id, side, amount) : null;

  const band =
    market.status === 'open'
      ? `Open${market.closes ? ` · closes ${market.closes}` : ''}`
      : market.status === 'closed'
        ? 'Trading closed'
        : market.status === 'resolved'
          ? `Resolved ${SIDE[market.outcome!]}`
          : 'Voided, every buy refunded';

  function buy(event: FormEvent) {
    event.preventDefault();
    if (!side || !buyer || !offer) return;
    // Read off the saved trade, since another tab may have moved the price since the quote.
    const note = (next: State) =>
      `${you ? 'Bought' : `${buyer} bought`} ${shares(next.trades[next.trades.length - 1].shares)} ${SIDE[side]} shares.`;
    if (run({ type: 'buy', market: market.id, buyer, side, dollars: amount }, note)) setSide(null);
  }

  return (
    <Card
      band={band}
      title={market.question}
      tone={TONE[market.status]}
      footer={
        <p>
          {dollars(volume)} traded
          {mine.cents > 0
            ? `. ${you ? 'You' : holder}: ${holding(mine)}, ${dollars(mine.cents)} ${market.status === 'void' ? 'refunded' : 'in'}`
            : ''}
          {market.status === 'resolved' && mine.cents > 0 ? `. Paid ${dollars(mine.paid)}` : ''}
        </p>
      }
    >
      <div className="market-prices" role="group" aria-label={`Prices for: ${market.question}`}>
        {(['yes', 'no'] as const).map((option) =>
          trading ? (
            <button
              key={option}
              type="button"
              className={`market-side market-${option}${side === option ? ' chosen' : ''}`}
              aria-pressed={side === option}
              onClick={() => setSide(side === option ? null : option)}
            >
              <span>{SIDE[option]}</span> <span className="market-price">{label(option)}</span>
            </button>
          ) : (
            <p key={option} className={`market-side market-${option}`}>
              <span>{SIDE[option]}</span> <span className="market-price">{label(option)}</span>
            </p>
          ),
        )}
      </div>

      {trading && side && offer ? (
        <form className="market-buy" onSubmit={buy}>
          <div className="choices" role="group" aria-label="Amount">
            {BUY_DOLLARS.map((option) => (
              <button
                key={option}
                type="button"
                className={amount === option ? 'choice chosen' : 'choice'}
                aria-pressed={amount === option}
                disabled={option * 100 > cash}
                onClick={() => setAmount(option)}
              >
                ${option}
              </button>
            ))}
          </div>
          <p className="hint">
            ${amount} buys {shares(offer.shares)} {SIDE[side]} shares at {priceLabel(offer.average)} each. Pays{' '}
            {dollars(offer.payout)} if {SIDE[side]}.
          </p>
          <button type="submit" className="primary" disabled={amount * 100 > cash}>
            Buy {SIDE[side]} for ${amount}
          </button>
        </form>
      ) : null}

      {organizer && (market.status === 'open' || market.status === 'closed') ? (
        ruling ? (
          <div className="admin">
            <p className="hint">
              {ruling === 'void' ? 'Void it and refund every buy?' : `Resolve ${SIDE[ruling]}? Winning shares pay $1.`}
            </p>
            <button
              type="button"
              className="primary"
              onClick={() => {
                if (run({ type: 'resolveMarket', id: market.id, outcome: ruling }, ruling === 'void' ? 'Voided and refunded.' : `Resolved ${SIDE[ruling]}.`)) {
                  setRuling(null);
                }
              }}
            >
              {ruling === 'void' ? 'Yes, void it' : `Yes, resolve ${SIDE[ruling]}`}
            </button>
            <button type="button" className="quiet" onClick={() => setRuling(null)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="admin">
            {market.status === 'open' ? (
              <button type="button" onClick={() => run({ type: 'closeMarket', id: market.id }, 'Trading closed.')}>
                Close trading
              </button>
            ) : null}
            <button type="button" onClick={() => setRuling('yes')}>
              Resolve Yes
            </button>
            <button type="button" onClick={() => setRuling('no')}>
              Resolve No
            </button>
            <button type="button" className="quiet" onClick={() => setRuling('void')}>
              Void
            </button>
          </div>
        )
      ) : null}
    </Card>
  );
}

const holding = (mine: MarketRow['mine']) =>
  [mine.yes > 0 ? `${shares(mine.yes)} Yes` : '', mine.no > 0 ? `${shares(mine.no)} No` : ''].filter(Boolean).join(' and ');

function OpenMarket({ run }: { run: Run }) {
  const [question, setQuestion] = useState('');
  const [closes, setCloses] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (run({ type: 'openMarket', question, closes }, 'Market open. It starts at 50 cents.')) {
      setQuestion('');
      setCloses('');
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <p className="card-band">New market</p>
      <div className="field">
        <label htmlFor="market-question">A yes or no question</label>
        <input
          id="market-question"
          maxLength={MAX_QUESTION_CHARS}
          value={question}
          placeholder="Does the cake survive the drive?"
          onChange={(event) => setQuestion(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="market-closes">Closes (optional)</label>
        <input
          id="market-closes"
          maxLength={MAX_CLOSES_CHARS}
          value={closes}
          placeholder="When dessert lands"
          onChange={(event) => setCloses(event.target.value)}
        />
      </div>
      <button type="submit" className="primary">
        Open market
      </button>
      <p className="hint">About moments and the group: never bodies, drinking, partners or strangers. A Clerk can void anything.</p>
    </form>
  );
}
