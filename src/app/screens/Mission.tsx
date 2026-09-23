import { useState } from 'react';
import { privateMission } from '../../core/selectors';
import type { Action } from '../../core/actions';
import type { State } from '../../core/state';
import { Card, Screen } from '../../ui/primitives';

/**
 * The Ghost Commissioner. One kind, low-risk mission per person, readable only
 * on the phone that is currently signed in as them, and hidden behind a tap so
 * it cannot be read over a shoulder by accident.
 */
export function Mission({
  state,
  locked,
  run,
}: {
  state: State;
  locked: boolean;
  run: (action: Action, note?: string) => boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const mission = privateMission(state);

  if (!mission) {
    return (
      <Screen title="Private mission" lede="Spectators do not get one.">
        <Card band="Nothing here" title="You are watching">
          <p>Tap your name at the top and switch to an attendee if you want a mission of your own.</p>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Private mission" lede="Only this phone, signed in as you, can read this.">
      <Card band="Sealed" title="Yours alone" tone={mission.status === 'done' ? 'settled' : 'live'}>
        {revealed ? (
          <p className="mission-text" data-testid="mission-text">
            {mission.text}
          </p>
        ) : (
          <>
            <p>Make sure nobody is reading over your shoulder.</p>
            <button className="primary" type="button" onClick={() => setRevealed(true)}>
              Show my mission
            </button>
          </>
        )}

        {revealed && !locked ? (
          <div className="admin">
            {mission.status === 'sealed' ? (
              <button className="primary" type="button" onClick={() => run({ type: 'mission', status: 'accepted' })}>
                I will do this
              </button>
            ) : null}
            {mission.status === 'accepted' ? (
              <button className="primary" type="button" onClick={() => run({ type: 'mission', status: 'done' }, 'Nicely done.')}>
                Done
              </button>
            ) : null}
            {mission.status !== 'void' ? (
              <button
                type="button"
                className="quiet"
                onClick={() => run({ type: 'mission', status: 'void' }, 'Passed. No penalty.')}
              >
                Pass on this
              </button>
            ) : null}
          </div>
        ) : null}

        <p className="hint">Status: {mission.status}</p>
      </Card>

      <p className="fineprint">
        The feed will say you took on a mission. It never says which one, and it never quotes a word of it.
      </p>
    </Screen>
  );
}
