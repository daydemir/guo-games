import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ATTENDEES, MAX_MEMORIES, MAX_STORY_CHARS, MOMENTS, isAttendee } from '../../core/content';
import type { Attendee, Moment } from '../../core/content';
import { MAX_FILE_BYTES, isImage, validateMedia } from '../../core/media';
import type { Media } from '../../core/media';
import { isOrganizer, me, organizerInbox, vaultEntries } from '../../core/selectors';
import { relativeTime } from '../../core/time';
import type { Action } from '../../core/actions';
import type { Memory, State } from '../../core/state';
import { Card, Empty, Screen } from '../../ui/primitives';

/**
 * The Nostalgia Vault. Text, a photo, or a short voice note, filed against the
 * person and the moment it belongs to. Nothing is public until an organizer
 * reads it out at dinner.
 */
export function Vault({
  state,
  locked,
  now,
  run,
  onProblem,
}: {
  state: State;
  locked: boolean;
  now: number;
  run: (action: Action, note?: string) => void;
  onProblem: (message: string) => void;
}) {
  const who = me(state);
  const organizer = isOrganizer(state);
  const visible = vaultEntries(state);
  const inbox = organizerInbox(state);

  return (
    <Screen
      title="Nostalgia Vault"
      lede={`${state.vault.length} of ${MAX_MEMORIES} saved on this device. Nothing leaves it.`}
    >
      {isAttendee(who) && !locked ? <MemoryForm state={state} run={run} onProblem={onProblem} /> : null}

      <section className="group" aria-labelledby="vault-mine">
        <h3 className="group-head" id="vault-mine">
          What you can see
        </h3>
        {visible.length === 0 ? (
          <Empty>Nothing yet. Yours will show up here, and everyone else&apos;s at dinner.</Empty>
        ) : (
          visible.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              now={now}
              canWithdraw={!locked && (memory.author === who || organizer)}
              onWithdraw={() => run({ type: 'removeMemory', id: memory.id }, 'Withdrawn.')}
            />
          ))
        )}
      </section>

      {organizer ? (
        <section className="group" aria-labelledby="vault-inbox">
          <h3 className="group-head" id="vault-inbox">
            Organizer inbox
          </h3>
          <p className="hint">
            Deniz and Nick only. Grouped by who each memory is about, so dinner can be run in order.
          </p>
          {inbox.length === 0 ? (
            <Empty>Nothing submitted yet.</Empty>
          ) : (
            inbox.map((group) => (
              <Card key={group.about} band="About" title={group.about}>
                <ul className="inbox">
                  {group.memories.map((memory) => (
                    <li key={memory.id}>
                      <p>
                        <strong>{memory.moment}</strong> from {memory.author}
                        {memory.revealed ? ' (read out)' : ''}
                      </p>
                      <p>{memory.text || 'A file with no words.'}</p>
                      {!memory.revealed && state.dinner && !locked ? (
                        <button type="button" onClick={() => run({ type: 'revealMemory', id: memory.id })}>
                          Read this out
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            ))
          )}
          {!state.dinner ? <p className="hint">Open dinner on the Dinner tab before anything can be read out.</p> : null}
        </section>
      ) : null}

      <p className="fineprint">
        Photos and voice notes are stored inside this browser as text, never uploaded. Anyone holding this
        device can open them. Keep each file under 300 KB.
      </p>
    </Screen>
  );
}

function MemoryCard({
  memory,
  now,
  canWithdraw,
  onWithdraw,
}: {
  memory: Memory;
  now: number;
  canWithdraw: boolean;
  onWithdraw: () => void;
}) {
  return (
    <Card
      band={`${memory.moment} / about ${memory.about}`}
      title={memory.revealed ? 'Read out at dinner' : 'Sealed until dinner'}
      tone={memory.revealed ? 'settled' : 'plain'}
      footer={<time>{relativeTime(memory.at, now)}</time>}
    >
      {memory.text ? <p>{memory.text}</p> : null}
      {memory.media ? (
        isImage(memory.media) ? (
          <img className="memory-image" src={memory.media.data} alt={`Attached to a memory about ${memory.about}`} />
        ) : (
          <audio controls src={memory.media.data}>
            <track kind="captions" />
          </audio>
        )
      ) : null}
      {canWithdraw ? (
        <button type="button" className="quiet" onClick={onWithdraw}>
          Withdraw this
        </button>
      ) : null}
    </Card>
  );
}

function MemoryForm({
  state,
  run,
  onProblem,
}: {
  state: State;
  run: (action: Action, note?: string) => void;
  onProblem: (message: string) => void;
}) {
  const [about, setAbout] = useState<Attendee>('Kevin');
  const [moment, setMoment] = useState<Moment>('Before Maui');
  const [text, setText] = useState('');
  const [media, setMedia] = useState<Media | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return setMedia(null);
    if (file.size > MAX_FILE_BYTES) {
      onProblem('Keep each file under 300 KB. A short voice note or a resized photo works well.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => onProblem('That file could not be read. Try another one.');
    reader.onload = () => {
      const candidate: Media = { name: file.name, type: file.type, bytes: file.size, data: String(reader.result) };
      try {
        validateMedia(candidate);
        setMedia(candidate);
      } catch (error) {
        onProblem(error instanceof Error ? error.message : 'That file could not be read.');
        event.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    run({ type: 'submitMemory', about, moment, text, media }, 'Saved to the vault.');
    setText('');
    setMedia(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  const full = state.vault.length >= MAX_MEMORIES;

  return (
    <form className="card" onSubmit={submit} aria-labelledby="vault-add">
      <h3 className="card-title" id="vault-add">
        Add a memory
      </h3>

      <div className="two-up">
        <div className="field">
          <label htmlFor="memory-about">About</label>
          <select id="memory-about" value={about} onChange={(event) => setAbout(event.target.value as Attendee)}>
            {ATTENDEES.map((attendee) => (
              <option key={attendee} value={attendee}>
                {attendee}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="memory-moment">Moment</label>
          <select id="memory-moment" value={moment} onChange={(event) => setMoment(event.target.value as Moment)}>
            {MOMENTS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="memory-text">The story</label>
        <textarea
          id="memory-text"
          rows={4}
          maxLength={MAX_STORY_CHARS}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="One thing you would want read out at dinner."
        />
        <p className="hint">
          {text.length} of {MAX_STORY_CHARS} characters.
        </p>
      </div>

      <div className="field">
        <label htmlFor="memory-file">Photo or voice note (optional)</label>
        <input
          id="memory-file"
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,audio/*"
          onChange={pickFile}
        />
        <p className="hint">{media ? `${media.name} attached.` : 'Under 300 KB. Stays on this device.'}</p>
      </div>

      <button className="primary" type="submit" disabled={full}>
        {full ? 'This device is full' : 'Save to the vault'}
      </button>
    </form>
  );
}
