import { describe, expect, it } from 'vitest';
import { PARTY_CODE } from './content';
import { emptyState } from './state';
import { join } from './actions';
import { isOrganizer } from './selectors';
import { as } from './fixtures';

describe('joining the party', () => {
  it('accepts the party code case-insensitively and keeps the chosen name and color', () => {
    const session = join(emptyState(), ' guo27 ', 'Kevin', 'Kev', 'coral').session;
    expect(session).toEqual({ attendee: 'Kevin', name: 'Kev', color: 'coral' });
  });

  it('treats spectator as a valid identity', () => {
    expect(join(emptyState(), PARTY_CODE, 'Spectator', 'A friend', 'sea').session?.attendee).toBe('Spectator');
  });

  it('rejects a wrong code and an unusable name without changing state', () => {
    const state = emptyState();
    expect(() => join(state, 'WRONG', 'Kevin', 'Kev', 'sea')).toThrow(/party code/i);
    expect(() => join(state, PARTY_CODE, 'Kevin', '   ', 'sea')).toThrow(/name/i);
    expect(() => join(state, PARTY_CODE, 'Kevin', 'x'.repeat(25), 'sea')).toThrow(/name/i);
    expect(state.session).toBeNull();
  });

  it('recognises Deniz and Nick as the only organizers', () => {
    expect(isOrganizer(as('Deniz'))).toBe(true);
    expect(isOrganizer(as('Nick'))).toBe(true);
    expect(isOrganizer(as('Kevin'))).toBe(false);
    expect(isOrganizer(as('Spectator'))).toBe(false);
    expect(isOrganizer(emptyState())).toBe(false);
  });

  it('records an arrival in the shared feed once per identity', () => {
    const joined = as('Kevin');
    expect(joined.feed.at(0)?.text).toMatch(/Kevin/);
    expect(as('Kevin', joined).feed).toHaveLength(1);
  });
});
