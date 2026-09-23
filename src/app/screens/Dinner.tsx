import { useState } from 'react';
import type { FormEvent } from 'react';
import { ATTENDEES, FUTURE_OPENS_AT, MAX_FUTURE_CHARS, isAttendee } from '../../core/content';
import {
  awardCards,
  futureEntries,
  isOrganizer,
  me,
  organizerInbox,
  sealedCount,
  standings,
} from '../../core/selectors';
import { isImage } from '../../core/media';
import { formatDate } from '../../core/time';
import type { Action } from '../../core/actions';
import type { State } from '../../core/state';
import { Card, Empty, Screen } from '../../ui/primitives';

/**
 * Dinner mode: settle up, reveal, and close the day with something to open in
 * five years. Story awards are the default because a ranked list of friends is
 * a worse ending than a named card for every person at the table.
 */
export function Dinner({
  state,
  locked,
  now,
  run,
}: {
  state: State;
  locked: boolean;
  now: number;
  run: (action: Action, note?: string) => boolean;
}) {
  const organizer = isOrganizer(state);
  const table = standings(state);
  const cards = awardCards(state);
  const opened = futureEntries(state, now);

  return (
    <Screen
      title="Dinner"
      lede={state.dinner ? 'Dinner is open. Settle, reveal, and toast.' : 'Sealed until an organizer opens it.'}
    >
      {organizer && !state.dinner && !locked ? (
        <Card band="Organizer" title="Open dinner" tone="live">
          <p>
            {state.settings.awards === 'stories' ? 'This prints the award cards' : 'This unseals the standings'} for
            everyone and lets you read stories out of the vault, one at a time.
          </p>
          <button className="primary" type="button" onClick={() => run({ type: 'dinner' }, 'Dinner is open.')}>
            Open dinner
          </button>
        </Card>
      ) : null}

      {state.settings.awards === 'stories' ? (
        <section className="group" aria-labelledby="awards-head">
          <h3 className="group-head" id="awards-head">
            Award cards
          </h3>
          {state.dinner ? (
            <div className="award-grid">
              {cards.map((card, index) => (
                <Card
                  key={card.attendee}
                  band={
                    <>
                      <span>{card.attendee}</span>
                      <span className="card-no">
                        {index + 1} of {cards.length}
                      </span>
                    </>
                  }
                  title={card.title}
                  tone="settled"
                >
                  <p>{card.line}</p>
                </Card>
              ))}
            </div>
          ) : (
            <Empty>Seven cards, one each, written from what actually happened. They print at dinner.</Empty>
          )}
        </section>
      ) : (
        <section className="group" aria-labelledby="standings-head">
          <h3 className="group-head" id="standings-head">
            Standings
          </h3>
          {table === null ? (
            <Empty>Sealed until dinner. An organizer can open them early from their You page.</Empty>
          ) : (
            <ol className="standings">
              {table.map((row, index) => (
                <li key={row.attendee}>
                  <span className="rank">{index + 1}</span>
                  <span className="who">{row.attendee}</span>
                  <span className="points">{row.points}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {state.dinner ? <ReadOut state={state} locked={locked} run={run} /> : null}

      <SealedFuture state={state} locked={locked} run={run} />

      {opened.length > 0 ? (
        <section className="group" aria-labelledby="opened-head">
          <h3 className="group-head" id="opened-head">
            Opened notes
          </h3>
          {opened.map((entry) => (
            <Card key={entry.attendee} band={entry.attendee} title="Written on the trip" tone="settled">
              <p>{entry.text}</p>
            </Card>
          ))}
        </section>
      ) : null}
    </Screen>
  );
}

/**
 * The vault reveal. Everyone sees what has been read out; an organizer also
 * gets the sealed stories, grouped by who they are about, to read one by one.
 */
function ReadOut({
  state,
  locked,
  run,
}: {
  state: State;
  locked: boolean;
  run: (action: Action, note?: string) => boolean;
}) {
  const told = state.vault.filter((memory) => memory.revealed);
  const queue = organizerInbox(state)
    .map((group) => ({ ...group, memories: group.memories.filter((memory) => !memory.revealed) }))
    .filter((group) => group.memories.length > 0);

  return (
    <section className="group" aria-labelledby="readout-head">
      <h3 className="group-head" id="readout-head">
        From the vault
      </h3>
      {told.length === 0 ? (
        <Empty>Nothing read out yet. An organizer picks the stories, one at a time.</Empty>
      ) : (
        told.map((memory) => (
          <Card key={memory.id} band={`About ${memory.about} / ${memory.moment}`} title="Read out at dinner" tone="settled">
            {memory.text ? <p>{memory.text}</p> : null}
            {memory.media && isImage(memory.media) ? (
              <img className="memory-image" src={memory.media.data} alt={`Shared with a memory about ${memory.about}`} />
            ) : null}
            {memory.media && !isImage(memory.media) ? (
              <audio controls src={memory.media.data}>
                <track kind="captions" />
              </audio>
            ) : null}
          </Card>
        ))
      )}

      {queue.length > 0 && !locked ? (
        <Card band="Organizer" title="Still sealed" tone="live">
          <p className="hint">Only you can see these. Read one out and it appears above for everyone.</p>
          <ul className="inbox">
            {queue.flatMap((group) =>
              group.memories.map((memory) => (
                <li key={memory.id}>
                  <p>
                    <strong>About {group.about}</strong>, {memory.moment}, from {memory.author}
                  </p>
                  <p>{memory.text || 'A photo or voice note with no words.'}</p>
                  <button type="button" onClick={() => run({ type: 'revealMemory', id: memory.id }, 'Read out.')}>
                    Read this out
                  </button>
                </li>
              )),
            )}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}

function SealedFuture({
  state,
  locked,
  run,
}: {
  state: State;
  locked: boolean;
  run: (action: Action, note?: string) => boolean;
}) {
  const [text, setText] = useState('');
  const who = me(state);
  const mine = isAttendee(who) ? state.future[who] : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (run({ type: 'sealFuture', text }, 'Sealed. See you in five years.')) setText('');
  }

  return (
    <section className="group" aria-labelledby="sealed-future">
      <h3 className="group-head" id="sealed-future" tabIndex={-1}>
        Sealed Future
      </h3>
      <p className="hint">
        {sealedCount(state)} of {ATTENDEES.length} sealed. Everything opens on {formatDate(FUTURE_OPENS_AT)}.
      </p>

      {mine ? (
        <Card band="Yours" title="Sealed">
          <p>You have written yours. It stays shut until the date above, even for you.</p>
        </Card>
      ) : isAttendee(who) && !locked ? (
        <form className="card" onSubmit={submit}>
          <div className="field">
            <label htmlFor="future-text">One prediction for five years from now</label>
            <textarea
              id="future-text"
              rows={3}
              maxLength={MAX_FUTURE_CHARS}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Where everyone is, what is still true, what Kevin is still doing."
            />
            <p className="hint">
              {text.length} of {MAX_FUTURE_CHARS} characters. One per person, and you cannot edit it later.
            </p>
          </div>
          <button className="primary" type="submit">
            Seal it
          </button>
        </form>
      ) : (
        <Empty>Attendees can seal a note. Spectators get to read them in five years like everyone else.</Empty>
      )}
    </section>
  );
}
