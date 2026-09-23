import { GROOM } from '../../core/content';
import { energyDipSpark, myBounty, myFish, nextAction, picksLeft, privateMission } from '../../core/selectors';
import { closingLabel, isReadOnly, relativeTime } from '../../core/time';
import type { State } from '../../core/state';
import { Card, Screen, Stat } from '../../ui/primitives';

/**
 * Home. One action, one glance at the day, and an honest reminder that the
 * point of the app is to stop looking at the app.
 */
export function Today({ state, now, onGo }: { state: State; now: number; onGo: (tab: string) => void }) {
  const next = nextAction(state, now);
  const spark = energyDipSpark(now);
  const closed = isReadOnly(state, now);
  const mission = privateMission(state);
  const held = myBounty(state);
  const fish = myFish(state);
  const recent = state.feed.slice(0, 4);

  return (
    <Screen title="Today" lede={`One thing at a time. ${GROOM} gets married eventually.`}>
      <Card band="Next" title={next.title} tone="live">
        <p>{next.body}</p>
        {next.id === 'rest' || next.id === 'recap' ? null : (
          <button className="primary" type="button" onClick={() => onGo(next.tab)}>
            Take me there
          </button>
        )}
      </Card>

      {spark && !closed ? (
        <Card band="Energy-Dip Spark" title="The 4 to 7 window" tone="live">
          <p>{spark}</p>
          <p className="hint">This appears once during the afternoon regroup, then goes away on its own.</p>
        </Card>
      ) : null}

      <Card band="Where you stand" title="Your day so far">
        <div className="stats">
          <Stat label="Predictions left" value={picksLeft(state)} />
          <Stat label="Your fish" value={fish ? fish.name : 'Not drafted'} />
          <Stat label="Bounty" value={held ? `${held.bounty.title} (${held.status})` : 'None yet'} />
          <Stat label="Mission" value={mission ? mission.status : 'Spectating'} />
          <Stat label="Closes" value={closingLabel(state, now)} />
        </div>
        <p className="hint">Standings are sealed until dinner, on purpose. This is a day out, not a tournament.</p>
      </Card>

      <Card band="Feed" title="Lately">
        {recent.length === 0 ? (
          <p className="empty">Nothing has happened yet. That is allowed.</p>
        ) : (
          <ul className="feed">
            {recent.map((event) => (
              <li key={event.id}>
                <span>{event.text}</span>
                <time>{relativeTime(event.at, now)}</time>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => onGo('feed')}>
          See the whole feed
        </button>
      </Card>

      <Card band="The deal" title="Put the phone away">
        <p>
          Six taps is a full day of this game. Everything else happens in the room. If this is in your hand
          for more than a minute, something has gone wrong with the app, not with you.
        </p>
      </Card>
    </Screen>
  );
}
