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

it('flags an unreadable save and hands back the raw text so it can be rescued', () => {
  const storage = memoryStorage('{{{');
  const loaded = load(storage, NOW);

  expect(loaded.unreadable).toBe(true);
  expect(loaded.raw).toBe('{{{');
  expect(loaded.problem).toMatch(/saved party/i);
});

it('does not call an empty device unreadable', () => {
  const fresh = load(memoryStorage(), NOW);
  expect(fresh.unreadable).toBe(false);
  expect(fresh.raw).toBeNull();

  const good = memoryStorage();
  save(good, as('Kevin'));
  expect(load(good, NOW).unreadable).toBe(false);
});

it('treats a closing date it cannot read as an unreadable save, not an open trip', () => {
  const party = { ...as('Kevin'), settings: { hideRankings: true, awards: 'stories', expiresAt: 'soon' } };
  const storage = memoryStorage(JSON.stringify(party));
  const loaded = load(storage, NOW);

  expect(loaded.unreadable).toBe(true);
  expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify(party));
});

it('does not mistake a read that throws for an empty device', () => {
  const blocked = {
    getItem: () => {
      throw new DOMException('denied', 'SecurityError');
    },
    setItem: () => {},
    removeItem: () => {},
  };
  expect(() => load(blocked, NOW)).toThrow();
});

import preBureau from '../../e2e/fixtures/pre-bureau-save.json';

it('opens a save written before the Bureau existed, untouched, with the Bureau at its defaults', () => {
  const raw = JSON.stringify(preBureau);
  const loaded = load(memoryStorage(raw), NOW);

  expect(loaded.unreadable).toBe(false);
  expect(loaded.state.settings.act).toBe(1);
  expect(loaded.state.docket).toEqual([]);
  expect(loaded.state.docketSeq).toBe(0);
  expect(loaded.state.testimony).toBeNull();
  expect(loaded.state.feed).toEqual(preBureau.feed);
  expect(loaded.state.vault).toEqual(preBureau.vault);
  expect(loaded.state.picks).toEqual(preBureau.picks);
});

it('still opens a Bureau save after an older build has stripped the keys it does not know', () => {
  let state = act(as('Deniz'), { type: 'setAct', act: 3 }, NOW);
  state = act(state, { type: 'file', kind: 'incident', text: 'The cooler lid.' }, NOW);
  const older = JSON.parse(JSON.stringify(state));
  for (const key of ['docket', 'docketSeq', 'testimony']) delete older[key];
  delete older.settings.act;

  const loaded = load(memoryStorage(JSON.stringify(older)), NOW);
  expect(loaded.unreadable).toBe(false);
  expect(loaded.state.settings.act).toBe(1);
  expect(loaded.state.feed).toEqual(state.feed);
});
