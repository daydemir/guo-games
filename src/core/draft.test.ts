import { expect, it } from 'vitest';
import { FISH } from './content';
import { act } from './actions';
import { draftBoard } from './selectors';
import { NOW, as } from './fixtures';

const [first, second] = FISH;

it('gives each attendee exactly one species and replaces an earlier choice', () => {
  let state = act(as('Kevin'), { type: 'draft', fish: first.id }, NOW);
  state = act(state, { type: 'draft', fish: second.id }, NOW);
  expect(state.draft).toEqual({ Kevin: second.id });
});

it('refuses a species another attendee already drafted', () => {
  let state = act(as('Kevin'), { type: 'draft', fish: first.id }, NOW);
  state = as('Nick', state);
  expect(() => act(state, { type: 'draft', fish: first.id }, NOW)).toThrow(/already drafted/i);
  expect(act(state, { type: 'draft', fish: second.id }, NOW).draft).toEqual({ Kevin: first.id, Nick: second.id });
});

it('releases a species back to the board when its drafter switches away', () => {
  let state = act(as('Kevin'), { type: 'draft', fish: first.id }, NOW);
  state = act(state, { type: 'draft', fish: second.id }, NOW);
  state = as('Nick', state);
  expect(act(state, { type: 'draft', fish: first.id }, NOW).draft.Nick).toBe(first.id);
});

it('reports every species with its drafter so the board can show what is gone', () => {
  const state = act(as('Kevin'), { type: 'draft', fish: first.id }, NOW);
  const board = draftBoard(state);
  expect(board).toHaveLength(FISH.length);
  expect(board.find((row) => row.fish.id === first.id)?.drafter).toBe('Kevin');
  expect(board.find((row) => row.fish.id === second.id)?.drafter).toBeNull();
});
