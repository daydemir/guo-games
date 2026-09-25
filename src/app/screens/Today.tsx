import { useEffect, useRef, useState } from 'react';
import { isAttendee } from '../../core/content';
import { ACTS, ACT_NUMBERS, CASE, PUBLIC_KINDS } from '../../core/bureau';
import { priceLabel } from '../../core/market';
import type { Act } from '../../core/bureau';
import type { Action } from '../../core/actions';
import {
  caseFile,
  directive,
  marketBoard,
  isOrganizer,
  me,
  myBounty,
  myFish,
  nextAction,
  picksLeft,
  privateMission,
  standings,
} from '../../core/selectors';
import { closingLabel, isReadOnly, relativeTime } from '../../core/time';
import type { State } from '../../core/state';
import { Card, Empty, Screen, Stat } from '../../ui/primitives';
import { FileLine } from '../Bench';
import type { Note } from '../useParty';

type Run = (action: Action, note?: Note) => boolean;
type Go = (tab: string, anchor?: string | null) => void;

const MISSION_LABEL = { sealed: 'Unopened', accepted: 'Under way', done: 'Done', void: 'Passed' } as const;
const BOUNTY_LABEL = { open: 'open', claimed: 'needs a witness', confirmed: 'confirmed', void: 'voided' } as const;

/** How much of the feed shows before someone asks for the rest. */
const FEED_PREVIEW = 5;

/**
 * Home. One action, the Bureau's current act, one glance at the day, and the
 * shared feed. The point of the app is to stop looking at the app, so nothing
 * here is a list of chores: everything past the first card is optional.
 */
export function Today({
  state,
  now,
  locked,
  run,
  onGo,
}: {
  state: State;
  now: number;
  locked: boolean;
  run: Run;
  onGo: Go;
}) {
  const [wholeFeed, setWholeFeed] = useState(false);
  const [draws, setDraws] = useState(0);
  const next = nextAction(state, now);
  const closed = isReadOnly(state, now);
  const playing = isAttendee(me(state));
  const mission = privateMission(state);
  const held = myBounty(state);
  const fish = myFish(state);
  const { tab: target, anchor } = next;
  const feed = wholeFeed ? state.feed : state.feed.slice(0, FEED_PREVIEW);

  return (
    <Screen title="Today" lede={`${CASE} is open. One thing at a time, then the phone goes back in your pocket.`}>
      <Card band="Next" title={next.title} tone="live">
        <p>{next.body}</p>
        {target ? (
          <button className="primary" type="button" onClick={() => onGo(target, anchor)}>
            Take me there
          </button>
        ) : null}
      </Card>

      <CaseCard state={state} locked={locked} run={run} onGo={onGo} />

      <MarketsCard state={state} onGo={onGo} />

      {fish ? (
        <Card band="Your augury" title={fish.name}>
          <p className="oracle-text">{fish.note}</p>
          <p className="hint">Prophecies may fulfil themselves. They may not be helped.</p>
        </Card>
      ) : null}

      {!closed ? (
        <Card
          band="Bureau Directive"
          title="For a group that cannot decide"
          footer={<p>Binding unless vetoed. Vetoes are free.</p>}
        >
          <p className="oracle-text">{directive(now, draws)}</p>
          <button type="button" onClick={() => setDraws(draws + 1)}>
            Draw another
          </button>
        </Card>
      ) : null}

      <CaseFile state={state} now={now} locked={locked} run={run} />

      {playing ? (
        <Card band="Where you stand" title="Your day so far">
          <div className="stats">
            <Stat label="Picks left" value={picksLeft(state)} />
            <Stat label="Your fish" value={fish ? fish.name : 'Not drafted'} />
            <Stat label="Bounty" value={held ? `${held.bounty.title}, ${BOUNTY_LABEL[held.status]}` : 'None yet'} />
            <Stat label="Mission" value={mission ? MISSION_LABEL[mission.status] : 'None'} />
            <Stat label="Closes" value={closingLabel(state, now)} />
          </div>
          {state.settings.awards === 'stories' ? (
            <p className="hint">Nobody gets ranked. Everyone gets an award card at dinner, written from the day.</p>
          ) : standings(state) === null ? (
            <p className="hint">Standings stay sealed until dinner, on purpose. This is a day out, not a tournament.</p>
          ) : null}
        </Card>
      ) : null}

      <section className="group" aria-labelledby="feed-heading">
        <h3 className="group-head" id="feed-heading">
          Feed
        </h3>
        {state.feed.length === 0 ? (
          <Empty>Nothing has happened yet. That is allowed.</Empty>
        ) : (
          <ol className="feed feed-full">
            {feed.map((event) => (
              <li key={event.id}>
                <span>{event.text}</span>
                <time dateTime={new Date(event.at).toISOString()}>{relativeTime(event.at, now)}</time>
              </li>
            ))}
          </ol>
        )}
        {state.feed.length > FEED_PREVIEW ? (
          <button type="button" className="quiet feed-more" onClick={() => setWholeFeed(!wholeFeed)}>
            {wholeFeed ? 'Show less' : `Show all ${state.feed.length}`}
          </button>
        ) : null}
        <p className="hint">Public facts only. Missions, vault stories and sealed notes never land here.</p>
      </section>
    </Screen>
  );
}

/**
 * The Bureau's current act. A Clerk moves the act, copies the Dispatch memo
 * for the group chat, and convenes the Bench: at most three taps per act.
 */
function CaseCard({ state, locked, run, onGo }: { state: State; locked: boolean; run: Run; onGo: Go }) {
  const act = state.settings.act;
  const info = ACTS[act];
  /** The act a memo was copied for, and the memo itself when the clipboard refused it. */
  const [copied, setCopied] = useState<{ act: Act; fallback: string | null } | null>(null);
  const shown = copied?.act === act ? copied : null;
  // Selected once when it appears, not on every render, so it never steals focus from typing.
  const fallbackBox = useRef<HTMLTextAreaElement>(null);
  useEffect(() => fallbackBox.current?.select(), [shown?.fallback]);

  async function copy() {
    const memo = info.memo(`${location.origin}${import.meta.env.BASE_URL}`);
    try {
      await navigator.clipboard.writeText(memo);
      setCopied({ act, fallback: null });
    } catch {
      setCopied({ act, fallback: memo });
    }
  }

  return (
    <Card band="Bureau of the Uncaught Fish" title={`Act ${info.numeral}: ${info.title}`}>
      <p>{info.body}</p>
      {isOrganizer(state) && !locked ? (
        <>
          <div className="segmented" role="group" aria-label="Act">
            {ACT_NUMBERS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === act}
                onClick={() => run({ type: 'setAct', act: option }, `Act ${ACTS[option].numeral} is open.`)}
              >
                {ACTS[option].numeral} {ACTS[option].label}
              </button>
            ))}
          </div>
          <div className="admin">
            <button type="button" className="primary" onClick={() => onGo('bench')}>
              Convene the Bench
            </button>
            <button type="button" onClick={() => void copy()}>
              Copy dispatch
            </button>
          </div>
          {shown && !shown.fallback ? (
            <p className="hint" role="status">
              Dispatch copied. Paste it in the group chat.
            </p>
          ) : null}
          {shown?.fallback ? (
            <div className="field">
              <label htmlFor="dispatch">Copy this into the group chat</label>
              <textarea
                id="dispatch"
                readOnly
                rows={5}
                value={shown.fallback}
                ref={fallbackBox}
              />
            </div>
          ) : null}
        </>
      ) : (
        <p className="hint">
          Deniz and Nick are the Clerks. The Bureau convenes on a Clerk’s phone, and orders arrive in the group chat.
        </p>
      )}
    </Card>
  );
}

/** How many filings show before someone asks for the rest. */
const CASE_PREVIEW = 3;

/**
 * Incident Reports and Fish Weather. Public on this phone, and anyone playing
 * may strike anything, which deletes it outright.
 */
function CaseFile({ state, now, locked, run }: { state: State; now: number; locked: boolean; run: Run }) {
  const [whole, setWhole] = useState(false);
  const rows = caseFile(state);
  const playing = isAttendee(me(state)) && !locked;
  const shown = whole ? rows : rows.slice(0, CASE_PREVIEW);

  return (
    <section className="group" aria-labelledby="case-file">
      <h3 className="group-head" id="case-file" tabIndex={-1}>
        Case File
      </h3>
      {playing ? (
        <Card band="Evidence" title="File it">
          <FileLine run={run} kinds={PUBLIC_KINDS} />
          <p className="hint">Public on this phone. Objects, rooms and snacks only. Anyone may strike anything, no reason owed.</p>
        </Card>
      ) : null}
      {rows.length === 0 ? (
        <Empty>The record is empty. The fish is still out there.</Empty>
      ) : (
        <ol className="feed feed-full case-file">
          {shown.map((row) => (
            <li key={row.id}>
              <span>
                <span className="case-no">{row.label}</span> {row.text}
              </span>
              <span className="case-meta">
                <time dateTime={new Date(row.at).toISOString()}>
                  {row.author}, {relativeTime(row.at, now)}
                </time>
                {playing ? (
                  <button
                    type="button"
                    className="quiet"
                    aria-label={`Strike ${row.label} from the record`}
                    onClick={() => run({ type: 'strike', id: row.id }, 'Struck. No reason owed.')}
                  >
                    Strike it
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      )}
      {rows.length > CASE_PREVIEW ? (
        <button type="button" className="quiet feed-more" onClick={() => setWhole(!whole)}>
          {whole ? 'Show less' : `Show all ${rows.length}`}
        </button>
      ) : null}
    </section>
  );
}

/** The live Wedding Markets at a glance, and the way in. Hidden until one opens. */
function MarketsCard({ state, onGo }: { state: State; onGo: Go }) {
  const live = marketBoard(state, null).filter((row) => row.market.status === 'open');
  if (live.length === 0) return null;
  return (
    <Card band="Wedding Markets" title={`${live.length} open market${live.length === 1 ? '' : 's'}`}>
      <ul className="market-glance">
        {live.slice(0, 3).map(({ market, chance }) => (
          <li key={market.id}>
            <span>{market.question}</span>
            <span className="market-price">Yes {priceLabel(chance)}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="primary" onClick={() => onGo('picks', 'markets')}>
        Trade
      </button>
      <p className="hint">Pretend dollars only. Nothing real changes hands.</p>
    </Card>
  );
}
