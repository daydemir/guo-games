import { useState } from 'react';
import { isAttendee } from '../../core/content';
import {
  energyDipSpark,
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

const MISSION_LABEL = { sealed: 'Unopened', accepted: 'Under way', done: 'Done', void: 'Passed' } as const;
const BOUNTY_LABEL = { open: 'open', claimed: 'needs a witness', confirmed: 'confirmed', void: 'voided' } as const;

/** How much of the feed shows before someone asks for the rest. */
const FEED_PREVIEW = 5;

/**
 * Home. One action, one glance at the day, and the shared feed. The point of
 * the app is to stop looking at the app, so nothing here is a list of chores.
 */
export function Today({
  state,
  now,
  onGo,
}: {
  state: State;
  now: number;
  onGo: (tab: string, anchor?: string) => void;
}) {
  const [wholeFeed, setWholeFeed] = useState(false);
  const next = nextAction(state, now);
  const spark = energyDipSpark(now);
  const closed = isReadOnly(state, now);
  const playing = isAttendee(me(state));
  const mission = privateMission(state);
  const held = myBounty(state);
  const fish = myFish(state);
  const { tab: target, anchor } = next;
  const feed = wholeFeed ? state.feed : state.feed.slice(0, FEED_PREVIEW);

  return (
    <Screen title="Today" lede="One thing at a time, then the phone goes back in your pocket.">
      <Card band="Next" title={next.title} tone="live">
        <p>{next.body}</p>
        {target ? (
          <button className="primary" type="button" onClick={() => onGo(target, anchor)}>
            Take me there
          </button>
        ) : null}
      </Card>

      {spark && !closed ? (
        <Card band="Energy-Dip Spark" title="The 4 to 7 window" tone="live">
          <p>{spark}</p>
          <p className="hint">Shows only during the afternoon regroup, then goes away on its own.</p>
        </Card>
      ) : null}

      {playing ? (
        <Card band="Where you stand" title="Your day so far">
          <div className="stats">
            <Stat label="Picks left" value={picksLeft(state)} />
            <Stat label="Your fish" value={fish ? fish.name : 'Not drafted'} />
            <Stat label="Bounty" value={held ? `${held.bounty.title}, ${BOUNTY_LABEL[held.status]}` : 'None yet'} />
            <Stat label="Mission" value={mission ? MISSION_LABEL[mission.status] : 'None'} />
            <Stat label="Closes" value={closingLabel(state, now)} />
          </div>
          {standings(state) === null ? (
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
