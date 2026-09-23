import { expect, it } from 'vitest';
import { MAX_PICKS } from './content';
import { act } from './actions';
import { scores } from './selectors';
import { NOW, as, pointsFor } from './fixtures';

it('caps each attendee at three open predictions but allows changing an existing pick', () => {
  let state = as('Kevin');
  state = act(state, { type: 'pick', id: 'flights', choice: 'yes' }, NOW);
  state = act(state, { type: 'pick', id: 'fishing', choice: 'no' }, NOW);
  state = act(state, { type: 'pick', id: 'downtime', choice: 'yes' }, NOW);
  expect(Object.keys(state.picks.Kevin ?? {})).toHaveLength(MAX_PICKS);
  expect(() => act(state, { type: 'pick', id: 'dinner', choice: 'yes' }, NOW)).toThrow(/three/i);

  state = act(state, { type: 'pick', id: 'flights', choice: 'no' }, NOW);
  expect(state.picks.Kevin?.flights).toBe('no');
});

it('refuses picks from spectators', () => {
  expect(() => act(as('Spectator'), { type: 'pick', id: 'flights', choice: 'yes' }, NOW)).toThrow(/spectator/i);
});

it('awards points only for correct picks on settled predictions', () => {
  let state = act(as('Kevin'), { type: 'pick', id: 'flights', choice: 'yes' }, NOW);
  expect(pointsFor(scores(state), 'Kevin')).toBe(0);

  state = act(as('Deniz', state), { type: 'settle', id: 'flights', result: 'yes' }, NOW);
  expect(pointsFor(scores(state), 'Kevin')).toBe(10);
});

it('lets only organizers settle, makes settlement final, and closes the pick', () => {
  let state = act(as('Kevin'), { type: 'pick', id: 'flights', choice: 'yes' }, NOW);
  expect(() => act(state, { type: 'settle', id: 'flights', result: 'yes' }, NOW)).toThrow(/organizer/i);

  state = as('Deniz', state);
  state = act(state, { type: 'settle', id: 'flights', result: 'yes' }, NOW);
  expect(() => act(state, { type: 'settle', id: 'flights', result: 'no' }, NOW)).toThrow(/settled/i);
  expect(() => act(as('Kevin', state), { type: 'pick', id: 'flights', choice: 'no' }, NOW)).toThrow(/settled/i);
});


it('lets anyone void an open prediction, because opting out has to stay easy', () => {
  const state = act(as('Kevin'), { type: 'pick', id: 'flights', choice: 'yes' }, NOW);
  expect(act(as('Jack', state), { type: 'voidPrediction', id: 'flights' }, NOW).results.flights).toBe('void');
});

it('stops a bystander erasing a settled prediction, but lets an organizer do it', () => {
  let state = act(as('Kevin'), { type: 'pick', id: 'flights', choice: 'yes' }, NOW);
  state = act(as('Deniz', state), { type: 'settle', id: 'flights', result: 'yes' }, NOW);
  expect(pointsFor(scores(state), 'Kevin')).toBe(10);

  expect(() => act(as('Jack', state), { type: 'voidPrediction', id: 'flights' }, NOW)).toThrow(/organizer/i);
  expect(pointsFor(scores(state), 'Kevin')).toBe(10);

  const voided = act(as('Nick', state), { type: 'voidPrediction', id: 'flights' }, NOW);
  expect(voided.results.flights).toBe('void');
  expect(pointsFor(scores(voided), 'Kevin')).toBe(0);
});
