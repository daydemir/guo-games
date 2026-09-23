import { expect, it } from 'vitest';
import { act } from './actions';
import { awardCards, futureEntries, standings } from './selectors';
import { ATTENDEES } from './content';
import { NOW, as } from './fixtures';

it('hides standings until dinner when the organizer keeps rankings sealed', () => {
  const state = as('Kevin');
  expect(state.settings.hideRankings).toBe(true);
  expect(standings(state)).toBeNull();

  const opened = act(as('Nick', state), { type: 'dinner' }, NOW);
  expect(standings(opened)).toHaveLength(ATTENDEES.length);
});

it('lets an organizer unseal rankings early or switch to story awards', () => {
  let state = as('Deniz');
  expect(() => act(as('Kevin', state), { type: 'settings', hideRankings: false }, NOW)).toThrow(/organizer/i);

  state = act(state, { type: 'settings', hideRankings: false }, NOW);
  expect(standings(state)).toHaveLength(ATTENDEES.length);

  state = act(state, { type: 'settings', awards: 'points' }, NOW);
  expect(state.settings.awards).toBe('points');
});

it('gives every attendee exactly one kind award card, most distinctive first', () => {
  let state = act(as('Kevin'), { type: 'pick', id: 'flights', choice: 'yes' }, NOW);
  state = act(as('Nick', state), { type: 'claim', id: 'callback' }, NOW);
  state = act(as('Jack', state), { type: 'confirm', id: 'callback' }, NOW);
  state = act(as('Deniz', state), { type: 'settle', id: 'flights', result: 'yes' }, NOW);
  state = act(state, { type: 'dinner' }, NOW);

  const cards = awardCards(state);
  expect(cards.map((card) => card.attendee).sort()).toEqual([...ATTENDEES].sort());
  expect(cards.find((card) => card.attendee === 'Kevin')?.title).toBe('The Oracle');
  expect(cards.find((card) => card.attendee === 'Jack')?.title).toBe('The Witness');
  expect(cards.every((card) => card.line.length > 0)).toBe(true);
});

it('seals a future note once per attendee and keeps it closed until its own date', () => {
  const state = act(as('Kevin'), { type: 'sealFuture', text: 'We will still argue about this playlist.' }, NOW);
  expect(futureEntries(state, NOW)).toEqual([]);
  expect(() => act(state, { type: 'sealFuture', text: 'Second thoughts' }, NOW)).toThrow(/already sealed/i);
  expect(() => act(as('Nick', state), { type: 'sealFuture', text: '  ' }, NOW)).toThrow(/1 to 300/);

  const opened = futureEntries(state, Date.parse('2033-01-01T00:00:00Z'));
  expect(opened).toEqual([{ attendee: 'Kevin', text: 'We will still argue about this playlist.' }]);
});

it('keeps the sealed note text out of the shared feed', () => {
  const state = act(as('Kevin'), { type: 'sealFuture', text: 'A secret for later.' }, NOW);
  expect(state.feed.some((event) => event.text.includes('A secret for later'))).toBe(false);
});
