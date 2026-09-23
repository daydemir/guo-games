import { expect, it } from 'vitest';
import { readBackup, writeBackup } from './backup';
import { act } from './actions';
import { NOW, as } from './fixtures';
import { DEFAULT_EXPIRES_AT } from './content';

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

it('rejects a version 3 backup whose settings block is empty or partial', () => {
  const complete = JSON.parse(writeBackup(party())).party;

  // settings defaults would silently reset the organizer's closing date.
  for (const settings of [{}, { hideRankings: true }, { hideRankings: true, awards: 'stories' }]) {
    const file = JSON.stringify({ app: 'guo-games', party: { ...complete, settings } });
    expect(() => readBackup(file)).toThrow(/incomplete/i);
  }
});

it('rejects a version 3 backup whose settings are not an object', () => {
  const complete = JSON.parse(writeBackup(party())).party;
  for (const settings of ['nope', 42, null, []]) {
    const file = JSON.stringify({ app: 'guo-games', party: { ...complete, settings } });
    expect(() => readBackup(file)).toThrow(/incomplete/i);
  }
});

/** Everything a version 2 party carried, before the feed and the closing date. */
const V2_PARTY = {
  version: 2,
  session: { attendee: 'Kevin', name: 'Kev', color: 'sea' },
  settings: { hideRankings: false, awards: 'points' },
  dinner: true,
  picks: { Kevin: { flights: 'yes' } },
  results: { flights: 'yes' },
  draft: { Kevin: 'ono' },
  bounties: {},
  missions: { Kevin: 'done' },
  vault: [],
  future: { Kevin: 'Still arguing about the shortcut.' },
};

const v2File = (party: Record<string, unknown>) => JSON.stringify({ app: 'guo-games', party });

it('rejects a bare version 2 backup instead of migrating it into an empty party', () => {
  expect(() => readBackup(v2File({ version: 2 }))).toThrow(/incomplete/i);
});

it('rejects representative truncated version 2 backups', () => {
  const truncations = [
    { version: 2, session: V2_PARTY.session, draft: V2_PARTY.draft },
    { ...V2_PARTY, vault: undefined },
    { ...V2_PARTY, settings: { hideRankings: false } },
    { ...V2_PARTY, settings: 'points' },
  ];
  for (const party of truncations) {
    const file = v2File(JSON.parse(JSON.stringify(party)));
    expect(() => readBackup(file)).toThrow(/incomplete/i);
  }
});

it('accepts a complete version 2 backup and fills in only what version 3 added', () => {
  const restored = readBackup(v2File(V2_PARTY));

  expect(restored.version).toBe(3);
  expect(restored.session).toEqual(V2_PARTY.session);
  expect(restored.draft.Kevin).toBe('ono');
  expect(restored.missions.Kevin).toBe('done');
  // Carried across, not reset to the defaults.
  expect(restored.settings.hideRankings).toBe(false);
  expect(restored.settings.awards).toBe('points');
  // Genuinely new in version 3.
  expect(restored.feed).toEqual([]);
  expect(restored.settings.expiresAt).toBe(DEFAULT_EXPIRES_AT);
});
