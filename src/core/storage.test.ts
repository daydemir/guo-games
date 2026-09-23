import { expect, it } from 'vitest';
import { STORAGE_KEY, clear, load, save } from './storage';
import { act } from './actions';
import { demoState, emptyState } from './state';
import { NOW, as } from './fixtures';

function memoryStorage(seed?: string) {
  const values = new Map<string, string>();
  if (seed !== undefined) values.set(STORAGE_KEY, seed);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

it('seeds a demo party on a device that has never opened the app', () => {
  const loaded = load(memoryStorage(), NOW);
  expect(loaded.state.session).toBeNull();
  expect(loaded.state.feed.length).toBeGreaterThan(3);
  expect(Object.keys(loaded.state.draft).length).toBeGreaterThan(1);
  expect(loaded.problem).toBeNull();
});

it('round-trips a saved party without touching it', () => {
  const storage = memoryStorage();
  const state = act(as('Kevin', demoState(NOW)), { type: 'draft', fish: 'mahimahi' }, NOW);
  save(storage, state);
  expect(load(storage, NOW).state).toEqual(state);
});

it('migrates an older save by filling in the settings that did not exist yet', () => {
  const previous = { version: 2, session: { attendee: 'Kevin', name: 'Kev', color: 'sea' }, draft: { Kevin: 'ono' } };
  const { state, problem } = load(memoryStorage(JSON.stringify(previous)), NOW);

  expect(problem).toBeNull();
  expect(state.version).toBe(3);
  expect(state.draft.Kevin).toBe('ono');
  expect(state.session?.name).toBe('Kev');
  expect(state.settings.hideRankings).toBe(true);
  expect(state.settings.awards).toBe('stories');
  expect(state.feed).toEqual([]);
});

it('reports unreadable or newer saves instead of silently destroying them', () => {
  for (const bad of ['{{{', JSON.stringify({ version: 99 }), JSON.stringify({ version: 3, draft: { Kevin: 'shark' } })]) {
    const storage = memoryStorage(bad);
    const { state, problem } = load(storage, NOW);
    expect(problem).toMatch(/saved party/i);
    expect(state.session).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBe(bad);
  }
});

it('turns a full storage quota into an explainable message', () => {
  const full = {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('quota', 'QuotaExceededError');
    },
    removeItem: () => {},
  };
  expect(() => save(full, emptyState())).toThrow(/storage is full/i);
});

it('clears back to a fresh demo party', () => {
  const storage = memoryStorage();
  save(storage, as('Kevin'));
  clear(storage);
  expect(storage.getItem(STORAGE_KEY)).toBeNull();
  expect(load(storage, NOW).state.session).toBeNull();
});
