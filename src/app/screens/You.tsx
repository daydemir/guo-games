import { useState } from 'react';
import { COLORS, GUARDRAILS, IDENTITIES, MAX_NAME_CHARS, PARTY_CODE } from '../../core/content';
import type { Color, Identity } from '../../core/content';
import { isOrganizer, me } from '../../core/selectors';
import { formatDate, toLocalInput } from '../../core/time';
import type { Action } from '../../core/actions';
import type { State } from '../../core/state';
import { backupFilename } from '../../core/backup';
import { downloadText } from '../download';
import { Card, Screen } from '../../ui/primitives';

/**
 * Identity, organizer settings, guardrails and the reset. Switching identity is
 * a first-class control because one phone genuinely does get passed around a
 * table, and because the demo is unreadable without it.
 */
export function You({
  state,
  locked,
  run,
  signIn,
  reset,
  exportBackup,
  importBackup,
}: {
  state: State;
  locked: boolean;
  run: (action: Action, note?: string) => void;
  signIn: (code: string, who: Identity, name: string, color: Color) => void;
  reset: () => void;
  exportBackup: () => string;
  importBackup: (text: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const who = me(state);
  const organizer = isOrganizer(state);

  return (
    <Screen title="You" lede={`Playing as ${who ?? 'nobody'}.`}>
      <IdentityCard state={state} signIn={signIn} />

      {organizer ? <OrganizerSettings state={state} locked={locked} run={run} /> : null}

      <Card band="Guardrails" title="What this app will never ask you to do">
        <ul className="rules">
          {GUARDRAILS.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </Card>

      <Card band="Backup" title="Keep a copy off this device">
        <p>
          A browser is not safe long-term storage. iOS clears site data for a web app you have not opened
          in about a week, and clearing history or site settings wipes it instantly on any device. The
          vault is not backed up anywhere, so the only copy that survives is one you export.
        </p>
        <div className="admin">
          <button
            className="primary"
            type="button"
            onClick={() => downloadText(backupFilename(), exportBackup())}
          >
            Export a backup file
          </button>
        </div>
        <div className="field">
          <label htmlFor="restore-file">Restore from a backup</label>
          <input
            id="restore-file"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) file.text().then(importBackup);
              event.target.value = '';
            }}
          />
          <p className="hint">Replaces everything on this device with the contents of the file.</p>
        </div>
      </Card>

      <Card band="This device" title="Reset">
        <p>
          Wipes the party saved in this browser and puts the seeded demo back. Vault photos and voice notes
          go with it, and there is no copy anywhere else.
        </p>
        {confirming ? (
          <div className="admin">
            <button
              className="danger"
              type="button"
              onClick={() => {
                reset();
                setConfirming(false);
              }}
            >
              Yes, reset
            </button>
            <button type="button" className="quiet" onClick={() => setConfirming(false)}>
              Keep my party
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)}>
            Reset this device
          </button>
        )}
      </Card>

      <p className="fineprint">
        Local only. No account, no server, no analytics, nothing uploaded. Closing the tab keeps your party,
        but a browser can evict it without asking: clearing site data removes it for good, and iOS drops
        unused site storage after roughly seven days. Export a backup before the trip and after dinner.
      </p>
    </Screen>
  );
}

/**
 * Switching identity is an apply, not a live select.
 *
 * Applying on every `change` fired once per arrow key for a keyboard user,
 * which walked the whole roster and wrote a feed line for each stop. It also
 * used to pass the chosen identity as the display name, quietly throwing away
 * whatever the player had typed on the join screen.
 */
function IdentityCard({
  state,
  signIn,
}: {
  state: State;
  signIn: (code: string, who: Identity, name: string, color: Color) => void;
}) {
  const current = me(state) ?? 'Spectator';
  const session = state.session;
  const [who, setWho] = useState<Identity>(current);
  const [name, setName] = useState(session?.name ?? '');
  const [color, setColor] = useState<Color>(session?.color ?? 'sea');

  const dirty = who !== current || name !== (session?.name ?? '') || color !== (session?.color ?? 'sea');

  return (
    <Card band="Identity" title="Who is holding this phone">
      <div className="field">
        <label htmlFor="switch-identity">Switch identity</label>
        <select id="switch-identity" value={who} onChange={(event) => setWho(event.target.value as Identity)}>
          {IDENTITIES.map((identity) => (
            <option key={identity} value={identity}>
              {identity}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="switch-name">Name on your cards</label>
        <input
          id="switch-name"
          value={name}
          maxLength={MAX_NAME_CHARS}
          autoComplete="off"
          placeholder={who}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="switch-color">Your color</label>
        <select id="switch-color" value={color} onChange={(event) => setColor(event.target.value as Color)}>
          {COLORS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="admin">
        <button
          className="primary"
          type="button"
          disabled={!dirty}
          onClick={() => signIn(PARTY_CODE, who, name.trim() || who, color)}
        >
          Apply
        </button>
        {dirty ? (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              setWho(current);
              setName(session?.name ?? '');
              setColor(session?.color ?? 'sea');
            }}
          >
            Cancel
          </button>
        ) : null}
      </div>

      <p className="hint">
        There is no password here. This is a demonstration of the game, not a login, so anyone with this
        device can be anyone on the list.
      </p>
    </Card>
  );
}

function OrganizerSettings({
  state,
  locked,
  run,
}: {
  state: State;
  locked: boolean;
  run: (action: Action, note?: string) => void;
}) {
  const [when, setWhen] = useState(() => toLocalInput(state.settings.expiresAt));
  const [dateError, setDateError] = useState<string | null>(null);

  // An empty or half-typed datetime-local gives an Invalid Date, and calling
  // toISOString on one throws a RangeError straight out of the click handler.
  function moveClosingDate() {
    const parsed = new Date(when);
    if (!when || Number.isNaN(parsed.getTime())) {
      setDateError('Pick a full date and time before moving the closing date.');
      return;
    }
    setDateError(null);
    run({ type: 'settings', expiresAt: parsed.toISOString() }, 'Closing date moved.');
  }

  return (
    <Card band="Organizer" title="Settings" tone="live">
      <div className="field">
        <label htmlFor="hide-rankings">
          <input
            id="hide-rankings"
            type="checkbox"
            checked={state.settings.hideRankings}
            disabled={locked}
            onChange={(event) => run({ type: 'settings', hideRankings: event.target.checked })}
          />
          Keep rankings hidden until dinner
        </label>
      </div>

      <fieldset className="field">
        <legend>How the day ends</legend>
        {(['stories', 'points'] as const).map((mode) => (
          <label key={mode} htmlFor={`awards-${mode}`} className="radio-row">
            <input
              id={`awards-${mode}`}
              type="radio"
              name="awards"
              value={mode}
              checked={state.settings.awards === mode}
              disabled={locked}
              onChange={() => run({ type: 'settings', awards: mode })}
            />
            {mode === 'stories' ? 'Story awards, one card each' : 'Points standings'}
          </label>
        ))}
      </fieldset>

      <div className="field">
        <label htmlFor="expires">Closing date</label>
        <input
          id="expires"
          type="datetime-local"
          value={when}
          disabled={locked}
          onChange={(event) => setWhen(event.target.value)}
        />
        <button type="button" disabled={locked} onClick={moveClosingDate}>
          Move the closing date
        </button>
        {dateError ? (
          <p className="alert" role="alert">
            {dateError}
          </p>
        ) : null}
        <p className="hint">Currently closes {formatDate(state.settings.expiresAt)}. After that the app is a recap.</p>
      </div>
    </Card>
  );
}
