import { relativeTime } from '../../core/time';
import type { State } from '../../core/state';
import { Empty, Screen } from '../../ui/primitives';

/**
 * The shared pulse. Public facts only: what was claimed, confirmed, drafted and
 * settled. Never mission text, never a vault story, never a sealed note.
 */
export function Feed({ state, now }: { state: State; now: number }) {
  return (
    <Screen title="Feed" lede="What the group has been up to. Nothing private ever lands here.">
      {state.feed.length === 0 ? (
        <Empty>Quiet so far.</Empty>
      ) : (
        <ol className="feed feed-full">
          {state.feed.map((event) => (
            <li key={event.id}>
              <span>{event.text}</span>
              <time dateTime={new Date(event.at).toISOString()}>{relativeTime(event.at, now)}</time>
            </li>
          ))}
        </ol>
      )}
    </Screen>
  );
}
