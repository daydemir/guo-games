import type { State } from './state';

/**
 * The date kill switch. Once it passes, every mutation is refused and the app
 * becomes a recap. Organizers can move the date forward while the trip is live.
 */
export function isReadOnly(state: State, now: number = Date.now()): boolean {
  return now >= Date.parse(state.settings.expiresAt);
}

/** Whole days left, floored, never negative. */
function daysLeft(state: State, now: number = Date.now()): number {
  return Math.max(0, Math.floor((Date.parse(state.settings.expiresAt) - now) / 86_400_000));
}

/**
 * What the home screen says about the end of the trip. A countdown only means
 * something once it is close; before that the date itself is the useful fact.
 */
export function closingLabel(state: State, now: number = Date.now()): string {
  if (isReadOnly(state, now)) return 'Closed';
  const days = daysLeft(state, now);
  if (days > 14) {
    return new Date(state.settings.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`;
}

const RELATIVE = [
  { limit: 60_000, step: 1000, unit: 'second' },
  { limit: 3_600_000, step: 60_000, unit: 'minute' },
  { limit: 86_400_000, step: 3_600_000, unit: 'hour' },
] as const;

/** "just now", "12 minutes ago", "3 hours ago". Used by the activity feed. */
export function relativeTime(at: number, now: number = Date.now()): string {
  const elapsed = Math.max(0, now - at);
  if (elapsed < 45_000) return 'just now';
  for (const { limit, step, unit } of RELATIVE) {
    if (elapsed < limit) {
      const count = Math.round(elapsed / step);
      return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
    }
  }
  const days = Math.round(elapsed / 86_400_000);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'an unset date';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** The value an `<input type="datetime-local">` expects, in local time. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}
