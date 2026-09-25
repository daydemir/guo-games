import { expect, it } from 'vitest';
import { act } from './actions';
import { caseFile } from './selectors';
import { emptyState } from './state';
import { MAX_DOCKET } from './bureau';
import { NOW, as } from './fixtures';

const file = (text: string, kind: 'incident' | 'forecast' | 'verdict' = 'incident') =>
  ({ type: 'file', kind, text }) as const;

it('lets an organizer, and only an organizer, move the Bureau to another act', () => {
  const state = act(as('Deniz'), { type: 'setAct', act: 2 }, NOW);
  expect(state.settings.act).toBe(2);
  expect(state.feed[0].text).toBe('The Bureau has opened Act II: The Investigation.');

  expect(() => act(as('Jack'), { type: 'setAct', act: 3 }, NOW)).toThrow(/organizer/i);
  expect(() => act(as('Deniz'), { type: 'setAct', act: 5 as 1 }, NOW)).toThrow(/four acts/i);
});

it('files an incident under a case number and keeps its words out of the feed', () => {
  const state = act(as('Nick'), file('  2114.  Lime shortage, galley. '), NOW);
  const [row] = caseFile(state);
  expect(row.label).toBe('INC-0001');
  expect(row.text).toBe('2114. Lime shortage, galley.');
  expect(row.author).toBe('Nick');
  expect(state.feed[0].text).toBe('Nick filed INC-0001.');
  expect(JSON.stringify(state.feed)).not.toMatch(/lime/i);
});

it('holds a Fish Weather forecast to exactly seven words', () => {
  expect(() => act(as('Jack'), file('Low snack pressure moving in from the lanai tonight', 'forecast'), NOW)).toThrow(
    'Forecasts are exactly seven words. You have 9.',
  );
  const state = act(as('Jack'), file('Low snack pressure. Dmitriy front approaching, lanai.', 'forecast'), NOW);
  expect(caseFile(state)[0].label).toBe('FWS-0001');
});

it('refuses empty or overlong filings', () => {
  expect(() => act(as('Jack'), file('   '), NOW)).toThrow(/1 to 140/);
  expect(() => act(as('Jack'), file('x'.repeat(141)), NOW)).toThrow(/1 to 140/);
});

it('lets anyone strike anything, removes its words entirely, and never reuses the number', () => {
  let state = act(as('Nick'), file('The cooler lid has opinions.'), NOW);
  const id = state.docket[0].id;
  state = act(as('Simon', state), { type: 'strike', id }, NOW);

  expect(state.docket).toEqual([]);
  expect(JSON.stringify(state)).not.toMatch(/cooler lid/);
  expect(state.feed[0].text).toBe('An entry was struck from the record.');

  state = act(state, file('A sandal was found facing the wrong way.'), NOW);
  expect(caseFile(state)[0].label).toBe('INC-0002');
  expect(() => act(state, { type: 'strike', id }, NOW)).toThrow(/already gone/);
});

it('keeps verdicts to a Clerk, and the reading order oldest first', () => {
  expect(() => act(as('Jack'), file('Exhibit A ruled Authentic, 4 to 2.', 'verdict'), NOW)).toThrow(/organizer/i);

  let state = act(as('Deniz'), file('First.'), NOW);
  state = act(state, file('Exhibit A ruled Authentic, 4 to 2.', 'verdict'), NOW);
  state = act(state, file('Second.'), NOW);
  expect(caseFile(state, ['incident'], 'oldest').map((row) => row.text)).toEqual(['First.', 'Second.']);
  expect(caseFile(state).map((row) => row.label)).toEqual(['INC-0003', 'VER-0002', 'INC-0001']);
});

it('refuses spectators, the closed trip, and a full record', () => {
  expect(() => act(as('Spectator'), file('Watching.'), NOW)).toThrow(/spectators/i);

  const closed = as('Jack');
  expect(() => act(closed, file('Too late.'), Date.parse(closed.settings.expiresAt))).toThrow(/read-only/);

  let full = as('Jack', emptyState());
  for (let i = 0; i < MAX_DOCKET; i += 1) full = act(full, file(`Entry ${i}.`), NOW);
  expect(() => act(full, file('One more.'), NOW)).toThrow('The record is full. Strike something first.');
});
