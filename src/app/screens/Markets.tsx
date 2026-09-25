import { useState } from 'react';
import type { FormEvent } from 'react';
import { ORGANIZERS, isAttendee } from '../../core/content';
import type { Attendee } from '../../core/content';
import {
  BUY_DOLLARS,
  MAX_CLOSES_CHARS,
  MAX_QUESTION_CHARS,
  board,
  dollars,
  isClerk,
  net,
  priceLabel,
  quote,
  standings,
  wallet,
} from '../../core/market';
import type { Ledger, MarketRow, Side } from '../../core/market';
import { me } from '../../core/selectors';
import type { State } from '../../core/state';
import { Card, Empty } from '../../ui/primitives';
import type { Live } from '../useMarkets';

const SIDE: Record<Side, string> = { yes: 'Yes', no: 'No' };
const TONE = { open: 'live', closed: 'plain', resolved: 'settled', void: 'void' } as const;
const CLERKS = ORGANIZERS.join(' or ');
const LATEST = 6;
const shares = (count: number) => count.toFixed(1);
const newId = () => globalThis.crypto.randomUUID();

/**
 * Wedding Markets: yes or no questions that trade like Kalshi, in dollars, on
 * one board shared by every phone on the party link. Tap a side, pick an
 * amount, see what it buys, buy. A Clerk closes trading and resolves; a
 * winning share pays $1.
 */
export function Markets({ state, locked, live }: { state: State; locked: boolean; live: Live }) {
  const who = me(state);
  const player = isAttendee(who) ? who : null;
  const clerk = player !== null && isClerk(player) && !locked;
  const { ledger, status } = live;
  /** Buttons work only while the server is answering: it is the only place a trade happens. */
  const ready = status === 'live' && !live.busy;

  return (
    <section className="group" aria-labelledby="markets">
      <h3 className="group-head" id="markets" tabIndex={-1}>
        Wedding Markets
      </h3>
      <p className="hint group-lede">
        Yes or no questions that trade like Kalshi. Everyone starts with $100, every buy moves the price, and a winning
        share pays $1 when {CLERKS} resolves it. The app keeps score; no real money moves through it.
      </p>

      <Connection live={live} clerk={clerk} />

      {ledger ? (
        <Board ledger={ledger} player={locked ? null : player} viewer={player} clerk={clerk} ready={ready} live={live} />
      ) : null}
    </section>
  );
}

/** Says where the markets are when they are not simply on screen. */
function Connection({ live, clerk }: { live: Live; clerk: boolean }) {
  const { status } = live;
  if (status === 'live') return null;
  if (status === 'connecting') return <p className="hint">Connecting to the market…</p>;
  if (status === 'outdated') {
    return (
      <p className="market-offline" role="status">
        This copy of the app is out of date for the market. Close it and open it again.
      </p>
    );
  }
  if (status === 'down') {
    return (
      <p className="market-offline" role="status">
        Can’t reach the market. It reconnects by itself, and nothing can be bought until it does.
      </p>
    );
  }

  const start = clerk ? (
    <button type="button" className="primary" disabled={live.busy} onClick={() => void live.start()}>
      Start the markets
    </button>
  ) : null;
  return status === 'unknown' ? (
    <Card band="Wedding Markets" title="This party link has expired">
      <p>The market does not know this link. Ask {CLERKS} for the link again.</p>
      <PasteLink live={live} />
      {start}
    </Card>
  ) : (
    <Card band="Wedding Markets" title="Not connected yet">
      {clerk ? (
        <p>Start the markets once, then share the party link in the group chat. Everyone who taps it trades on the same board.</p>
      ) : (
        <p>The markets are shared on a party link. Tap the one {CLERKS} posted in the group chat.</p>
      )}
      <PasteLink live={live} />
      {start}
    </Card>
  );
}

const LINK = /#\/?live\/([A-Za-z0-9_-]{22})\b/;

/**
 * An app added to an iPhone home screen keeps its own storage, and a tapped
 * link opens in Safari instead, so the installed app takes the link by paste.
 */
function PasteLink({ live }: { live: Live }) {
  const [text, setText] = useState('');
  const [wrong, setWrong] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const key = LINK.exec(text)?.[1];
    setWrong(!key);
    if (key) live.adopt(key);
  }

  return (
    <form className="field" onSubmit={submit}>
      <label htmlFor="paste-link">Opened the app from your home screen? Paste the party link</label>
      <input id="paste-link" value={text} autoComplete="off" onChange={(event) => setText(event.target.value)} />
      {wrong ? <p className="hint">That is not a party link. It ends in #live/ and a code.</p> : null}
      <button type="submit">Join the markets</button>
    </form>
  );
}

function Board({
  ledger,
  player,
  viewer,
  clerk,
  ready,
  live,
}: {
  ledger: Ledger;
  /** Who trades from this phone, or null for a spectator or a closed trip. */
  player: Attendee | null;
  /** Whose position shows. */
  viewer: Attendee | null;
  clerk: boolean;
  ready: boolean;
  live: Live;
}) {
  const purse = viewer ? wallet(ledger, viewer) : null;
  const rows = board(ledger, viewer);

  return (
    <>
      {purse ? (
        <Card band="Your dollars" title={`You have ${dollars(purse.cash)}`}>
          <p className="hint">{dollars(purse.inPlay)} riding on markets that have not been resolved.</p>
        </Card>
      ) : null}

      {rows.length === 0 ? <Empty>No markets yet. Ask the first question.</Empty> : null}
      {rows.map((row) => (
        <MarketCard key={row.market.id} row={row} ledger={ledger} player={player} clerk={clerk} ready={ready} live={live} />
      ))}

      {player ? <OpenMarket player={player} ready={ready} live={live} /> : null}

      <Standings ledger={ledger} viewer={viewer} />
      <Latest ledger={ledger} />
      <Invite live={live} />
    </>
  );
}

function MarketCard({
  row,
  ledger,
  player,
  clerk,
  ready,
  live,
}: {
  row: MarketRow;
  ledger: Ledger;
  player: Attendee | null;
  clerk: boolean;
  ready: boolean;
  live: Live;
}) {
  const { market, chance, volume, mine } = row;
  const [side, setSide] = useState<Side | null>(null);
  const [amount, setAmount] = useState<number>(BUY_DOLLARS[1]);
  /** A resolution pays out and cannot be undone, so it takes a second tap. */
  const [ruling, setRuling] = useState<Side | 'void' | null>(null);
  const trading = player !== null && market.status === 'open';
  const cash = player ? wallet(ledger, player).cash : 0;
  const liveMarket = market.status === 'open' || market.status === 'closed';
  // Settled markets show what a share paid, as Kalshi does: $1 or nothing.
  const label = (option: Side) =>
    market.status === 'resolved' ? (market.outcome === option ? '$1' : '0¢') : priceLabel(option === 'yes' ? chance : 1 - chance);
  const offer = side ? quote(ledger, market.id, side, amount) : null;

  const band =
    market.status === 'open'
      ? `Open${market.closes ? ` · closes ${market.closes}` : ''}`
      : market.status === 'closed'
        ? 'Trading closed'
        : market.status === 'resolved'
          ? `Resolved ${SIDE[market.outcome!]}`
          : 'Voided, every buy refunded';

  async function buy(event: FormEvent) {
    event.preventDefault();
    if (!side || !player) return;
    const id = newId();
    // Read off the trade the server made: the price may have moved since the quote.
    const note = (next: Ledger) => {
      const trade = next.trades.find((item) => item.id === id);
      return trade ? `Bought ${shares(trade.shares)} ${SIDE[trade.side]} shares for ${dollars(trade.cents)}.` : 'Bought.';
    };
    if (await live.send(player, { type: 'buy', id, market: market.id, side, dollars: amount }, note)) setSide(null);
  }

  async function rule(choice: Side | 'void') {
    if (!player) return;
    const done =
      choice === 'void'
        ? await live.send(player, { type: 'void', market: market.id }, 'Voided. Every buy was refunded.')
        : await live.send(player, { type: 'resolve', market: market.id, outcome: choice }, `Resolved ${SIDE[choice]}.`);
    if (done) setRuling(null);
  }

  return (
    <Card
      band={band}
      title={market.question}
      tone={TONE[market.status]}
      footer={
        <p>
          {dollars(volume)} traded
          {mine.cents > 0 ? `. You: ${holding(mine)}, ${dollars(mine.cents)} ${market.status === 'void' ? 'refunded' : 'in'}` : ''}
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
          <button type="submit" className="primary" disabled={!ready || amount * 100 > cash}>
            Buy {SIDE[side]} for ${amount}
          </button>
        </form>
      ) : null}

      {/* Other people's money rides on every market, so only a Clerk closes, resolves or voids one. */}
      {clerk && liveMarket ? (
        ruling ? (
          <div className="admin">
            <p className="hint">
              {ruling === 'void'
                ? 'Void it, refund every buy, and clear the question?'
                : `Resolve ${SIDE[ruling]}? Winning shares pay $1. This cannot be undone.`}
            </p>
            <button type="button" className="primary" disabled={!ready} onClick={() => void rule(ruling)}>
              {ruling === 'void' ? 'Yes, void it' : `Yes, resolve ${SIDE[ruling]}`}
            </button>
            <button type="button" className="quiet" onClick={() => setRuling(null)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="admin">
            {market.status === 'open' && player ? (
              <button
                type="button"
                disabled={!ready}
                onClick={() => void live.send(player, { type: 'close', market: market.id }, 'Trading closed.')}
              >
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

function OpenMarket({ player, ready, live }: { player: Attendee; ready: boolean; live: Live }) {
  const [question, setQuestion] = useState('');
  const [closes, setCloses] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const command = { type: 'open', id: newId(), question, closes } as const;
    if (await live.send(player, command, 'Market open. It starts at 50 cents.')) {
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
          placeholder="Does the best man mention the boat?"
          onChange={(event) => setQuestion(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="market-closes">Closes (optional)</label>
        <input
          id="market-closes"
          maxLength={MAX_CLOSES_CHARS}
          value={closes}
          placeholder="End of speeches"
          onChange={(event) => setCloses(event.target.value)}
        />
      </div>
      <button type="submit" className="primary" disabled={!ready}>
        Open market
      </button>
      <p className="hint">Everyone on the party link sees it at once. About moments and the group: never bodies, drinking, partners or strangers.</p>
    </form>
  );
}

/**
 * Where everyone stands. Money riding on an open market counts at what it
 * cost, so once every market is settled this is the end-of-night tally.
 */
function Standings({ ledger, viewer }: { ledger: Ledger; viewer: Attendee | null }) {
  const { players, house } = standings(ledger);
  return (
    <Card band="Standings" title="Up or down from $100" footer={<p>Open bets count at what they cost until they are resolved.</p>}>
      <ol className="market-glance" aria-label="Standings">
        {players.map((row) => (
          <li key={row.who}>
            <span>{row.who === viewer ? `${row.who} (you)` : row.who}</span>
            <span className="market-price">{net(row.net)}</span>
          </li>
        ))}
        {house !== 0 ? (
          <li className="market-house">
            <span>The market maker</span>
            <span className="market-price">{net(house)}</span>
          </li>
        ) : null}
      </ol>
    </Card>
  );
}

/** The last few trades, so the board feels like a room. */
function Latest({ ledger }: { ledger: Ledger }) {
  const trades = ledger.trades.slice(-LATEST).reverse();
  if (trades.length === 0) return null;
  const question = (id: string) => ledger.markets.find((market) => market.id === id)?.question ?? '';
  return (
    <Card band="Latest trades">
      <ul className="market-glance" aria-label="Latest trades">
        {trades.map((trade) => (
          <li key={trade.id}>
            <span>
              {trade.buyer} bought {SIDE[trade.side]}: {question(trade.market)}
            </span>
            <span className="market-price">{dollars(trade.cents)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The party link, for bringing someone in. */
function Invite({ live }: { live: Live }) {
  const [copied, setCopied] = useState(false);
  if (!live.invite) return null;
  const link = live.invite;

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Wedding Markets', url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      }
    } catch {
      // Dismissing the share sheet lands here too. The link is on screen to copy by hand.
    }
  }

  return (
    <Card band="Party link" title="Bring someone in">
      <p className="hint">Anyone with this link sees and trades on these markets. Share it in the group chat, nowhere public.</p>
      <div className="field">
        <label htmlFor="party-link">Party link</label>
        <input id="party-link" readOnly value={link} onFocus={(event) => event.target.select()} />
      </div>
      <button type="button" onClick={() => void share()}>
        {copied ? 'Copied' : 'Share the link'}
      </button>
    </Card>
  );
}
