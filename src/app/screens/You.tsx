import { useState } from 'react';
import { COLORS, GUARDRAILS, IDENTITIES, PARTY_CODE } from '../../core/content';
import type { Color, Identity } from '../../core/content';
import { isOrganizer, me } from '../../core/selectors';
import { formatDate, toLocalInput } from '../../core/time';
import type { Action } from '../../core/actions';
import type { State } from '../../core/state';
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
}: {
  state: State;
  locked: boolean;
  run: (action: Action, note?: string) => void;
  signIn: (code: string, who: Identity, name: string, color: Color) => void;
  reset: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const who = me(state);
  const organizer = isOrganizer(state);
  const session = state.session;

  return (
    <Screen title="You" lede={`Playing as ${who ?? 'nobody'}.`}>
      <Card band="Identity" title="Who is holding this phone">
        <div className="field">
          <label htmlFor="switch-identity">Switch identity</label>
          <select
            id="switch-identity"
            value={who ?? 'Spectator'}
            onChange={(event) =>
              signIn(PARTY_CODE, event.target.value as Identity, event.target.value, session?.color ?? 'sea')
            }
          >
            {IDENTITIES.map((identity) => (
              <option key={identity} value={identity}>
                {identity}
              </option>
            ))}
          </select>
          <p className="hint">
            There is no password here. This is a demonstration of the game, not a login, so anyone with this
            device can be anyone on the list.
          </p>
        </div>

        <div className="field">
          <label htmlFor="switch-color">Your color</label>
          <select
            id="switch-color"
            value={session?.color ?? 'sea'}
            onChange={(event) =>
              signIn(PARTY_CODE, who ?? 'Spectator', session?.name ?? 'Guest', event.target.value as Color)
            }
          >
            {COLORS.map((color) => (
              <option key={color} value={color}>
                {color}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {organizer ? <OrganizerSettings state={state} locked={locked} run={run} /> : null}

      <Card band="Guardrails" title="What this app will never ask you to do">
        <ul className="rules">
          {GUARDRAILS.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
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
        Local only. No account, no server, no analytics, nothing uploaded. Closing the tab keeps your party.
        Clearing site data removes it for good.
      </p>
    </Screen>
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
        <button
          type="button"
          disabled={locked}
          onClick={() => run({ type: 'settings', expiresAt: new Date(when).toISOString() }, 'Closing date moved.')}
        >
          Move the closing date
        </button>
        <p className="hint">Currently closes {formatDate(state.settings.expiresAt)}. After that the app is a recap.</p>
      </div>
    </Card>
  );
}
