import { expect, it } from 'vitest';
import { act } from './actions';
import { testimonyView } from './selectors';
import { writeBackup, readBackup } from './backup';
import { stateSchema } from './state';
import { NOW, as } from './fixtures';
import type { WitnessRole } from './bureau';
import type { State } from './state';

const open = (state: State = as('Deniz'), subject = 'The cooler lid') =>
  act(state, { type: 'openTestimony', subject }, NOW);
const swear = (
  state: State,
  author: 'Kevin' | 'Jack' | 'Nate' | 'Deniz',
  role: WitnessRole,
  text = `${role} saw it.`,
) => act(state, { type: 'testify', author, role, text }, NOW);

/** Kevin swears first, then Jack, then Nate: the pass order a table would remember. */
function threeSworn() {
  let state = open();
  state = swear(state, 'Kevin', 'Victorian Ghost', 'It opened itself. I was elsewhere.');
  state = swear(state, 'Jack', 'Insurance Adjuster', 'Classic lid behaviour.');
  state = swear(state, 'Nate', 'Harbor Poet', 'Blub.');
  return state;
}

it('lets only a Clerk open testimony', () => {
  expect(() => open(as('Jack'))).toThrow(/organizer/i);
  expect(testimonyView(open())).toMatchObject({ subject: 'The cooler lid', count: 0, revealed: false });
});

it('takes one sealed account per witness, each under a role nobody else holds', () => {
  let state = open();
  state = swear(state, 'Kevin', 'Harbor Poet');
  expect(() => swear(state, 'Kevin', 'Customs Officer')).toThrow('Kevin has already testified.');
  expect(() => swear(state, 'Jack', 'Harbor Poet')).toThrow(/role is already taken/);
  state = swear(state, 'Jack', 'Customs Officer');

  const view = testimonyView(state)!;
  expect(view.count).toBe(2);
  expect(view.entries).toEqual([]);
  expect(view.pending).not.toContain('Kevin');
  expect(view.roles).not.toContain('Harbor Poet');
  expect(JSON.stringify(state.feed)).not.toMatch(/saw it|Kevin|Jack|Poet|Customs/);
});

it('lets a Clerk take testimony for anyone, but nobody else can speak for someone', () => {
  const state = open();
  expect(() => swear(as('Jack', state), 'Kevin', 'Harbor Poet')).toThrow(/only testify as yourself/);
  expect(swear(as('Jack', state), 'Jack', 'Harbor Poet').testimony?.sworn).toEqual(['Jack']);
});

it('stores nothing that joins a name to an account, even before the reveal', () => {
  const round = threeSworn().testimony!;

  // Names in roster order, accounts in role order: neither echoes the pass order.
  expect(round.sworn).toEqual(['Kevin', 'Jack', 'Nate']);
  expect(round.entries.map((entry) => entry.role)).toEqual(['Insurance Adjuster', 'Harbor Poet', 'Victorian Ghost']);
  for (const entry of round.entries) expect(Object.keys(entry).sort()).toEqual(['id', 'role', 'text']);
});

it('forgets who testified at the reveal, so neither the save nor a backup can unseal it', () => {
  let state = threeSworn();
  expect(() => act(as('Nate', state), { type: 'revealTestimony' }, NOW)).toThrow(/organizer/i);
  state = act(state, { type: 'revealTestimony' }, NOW);

  expect(state.testimony!.sworn).toEqual([]);
  expect(testimonyView(state)!.entries.map((entry) => entry.text)).toEqual([
    'Classic lid behaviour.',
    'Blub.',
    'It opened itself. I was elsewhere.',
  ]);

  const backup = writeBackup(state);
  const testimony = JSON.stringify(JSON.parse(backup).party.testimony);
  expect(testimony).not.toMatch(/Kevin|Jack|Nate|author/);
  expect(readBackup(backup).testimony).toEqual(state.testimony);
  expect(() => swear(state, 'Deniz', 'Customs Officer')).toThrow(/closed/);
});

it('needs two accounts to reveal, and a revealed round makes room for the next', () => {
  let state = swear(open(), 'Kevin', 'Harbor Poet');
  expect(() => act(state, { type: 'revealTestimony' }, NOW)).toThrow('At least two witnesses have to testify first.');
  state = act(swear(state, 'Jack', 'Customs Officer'), { type: 'revealTestimony' }, NOW);
  expect(open(state).testimony).toMatchObject({ sworn: [], entries: [] });
});

it('leaves striking an account to a Clerk, since accounts carry no author', () => {
  const state = threeSworn();
  const id = state.testimony!.entries[0].id;
  expect(() => act(as('Jack', state), { type: 'strikeTestimony', id }, NOW)).toThrow(/organizer/i);

  const struck = act(state, { type: 'strikeTestimony', id }, NOW);
  expect(JSON.stringify(struck.testimony)).not.toMatch(/Classic lid/);
  expect(testimonyView(struck)!.roles).toContain('Insurance Adjuster');
});

it('lets a Clerk start over while fewer than two have sworn, and protects two sworn accounts', () => {
  let state = swear(open(), 'Kevin', 'Harbor Poet');
  state = open(state, 'A sandal');
  expect(testimonyView(state)).toMatchObject({ subject: 'A sandal', count: 0, pending: expect.arrayContaining(['Kevin']) });
  state = swear(swear(state, 'Kevin', 'Harbor Poet'), 'Jack', 'Customs Officer');
  expect(() => open(state, 'The door')).toThrow(/already open/);
  expect(JSON.stringify(state.feed)).not.toMatch(/sandal|cooler/i);
});

it('strips authors from a round saved by an earlier build, keeping only who may not testify again', () => {
  const entry = (author: string, role: string) => ({ id: role, at: NOW, author, role, text: `${role} saw it.` });
  const older = (revealed: boolean) =>
    stateSchema.parse({
      version: 3,
      testimony: {
        subject: 'The cooler lid',
        revealed,
        entries: [entry('Nate', 'Harbor Poet'), entry('Kevin', 'Customs Officer')],
      },
    }).testimony!;

  const open = older(false);
  expect(open.sworn).toEqual(['Kevin', 'Nate']);
  expect(JSON.stringify(open.entries)).not.toMatch(/Kevin|Nate|author|"at"/);

  const revealed = older(true);
  expect(revealed.sworn).toEqual([]);
  expect(JSON.stringify(revealed)).not.toMatch(/Kevin|Nate/);
});
