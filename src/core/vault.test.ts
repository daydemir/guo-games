import { expect, it } from 'vitest';
import { MAX_MEMORIES, MAX_STORY_CHARS } from './content';
import { act } from './actions';
import { organizerInbox, vaultEntries } from './selectors';
import { NOW, as } from './fixtures';

const story = { type: 'submitMemory', about: 'Nick', moment: 'Before Maui', text: 'The road trip playlist.', media: null } as const;

it('keeps a memory private to its author and the organizer inbox until dinner reveals it', () => {
  let state = act(as('Kevin'), story, NOW);
  expect(vaultEntries(state)).toHaveLength(1);
  expect(vaultEntries(as('Jack', state))).toHaveLength(0);
  expect(organizerInbox(as('Deniz', state))).toHaveLength(1);
  expect(organizerInbox(as('Jack', state))).toHaveLength(0);

  state = as('Deniz', state);
  state = act(state, { type: 'dinner' }, NOW);
  state = act(state, { type: 'revealMemory', id: state.vault[0].id }, NOW);
  expect(vaultEntries(as('Jack', state))).toHaveLength(1);
});

it('holds a reveal until dinner is open and restricts it to organizers', () => {
  const state = act(as('Kevin'), story, NOW);
  const id = state.vault[0].id;
  expect(() => act(state, { type: 'revealMemory', id }, NOW)).toThrow(/organizer/i);
  expect(() => act(as('Deniz', state), { type: 'revealMemory', id }, NOW)).toThrow(/dinner/i);
});

it('lets an author withdraw their own memory and stops anyone else doing it', () => {
  const state = act(as('Kevin'), story, NOW);
  const id = state.vault[0].id;
  expect(() => act(as('Jack', state), { type: 'removeMemory', id }, NOW)).toThrow(/your own/i);
  expect(act(state, { type: 'removeMemory', id }, NOW).vault).toHaveLength(0);
  expect(act(as('Nick', state), { type: 'removeMemory', id }, NOW).vault).toHaveLength(0);
});

it('needs either words or a file, and holds stories to a readable length', () => {
  expect(() => act(as('Kevin'), { ...story, text: '  ' }, NOW)).toThrow(/story or/i);
  expect(() => act(as('Kevin'), { ...story, text: 'x'.repeat(MAX_STORY_CHARS + 1) }, NOW)).toThrow(/1,200/);
});

it('caps how many memories one device will hold', () => {
  let state = as('Kevin');
  for (let i = 0; i < MAX_MEMORIES; i += 1) state = act(state, { ...story, text: `Memory ${i}` }, NOW);
  expect(() => act(state, { ...story, text: 'One more' }, NOW)).toThrow(new RegExp(String(MAX_MEMORIES)));
});

it('keeps memory text out of the shared feed', () => {
  const state = act(as('Kevin'), story, NOW);
  expect(state.feed.some((event) => event.text.includes('road trip playlist'))).toBe(false);
  expect(state.feed.at(0)?.text).toMatch(/vault/i);
});

it('groups the organizer inbox by the attendee each memory is about', () => {
  let state = act(as('Kevin'), story, NOW);
  state = act(state, { ...story, about: 'Kevin', text: 'A second one.' }, NOW);
  const inbox = organizerInbox(as('Deniz', state));
  expect(inbox.map((entry) => entry.about)).toEqual(['Kevin', 'Nick']);
  expect(inbox.every((entry) => entry.memories.length === 1)).toBe(true);
});
