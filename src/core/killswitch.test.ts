import { expect, it } from 'vitest';
import { act, join } from './actions';
import { isReadOnly } from './time';
import type { Action } from './actions';
import { NOW, as } from './fixtures';

const EVERY_ACTION: Action[] = [
  { type: 'pick', id: 'flights', choice: 'yes' },
  { type: 'settle', id: 'flights', result: 'yes' },
  { type: 'voidPrediction', id: 'flights' },
  { type: 'draft', fish: 'ono' },
  { type: 'claim', id: 'callback' },
  { type: 'confirm', id: 'callback' },
  { type: 'voidBounty', id: 'callback' },
  { type: 'mission', status: 'accepted' },
  { type: 'submitMemory', about: 'Kevin', moment: 'Dinner', text: 'Hello', media: null },
  { type: 'revealMemory', id: 'missing' },
  { type: 'removeMemory', id: 'missing' },
  { type: 'sealFuture', text: 'See you again' },
  { type: 'dinner' },
  { type: 'settings', hideRankings: false },
];

it('flips to read-only exactly at the configured instant', () => {
  const state = as('Deniz');
  const closesAt = Date.parse(state.settings.expiresAt);
  expect(isReadOnly(state, closesAt - 1)).toBe(false);
  expect(isReadOnly(state, closesAt)).toBe(true);
});

it('refuses every mutation after the kill switch, including organizer controls', () => {
  const state = as('Deniz');
  const closesAt = Date.parse(state.settings.expiresAt);
  for (const action of EVERY_ACTION) {
    expect(() => act(state, action, closesAt), action.type).toThrow(/read-only recap/i);
  }
});

it('still lets a phone pick an identity so the recap is readable', () => {
  const state = as('Deniz');
  const closesAt = Date.parse(state.settings.expiresAt);
  expect(join(state, 'GUO27', 'Kevin', 'Kev', 'coral', closesAt).session?.attendee).toBe('Kevin');
});

it('lets an organizer move the closing date but never into the past', () => {
  const state = as('Deniz');
  const later = '2027-07-09T10:00:00Z';
  expect(act(state, { type: 'settings', expiresAt: later }, NOW).settings.expiresAt).toBe(later);
  expect(() => act(state, { type: 'settings', expiresAt: '2020-01-01T00:00:00Z' }, NOW)).toThrow(/in the past/i);
  expect(() => act(state, { type: 'settings', expiresAt: 'not a date' }, NOW)).toThrow(/date/i);
});
