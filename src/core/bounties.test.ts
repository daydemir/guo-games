import { expect, it } from 'vitest';
import { act } from './actions';
import { scores } from './selectors';
import { NOW, as, pointsFor } from './fixtures';

it('requires an opt-in claim before anyone can confirm', () => {
  expect(() => act(as('Kevin'), { type: 'confirm', id: 'callback' }, NOW)).toThrow(/claim/i);
});

it('holds each attendee to one live bounty at a time', () => {
  const state = act(as('Kevin'), { type: 'claim', id: 'callback' }, NOW);
  expect(() => act(state, { type: 'claim', id: 'spark' }, NOW)).toThrow(/one bounty/i);
  expect(() => act(as('Nick', state), { type: 'claim', id: 'callback' }, NOW)).toThrow(/already claimed/i);
});

it('needs a witness who is not the claimant, and pays out once confirmed', () => {
  let state = act(as('Kevin'), { type: 'claim', id: 'callback' }, NOW);
  expect(() => act(state, { type: 'confirm', id: 'callback' }, NOW)).toThrow(/someone else/i);

  state = act(as('Nick', state), { type: 'confirm', id: 'callback' }, NOW);
  expect(state.bounties.callback).toMatchObject({ owner: 'Kevin', status: 'confirmed', witness: 'Nick' });
  expect(pointsFor(scores(state), 'Kevin')).toBe(5);
  expect(() => act(state, { type: 'confirm', id: 'callback' }, NOW)).toThrow(/claim/i);
});

it('voids without penalty and frees the attendee to claim something else', () => {
  let state = act(as('Kevin'), { type: 'claim', id: 'callback' }, NOW);
  state = act(as('Nick', state), { type: 'confirm', id: 'callback' }, NOW);
  state = act(as('Kevin', state), { type: 'voidBounty', id: 'callback' }, NOW);

  expect(state.bounties.callback?.status).toBe('void');
  expect(pointsFor(scores(state), 'Kevin')).toBe(0);
  expect(act(state, { type: 'claim', id: 'spark' }, NOW).bounties.spark?.owner).toBe('Kevin');
});

it('never puts bounty detail in the shared feed before it is confirmed', () => {
  const state = act(as('Kevin'), { type: 'claim', id: 'callback' }, NOW);
  expect(state.feed.some((event) => event.text.includes('favorite Kevin memory'))).toBe(false);
});
