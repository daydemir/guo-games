import { expect, it } from 'vitest';
import { ATTENDEES, BOUNTIES, DIRECTIVES, FISH, GUARDRAILS, PREDICTIONS } from './content';
import { ACTS, ACT_NUMBERS, BENCH_CARDS, CONTRABAND, DOCKET, WITNESS_ROLES, benchDeck } from './bureau';

it('keeps every id an existing save may hold, because removing one makes that save unreadable', () => {
  const ids = (list: readonly { id: string }[]) => list.map((item) => item.id);
  expect(ids(FISH)).toEqual(['mahimahi', 'ono', 'ahi', 'marlin', 'uku', 'opakapaka', 'ulua', 'kawakawa', 'aku']);
  expect(ids(PREDICTIONS).slice(0, 7)).toEqual(['flights', 'fishing', 'firstfish', 'downtime', 'nap', 'dinner', 'story']);
  expect(ids(BOUNTIES).slice(0, 6)).toEqual(['callback', 'spark', 'gratitude', 'bridge', 'frame', 'toast']);
});

it('gives every act a deck and every card a unique id', () => {
  for (const act of ACT_NUMBERS) expect(benchDeck(act).length).toBeGreaterThan(2);
  const ids = BENCH_CARDS.map((card) => card.id);
  expect(new Set(ids).size).toBe(ids.length);
});

it('issues every attendee a Classified Order and has a witness role for each of them', () => {
  for (const who of ATTENDEES) expect(CONTRABAND[who].length).toBeGreaterThan(5);
  expect(WITNESS_ROLES.length).toBeGreaterThanOrEqual(ATTENDEES.length);
});

it('keeps the Bureau deadpan: no em dashes and no exclamation marks anywhere it speaks', () => {
  const words = [
    ...BENCH_CARDS.flatMap((card) => [card.title, ...card.lines, card.vote?.verdict ?? '', card.link?.label ?? '']),
    ...Object.values(ACTS).flatMap((info) => [info.title, info.body, info.memo('https://example.test/')]),
    ...Object.values(CONTRABAND),
    ...Object.values(DOCKET).map((kind) => kind.placeholder),
    ...DIRECTIVES,
    ...GUARDRAILS,
    ...FISH.map((fish) => fish.note),
    ...PREDICTIONS.map((prediction) => `${prediction.title} ${prediction.detail}`),
    ...BOUNTIES.map((bounty) => `${bounty.title} ${bounty.detail}`),
  ];
  for (const line of words) {
    expect(line, line).not.toMatch(/—|!/);
  }
});

it('never puts a person on trial: every vote card concerns an object, a story or a retcon', () => {
  const votes = BENCH_CARDS.filter((card) => card.vote).map((card) => card.id);
  expect(votes).toEqual(['exhibit-a', 'sworn-testimony', 'object-trial', 'retcon']);
});

it('keeps people out of the examples the Case File shows', () => {
  for (const { placeholder } of Object.values(DOCKET)) {
    for (const who of ATTENDEES) expect(placeholder, placeholder).not.toContain(who);
  }
});
