import { expect, it } from 'vitest';
import { act } from './actions';
import { roleFor, testimonyView } from './selectors';
import { WITNESS_ROLES } from './bureau';
import { NOW, as } from './fixtures';
import type { State } from './state';

const open = (state: State = as('Deniz')) => act(state, { type: 'openTestimony', subject: 'The cooler lid' }, NOW);
const swear = (state: State, author: 'Kevin' | 'Jack' | 'Nate' | 'Deniz', text = `${author} saw it.`) =>
  act(state, { type: 'testify', author, text }, NOW);

it('lets only a Clerk open testimony', () => {
  expect(() => open(as('Jack'))).toThrow(/organizer/i);
  const state = open();
  expect(testimonyView(state)).toMatchObject({ subject: 'The cooler lid', count: 0, revealed: false });
});

it('takes one sealed account per witness, each under a different role', () => {
  let state = open();
  state = swear(state, 'Kevin');
  state = swear(state, 'Jack');
  expect(() => swear(state, 'Jack')).toThrow('Jack has already testified.');

  const view = testimonyView(state)!;
  expect(view.count).toBe(2);
  expect(view.entries).toEqual([]);
  expect(view.pending).not.toContain('Kevin');
  const roles = state.testimony!.entries.map((entry) => entry.role);
  expect(new Set(roles).size).toBe(2);
  expect(JSON.stringify(state.feed)).not.toMatch(/saw it|Kevin|Jack|Adjuster|Biologist/);
});

it('lets a Clerk take testimony for anyone, but nobody else can speak for someone', () => {
  const state = open();
  expect(() => swear(as('Jack', state), 'Kevin')).toThrow(/only testify as yourself/);
  expect(swear(as('Jack', state), 'Jack').testimony?.entries[0].author).toBe('Jack');
});

it('reveals roles and words with no author, and closes the round', () => {
  let state = open();
  state = swear(state, 'Kevin', 'It moved first.');
  expect(() => act(state, { type: 'revealTestimony' }, NOW)).toThrow('At least two witnesses have to testify first.');
  state = swear(state, 'Nate', 'A crime, frankly.');
  expect(() => act(as('Nate', state), { type: 'revealTestimony' }, NOW)).toThrow(/organizer/i);

  state = act(state, { type: 'revealTestimony' }, NOW);
  const view = testimonyView(state)!;
  const order = view.entries.map((entry) => WITNESS_ROLES.indexOf(entry.role as (typeof WITNESS_ROLES)[number]));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(JSON.stringify(view.entries)).not.toMatch(/Kevin|Nate|author/);
  expect(() => swear(state, 'Jack')).toThrow(/closed/);
  // A revealed round makes room for the next one.
  expect(open(state).testimony?.entries).toEqual([]);
});

it('lets the witness or a Clerk strike testimony, and never duplicates a role afterwards', () => {
  let state = open();
  state = swear(state, 'Kevin');
  state = swear(state, 'Jack');
  const kevins = state.testimony!.entries[0].id;
  expect(() => act(as('Nate', state), { type: 'strikeTestimony', id: kevins }, NOW)).toThrow(/witness, or a Clerk/);

  state = act(as('Kevin', state), { type: 'strikeTestimony', id: kevins }, NOW);
  expect(JSON.stringify(state.testimony)).not.toMatch(/Kevin saw it/);
  state = act(as('Deniz', state), { type: 'testify', author: 'Nate', text: 'Blub.' }, NOW);
  const roles = state.testimony!.entries.map((entry) => entry.role);
  expect(new Set(roles).size).toBe(2);
});

it('does not hand roles out in the order the phone goes round', () => {
  // Whoever goes first must not be predictably the same role across events.
  const firsts = new Set(
    ['The cooler lid', 'A sandal', 'The door', 'The speaker', 'The last lime'].map((subject) => {
      const state = act(as('Deniz'), { type: 'openTestimony', subject }, NOW);
      return act(state, { type: 'testify', author: 'Kevin', text: 'Blub.' }, NOW).testimony!.entries[0].role;
    }),
  );
  expect(firsts.size).toBeGreaterThan(1);
  // And the preview shown to the holder is the role they get.
  const state = open();
  expect(roleFor(state, 'Jack')).toBe(swear(state, 'Jack').testimony!.entries[0].role);
});

it('lets a Clerk start over while fewer than two have sworn, and protects two sworn accounts', () => {
  let state = swear(open(), 'Kevin');
  state = act(state, { type: 'openTestimony', subject: 'A sandal' }, NOW);
  expect(testimonyView(state)).toMatchObject({ subject: 'A sandal', count: 0 });
  state = swear(swear(state, 'Kevin'), 'Jack');
  expect(() => act(state, { type: 'openTestimony', subject: 'The door' }, NOW)).toThrow(/already open/);
  expect(JSON.stringify(state.feed)).not.toMatch(/sandal|cooler/i);
});
