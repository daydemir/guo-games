import { expect, it } from 'vitest';
import { act } from './actions';
import { testimonyView } from './selectors';
import { writeBackup, readBackup } from './backup';
import { WITNESS_ROLES } from './bureau';
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

/**
 * A round as the branch's first build saved it: authors kept, and each role
 * picked from a hash of the author's name and the event.
 */
function legacyRound(revealed: boolean) {
  const subject = 'The cooler lid';
  const held = new Set<string>();
  const entries = (['Nate', 'Kevin', 'Jack'] as const).map((author, index) => {
    let hash = 0;
    for (const char of `${author}/${subject}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    let step = 0;
    while (held.has(WITNESS_ROLES[(hash + step) % WITNESS_ROLES.length])) step += 1;
    const role = WITNESS_ROLES[(hash + step) % WITNESS_ROLES.length];
    held.add(role);
    return { id: `e${index}`, at: NOW + index, author, role, text: ['Zzz. Blub.', 'A crime, frankly.', 'Lid acted alone.'][index] };
  });
  return { subject, revealed, entries };
}

const load = (testimony: unknown) => stateSchema.parse({ version: 3, testimony }).testimony;

it('drops an unread round from the first build, whose roles could name their writers', () => {
  expect(load(legacyRound(false))).toBeNull();
});

it('keeps a read-out round from the first build, with roles dealt again by the words alone', () => {
  const round = load(legacyRound(true))!;
  expect(round).toMatchObject({ revealed: true, sworn: [] });
  // Alphabetical by the words, so the roles no longer follow the name hash or the order sworn.
  expect(round.entries).toEqual([
    { id: 'e1', role: WITNESS_ROLES[0], text: 'A crime, frankly.' },
    { id: 'e2', role: WITNESS_ROLES[1], text: 'Lid acted alone.' },
    { id: 'e0', role: WITNESS_ROLES[2], text: 'Zzz. Blub.' },
  ]);
  expect(JSON.stringify(round)).not.toMatch(/Nate|Kevin|Jack|author|"at"/);
  // Once saved in the new shape, it reads back untouched.
  expect(load(round)).toEqual(round);
});

it('leaves a current round, and an empty save, as they are', () => {
  const current = threeSworn().testimony!;
  expect(load(current)).toEqual(current);
  expect(stateSchema.parse({ version: 3 }).testimony).toBeNull();
});
