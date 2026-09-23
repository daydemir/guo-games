import { expect, it } from 'vitest';
import { act } from './actions';
import { energyDipSpark, nextAction } from './selectors';
import { emptyState } from './state';
import { NOW, as } from './fixtures';

it('asks an unjoined phone to join first', () => {
  expect(nextAction(emptyState()).id).toBe('join');
});

it('walks an attendee through one thing at a time', () => {
  let state = as('Kevin');
  expect(nextAction(state, NOW).id).toBe('predict');

  state = act(state, { type: 'pick', id: 'flights', choice: 'yes' }, NOW);
  expect(nextAction(state, NOW).id).toBe('draft');

  state = act(state, { type: 'draft', fish: 'ono' }, NOW);
  expect(nextAction(state, NOW).id).toBe('mission');

  state = act(state, { type: 'mission', status: 'accepted' }, NOW);
  expect(nextAction(state, NOW).id).toBe('bounty');

  state = act(state, { type: 'claim', id: 'callback' }, NOW);
  expect(nextAction(state, NOW).id).toBe('witness');

  state = act(as('Nick', state), { type: 'confirm', id: 'callback' }, NOW);
  state = as('Kevin', state);
  expect(nextAction(state, NOW).id).toBe('vault');

  state = act(state, { type: 'submitMemory', about: 'Nick', moment: 'Dinner', text: 'A story.', media: null }, NOW);
  expect(nextAction(state, NOW).id).toBe('future');

  state = act(state, { type: 'sealFuture', text: 'See you in five years.' }, NOW);
  expect(nextAction(state, NOW).id).toBe('rest');
  expect(nextAction(state, NOW).body).toMatch(/phone/i);
});

it('gives spectators something to do that is not a task', () => {
  expect(nextAction(as('Spectator'), NOW).id).toBe('spectate');
});

it('turns the home screen into a recap pointer once the trip closes', () => {
  const state = as('Kevin');
  expect(nextAction(state, Date.parse(state.settings.expiresAt)).id).toBe('recap');
});

it('offers the energy-dip spark only between four and seven in the evening', () => {
  expect(energyDipSpark(new Date('2027-07-02T17:30:00').getTime())).not.toBeNull();
  expect(energyDipSpark(new Date('2027-07-02T09:30:00').getTime())).toBeNull();
  expect(energyDipSpark(new Date('2027-07-02T21:30:00').getTime())).toBeNull();
});

import { closingLabel } from './time';

it('counts down only when the close is near, and shows the date until then', () => {
  const state = emptyState();
  const closes = Date.parse(state.settings.expiresAt);
  expect(closingLabel(state, closes - 3 * 86_400_000)).toBe('3 days');
  expect(closingLabel(state, closes - 86_400_000)).toBe('1 day');
  expect(closingLabel(state, closes - 200 * 86_400_000)).toMatch(/\d/);
  expect(closingLabel(state, closes - 200 * 86_400_000)).not.toMatch(/days/);
  expect(closingLabel(state, closes + 1)).toBe('Closed');
});
