import { expect, it } from 'vitest';
import { readBackup, writeBackup } from './backup';
import { act } from './actions';
import { NOW, as } from './fixtures';

const party = () => act(as('Kevin'), { type: 'draft', fish: 'ono' }, NOW);

it('round-trips a whole party through a backup file', () => {
  const state = party();
  expect(readBackup(writeBackup(state))).toEqual(state);
});

it('writes something a human can recognise as this app', () => {
  const text = writeBackup(party());
  expect(JSON.parse(text).app).toBe('guo-games');
  expect(text).toContain('\n');
});

it('refuses a file that is not a Guo Games backup', () => {
  expect(() => readBackup('not json at all')).toThrow(/could not be read/i);
  expect(() => readBackup(JSON.stringify({ app: 'something-else', party: {} }))).toThrow(/Guo Games backup/i);
});

it('refuses a complete backup that holds a value this build cannot understand', () => {
  // Complete, so it reaches the schema rather than the completeness check,
  // and still rejected because no such fish exists.
  const bad = JSON.stringify({
    app: 'guo-games',
    party: { ...JSON.parse(writeBackup(party())).party, draft: { Kevin: 'shark' } },
  });
  expect(() => readBackup(bad)).toThrow(/newer version|could not be read/i);
});

it('accepts a backup written by an older save format by migrating it', () => {
  const older = JSON.stringify({
    app: 'guo-games',
    party: { version: 2, session: { attendee: 'Kevin', name: 'Kev', color: 'sea' }, draft: { Kevin: 'ono' } },
  });
  const restored = readBackup(older);
  expect(restored.version).toBe(3);
  expect(restored.draft.Kevin).toBe('ono');
  expect(restored.settings.awards).toBe('stories');
});

it('refuses an incomplete version 3 party instead of defaulting it to an empty one', () => {
  // Schema defaults mean a truncated v3 save parses into a perfectly valid
  // empty party. Restoring that would silently erase everything.
  const truncated = JSON.stringify({ app: 'guo-games', party: { version: 3 } });
  expect(() => readBackup(truncated)).toThrow(/incomplete/i);

  const halfWritten = JSON.stringify({
    app: 'guo-games',
    party: { version: 3, session: null, settings: { hideRankings: true, awards: 'stories', expiresAt: '2027-07-06T10:00:00Z' } },
  });
  expect(() => readBackup(halfWritten)).toThrow(/incomplete/i);
});

it('still accepts a complete version 3 party written by this app', () => {
  const state = party();
  const restored = readBackup(writeBackup(state));
  expect(restored.vault).toEqual(state.vault);
  expect(restored.feed).toEqual(state.feed);
});
