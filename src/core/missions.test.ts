import { expect, it } from 'vitest';
import { act } from './actions';
import { privateMission, scores } from './selectors';
import { NOW, as, pointsFor } from './fixtures';

it('shows a mission only to the attendee holding this device', () => {
  const state = act(as('Kevin'), { type: 'mission', status: 'accepted' }, NOW);
  expect(privateMission(state)?.text).toBeTruthy();
  expect(privateMission(as('Nick', state))?.status).toBe('sealed');
  expect(privateMission(as('Spectator', state))).toBeNull();
});

it('keeps mission text out of the shared feed', () => {
  const state = act(as('Kevin'), { type: 'mission', status: 'accepted' }, NOW);
  const mission = privateMission(state)!;
  expect(state.feed.some((event) => event.text.includes(mission.text))).toBe(false);
  expect(state.feed.at(0)?.text).toMatch(/quiet mission/i);
});

it('requires accepting before completing, and pays only a completed mission', () => {
  let state = as('Kevin');
  expect(() => act(state, { type: 'mission', status: 'done' }, NOW)).toThrow(/accept/i);
  state = act(state, { type: 'mission', status: 'accepted' }, NOW);
  expect(pointsFor(scores(state), 'Kevin')).toBe(0);
  state = act(state, { type: 'mission', status: 'done' }, NOW);
  expect(pointsFor(scores(state), 'Kevin')).toBe(5);
});

it('lets an attendee pass on a mission at any time with no penalty', () => {
  let state = act(as('Kevin'), { type: 'mission', status: 'accepted' }, NOW);
  state = act(state, { type: 'mission', status: 'done' }, NOW);
  state = act(state, { type: 'mission', status: 'void' }, NOW);
  expect(privateMission(state)?.status).toBe('void');
  expect(pointsFor(scores(state), 'Kevin')).toBe(0);
  expect(() => act(state, { type: 'mission', status: 'accepted' }, NOW)).toThrow(/passed/i);
});
