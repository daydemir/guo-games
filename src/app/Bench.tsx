import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ATTENDEES } from '../core/content';
import type { Attendee } from '../core/content';
import {
  ACTS,
  CASE,
  DOCKET,
  FORECAST_WORDS,
  MAX_DOCKET_CHARS,
  MAX_SUBJECT_CHARS,
  MAX_TESTIMONY_CHARS,
  benchCardById,
  benchDeck,
} from '../core/bureau';
import type { BenchCard, DocketKind, WitnessRole } from '../core/bureau';
import { caseNumber } from '../core/actions';
import type { Action } from '../core/actions';
import { caseFile, draftBoard, isOrganizer, me, testimonyView } from '../core/selectors';
import type { State } from '../core/state';
import { Empty } from '../ui/primitives';
import { forgetCard, showCard } from './route';
import { useWakeLock } from './useWakeLock';
import type { Note } from './useParty';

type Run = (action: Action, note?: Note) => boolean;
type Go = (tab: string, anchor?: string | null) => void;

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * The Bench: a stage deck for the phone in the middle of the table. One card at
 * a time, read aloud by a Clerk, who can run every act alone. Votes are a show
 * of hands tapped in by whoever holds the phone. Nothing here needs anyone
 * else's phone, because nothing syncs.
 */
export function Bench({
  state,
  run,
  start,
  onGo,
  banner,
}: {
  state: State;
  run: Run;
  /** A card to open at, from a `#card/...` link. Otherwise the current act, from the top. */
  start: string | null;
  onGo: Go;
  banner: ReactNode;
}) {
  useWakeLock();
  const first = start ? benchCardById(start) : null;
  const act = first?.act ?? state.settings.act;
  const [struck, setStruck] = useState<ReadonlySet<string>>(new Set());
  // Kept here rather than on the card, so stepping back and forth never loses a count.
  const [tallies, setTallies] = useState<Record<string, Tally>>({});
  const deck = benchDeck(act).filter((card) => !struck.has(card.id));
  const [index, setIndex] = useState(() => Math.max(0, first ? deck.findIndex((card) => card.id === first.id) : 0));
  const at = Math.min(index, deck.length - 1);
  const card = deck[at] ?? null;
  const heading = useRef<HTMLHeadingElement>(null);

  const last = deck.length - 1;
  const step = (delta: number) => setIndex((current) => Math.max(0, Math.min(Math.min(current, last) + delta, last)));
  const leave = () => onGo('today');

  // The address follows the card, so a phone that reloads mid-Tribunal comes
  // back to the same place. Focus follows too, so the card is what is announced.
  const cardId = card?.id;
  useEffect(() => {
    if (!cardId) {
      document.getElementById('main')?.focus();
      return;
    }
    showCard(cardId);
    heading.current?.focus();
  }, [cardId]);

  useEffect(() => forgetCard, []);

  // Subscribed afresh each render, so the handler always sees the current deck.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = event.target instanceof HTMLElement ? event.target.tagName : '';
      // Typing stays typing, and Space still presses a focused button.
      if (TYPING.has(tag) || (event.key === ' ' && tag === 'BUTTON')) return;
      if (event.key === 'ArrowRight' || event.key === ' ') step(1);
      else if (event.key === 'ArrowLeft') step(-1);
      else if (event.key === 'Escape') leave();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="bench">
      <header className="bench-head">
        <div>
          <h1>The Bench</h1>
          <p className="bench-count" aria-live="polite">
            {card ? `Card ${at + 1} of ${deck.length} · Act ${ACTS[act].numeral}` : `Act ${ACTS[act].numeral}`}
          </p>
        </div>
        <button type="button" className="quiet" onClick={leave}>
          Leave the Bench
        </button>
      </header>

      {banner}

      <main id="main" className="bench-stage" tabIndex={-1}>
        {card ? (
          <article className="bench-card" aria-labelledby="bench-card-title">
            <p className="card-band">
              {CASE} · Act {ACTS[act].numeral}: {ACTS[act].title}
            </p>
            <h2 id="bench-card-title" ref={heading} tabIndex={-1}>
              {card.title}
            </h2>
            {card.lines.map((line) => (
              <p key={line} className="bench-line">
                {line}
              </p>
            ))}
            {/* Keyed by card, so a half-typed filing or a count never leaks onto the next card. */}
            <CardExtras
              key={card.id}
              card={card}
              state={state}
              run={run}
              onGo={onGo}
              tally={tallies[card.id] ?? NO_VOTES}
              onTally={(tally) => setTallies({ ...tallies, [card.id]: tally })}
            />
          </article>
        ) : (
          <Empty>Every card in this act was struck. The Bench is adjourned.</Empty>
        )}
      </main>

      <nav className="bench-controls" aria-label="Bench controls">
        <button type="button" onClick={() => step(-1)} disabled={at <= 0}>
          Back
        </button>
        <button
          type="button"
          className="quiet"
          disabled={!card}
          onClick={() => card && setStruck(new Set(struck).add(card.id))}
        >
          Strike it
        </button>
        {/* The last card hands the table back rather than dead-ending on a disabled button. */}
        {card && at < last ? (
          <button type="button" className="primary" onClick={() => step(1)}>
            Next card
          </button>
        ) : (
          <button type="button" className="primary" onClick={leave}>
            Adjourn
          </button>
        )}
      </nav>
    </div>
  );
}

type Tally = { a: number; b: number };
const NO_VOTES: Tally = { a: 0, b: 0 };

function CardExtras({
  card,
  state,
  run,
  onGo,
  tally,
  onTally,
}: {
  card: BenchCard;
  state: State;
  run: Run;
  onGo: Go;
  tally: Tally;
  onTally: (tally: Tally) => void;
}) {
  return (
    <>
      {card.show === 'oracle' ? <Oracle state={state} /> : null}
      {card.show === 'incidents' ? (
        <Docket state={state} kind="incident" empty="No incidents were filed. The Bureau finds this suspicious." />
      ) : null}
      {card.show === 'forecasts' ? (
        <Docket state={state} kind="forecast" empty="No forecasts were filed. Conditions remain unknowable." />
      ) : null}
      {card.show === 'testimony' ? <WitnessIntake state={state} run={run} /> : null}
      {card.show === 'reveal' ? <WitnessReveal state={state} run={run} /> : null}
      {card.vote ? <Vote card={card} vote={card.vote} state={state} run={run} count={tally} setCount={onTally} /> : null}
      {card.file ? <FileLine run={run} kinds={[card.file]} /> : null}
      {card.link ? (
        <button type="button" className="primary" onClick={() => onGo(card.link!.tab, card.link!.anchor ?? null)}>
          {card.link.label}
        </button>
      ) : null}
      {card.show === 'testimony' ? <p className="bench-cue">Hand the phone to your left. Do not read ahead.</p> : null}
    </>
  );
}

function Oracle({ state }: { state: State }) {
  const board = draftBoard(state);
  const claimed = board.filter((row) => row.drafter);
  const unclaimed = board.filter((row) => !row.drafter);
  return (
    <>
      <ul className="bench-list">
        {claimed.map(({ fish, drafter }) => (
          <li key={fish.id}>
            <strong>
              {drafter}, {fish.name}.
            </strong>{' '}
            {fish.note}
          </li>
        ))}
      </ul>
      {unclaimed.length > 0 ? (
        <p className="hint">
          Unclaimed auguries are read to the sea. Figuratively. {unclaimed.map((row) => row.fish.name).join(', ')}.
        </p>
      ) : null}
    </>
  );
}

function Docket({ state, kind, empty }: { state: State; kind: 'incident' | 'forecast'; empty: string }) {
  const rows = caseFile(state, [kind], 'oldest');
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ol className="bench-list">
      {rows.map((row) => (
        <li key={row.id}>
          <span className="case-no">{row.label}</span> {row.text}
        </li>
      ))}
    </ol>
  );
}

/** Two big buttons and a show-of-hands count. The Clerk enters the result. */
function Vote({
  card,
  vote,
  state,
  run,
  count,
  setCount,
}: {
  card: BenchCard;
  vote: NonNullable<BenchCard['vote']>;
  state: State;
  run: Run;
  count: Tally;
  setCount: (tally: Tally) => void;
}) {
  const high = Math.max(count.a, count.b);
  const low = Math.min(count.a, count.b);
  const verdict =
    count.a === count.b
      ? `The Gallery is deadlocked, ${count.a} to ${count.b}. The Chief Justice decides.`
      : vote.verdict
          .replace('{winner}', count.a > count.b ? vote.a : vote.b)
          .replace('{a}', String(high))
          .replace('{b}', String(low));

  return (
    <div className="vote">
      <div className="vote-options" role="group" aria-label={`Show of hands on ${card.title}`}>
        {(['a', 'b'] as const).map((side) => (
          <button key={side} type="button" className="vote-option" onClick={() => setCount({ ...count, [side]: count[side] + 1 })}>
            <span>{vote[side]}</span>
            <span className="vote-count" aria-label={`${count[side]} votes`}>
              {count[side]}
            </span>
          </button>
        ))}
      </div>
      <div className="admin">
        {isOrganizer(state) ? (
          <button
            type="button"
            className="primary"
            disabled={count.a + count.b === 0}
            onClick={() => {
              if (run({ type: 'file', kind: 'verdict', text: verdict }, (next) => `Entered as ${caseNumber('verdict', next.docketSeq)}.`)) {
                setCount(NO_VOTES);
              }
            }}
          >
            Enter the verdict
          </button>
        ) : (
          <p className="hint">A Clerk enters verdicts.</p>
        )}
        <button type="button" className="quiet" onClick={() => setCount(NO_VOTES)}>
          Reset the count
        </button>
      </div>
    </div>
  );
}

/**
 * One line into the Case File. The Bench presets the kind; Today offers the
 * public ones. A forecast shows its word count, because seven is the joke.
 */
export function FileLine({ run, kinds }: { run: Run; kinds: readonly DocketKind[] }) {
  const [kind, setKind] = useState(kinds[0]);
  const [text, setText] = useState('');
  const id = `file-${kinds.join('-')}`;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (run({ type: 'file', kind, text }, (next) => `Filed as ${caseNumber(kind, next.docketSeq)}.`)) setText('');
  }
  return (
    <form className="bench-form" onSubmit={submit}>
      {kinds.length > 1 ? (
        <div className="field">
          <label htmlFor={`${id}-kind`}>Kind</label>
          <select id={`${id}-kind`} value={kind} onChange={(event) => setKind(event.target.value as DocketKind)}>
            {kinds.map((option) => (
              <option key={option} value={option}>
                {DOCKET[option].label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor={id}>{kinds.length > 1 ? 'What happened' : DOCKET[kind].label}</label>
        <textarea
          id={id}
          rows={2}
          maxLength={MAX_DOCKET_CHARS}
          value={text}
          placeholder={DOCKET[kind].placeholder}
          onChange={(event) => setText(event.target.value)}
        />
        {kind === 'forecast' ? (
          <p className="hint">
            {words} of {FORECAST_WORDS} words.
          </p>
        ) : null}
      </div>
      <button type="submit" className="primary">
        File it
      </button>
    </form>
  );
}

/**
 * Seven Witnesses, intake. A Clerk names the event, then the phone goes round.
 * Nobody sees anyone else's words until the reveal at the Tribunal.
 */
function WitnessIntake({ state, run }: { state: State; run: Run }) {
  const view = testimonyView(state);
  const organizer = isOrganizer(state);
  const [subject, setSubject] = useState('');
  const [holder, setHolder] = useState<Attendee | ''>('');
  /** Dealt at random from the free roles when a holder is chosen, so a role never points at a person. */
  const [role, setRole] = useState<WitnessRole | null>(null);
  const [text, setText] = useState('');

  const openForm = (
    <form
      className="bench-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (run({ type: 'openTestimony', subject }, 'Testimony is open. Pass the phone.')) setSubject('');
      }}
    >
      {view?.revealed ? <p className="hint">The last testimony is already in the record.</p> : null}
      <div className="field">
        <label htmlFor="witness-subject">
          {view && !view.revealed ? 'Or start over with a different event' : 'Name one small thing that just happened'}
        </label>
        <input
          id="witness-subject"
          maxLength={MAX_SUBJECT_CHARS}
          value={subject}
          placeholder="The cooler lid. A sandal. The door."
          onChange={(event) => setSubject(event.target.value)}
        />
      </div>
      <button type="submit" className={view && !view.revealed ? '' : 'primary'}>
        Open testimony
      </button>
    </form>
  );

  if (!view || view.revealed) {
    return organizer ? openForm : <p className="hint">A Clerk opens testimony on the Bench phone.</p>;
  }

  const self = me(state);
  const choices = organizer ? view.pending : view.pending.filter((who) => who === self);

  return (
    <div className="bench-form">
      <p className="bench-matter">On the matter of: {view.subject}</p>
      <p className="hint" aria-live="polite">
        {view.count} of {ATTENDEES.length} witnesses have testified. Read out at the Tribunal.
      </p>
      {choices.length === 0 ? (
        <p className="hint">{organizer ? 'Everyone has testified.' : 'Your testimony is sworn, or a Clerk takes it.'}</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!holder || !role) return;
            if (run({ type: 'testify', author: holder, role, text }, 'Sworn. Hand the phone on. Do not read ahead.')) {
              setHolder('');
              setRole(null);
              setText('');
              // The button just pressed is gone. Land on the picker for the next
              // witness, so a stray Space cannot skip the card.
              requestAnimationFrame(() =>
                (document.getElementById('witness-holder') ?? document.getElementById('bench-card-title'))?.focus(),
              );
            }
          }}
        >
          <div className="field">
            <label htmlFor="witness-holder">Who is holding the phone?</label>
            <select
              id="witness-holder"
              value={holder}
              onChange={(event) => {
                setHolder(event.target.value as Attendee | '');
                setRole(view.roles[Math.floor(Math.random() * view.roles.length)] ?? null);
              }}
            >
              <option value="">Choose</option>
              {choices.map((who) => (
                <option key={who} value={who}>
                  {who}
                </option>
              ))}
            </select>
          </div>
          {holder ? (
            <>
              <p className="bench-role">You are the {role}.</p>
              <div className="field">
                <label htmlFor="witness-text">Your testimony (twelve words or fewer)</label>
                <textarea
                  id="witness-text"
                  rows={2}
                  maxLength={MAX_TESTIMONY_CHARS}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
              </div>
              <button type="submit" className="primary">
                Swear to it
              </button>
            </>
          ) : null}
        </form>
      )}
      {/* Until two have sworn, a Clerk can start over, so a group that declines never leaves this stuck. */}
      {organizer && view.count < 2 ? openForm : null}
    </div>
  );
}

/** Seven Witnesses, reveal. Roles and words only. Authors are never on screen. */
function WitnessReveal({ state, run }: { state: State; run: Run }) {
  const view = testimonyView(state);
  const organizer = isOrganizer(state);
  if (!view) return <Empty>No testimony was taken. The Bureau notes the silence.</Empty>;

  if (!view.revealed) {
    return (
      <div className="bench-form">
        <p className="bench-matter">On the matter of: {view.subject}</p>
        <p className="hint">{view.count} sealed accounts are waiting.</p>
        {organizer ? (
          <button type="button" className="primary" onClick={() => run({ type: 'revealTestimony' }, 'The testimony is unsealed.')}>
            Read the testimony
          </button>
        ) : (
          <p className="hint">A Clerk unseals the testimony.</p>
        )}
      </div>
    );
  }

  return (
    <div className="bench-form">
      <p className="bench-matter">On the matter of: {view.subject}</p>
      {view.entries.map((entry) => (
        <section key={entry.id} className="testimony" aria-label={`Testimony of the ${entry.role}`}>
          <h3>Testimony of the {entry.role}</h3>
          <p>{entry.text}</p>
          {organizer ? (
            <button
              type="button"
              className="quiet"
              aria-label={`Strike the testimony of the ${entry.role}`}
              onClick={() => run({ type: 'strikeTestimony', id: entry.id }, 'Struck. No reason owed.')}
            >
              Strike it
            </button>
          ) : null}
        </section>
      ))}
      {view.entries.length === 0 ? <Empty>Every account was struck. The record is silent.</Empty> : null}
    </div>
  );
}
