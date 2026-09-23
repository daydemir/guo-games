import { emptyState } from './state';
import { join } from './actions';
import type { Attendee, Identity } from './content';
import type { State } from './state';

/** A fixed instant inside the trip window, used by every domain test. */
export const NOW = Date.parse('2027-07-02T18:00:00Z');

/** An empty (non-demo) party already joined as `who`. */
export function as(who: Identity, state: State = emptyState()): State {
  return join(state, 'GUO27', who, who === 'Spectator' ? 'Guest' : who, 'sea');
}

export function pointsFor(rows: { attendee: Attendee; points: number }[], who: Attendee) {
  return rows.find((row) => row.attendee === who)?.points;
}
