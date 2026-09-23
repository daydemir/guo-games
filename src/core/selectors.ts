import {
  ATTENDEES,
  BOUNTIES,
  FISH,
  FUTURE_OPENS_AT,
  MAX_PICKS,
  MISSIONS,
  ORGANIZERS,
  POINTS,
  PREDICTIONS,
  SPARKS,
  isAttendee,
} from './content';
import type { Attendee, Bounty, Fish, Identity, Prediction } from './content';
import { heldBounties } from './actions';
import type { Memory, State } from './state';
import { isReadOnly } from './time';

export const me = (state: State): Identity | null => state.session?.attendee ?? null;

export const isOrganizer = (state: State): boolean => {
  const who = me(state);
  return isAttendee(who) && ORGANIZERS.includes(who);
};

/* ------------------------------------------------------------------ scoring */

export type Score = { attendee: Attendee; points: number; correct: number; confirmed: number; missions: number };

export function scores(state: State): Score[] {
  return ATTENDEES.map((attendee) => {
    const correct = Object.entries(state.picks[attendee] ?? {}).filter(
      ([id, pick]) => state.results[id] === pick,
    ).length;
    const confirmed = heldBounties(state).filter(
      (held) => held.owner === attendee && held.status === 'confirmed',
    ).length;
    const missions = state.missions[attendee] === 'done' ? 1 : 0;

    return {
      attendee,
      correct,
      confirmed,
      missions,
      points: correct * POINTS.prediction + confirmed * POINTS.bounty + missions * POINTS.mission,
    };
  });
}

/**
 * Standings, or null while they are sealed. Hidden until dinner by default,
 * because a live leaderboard turns the day into a tournament.
 */
export function standings(state: State): Score[] | null {
  if (state.settings.hideRankings && !state.dinner) return null;
  return [...scores(state)].sort(
    (a, b) => b.points - a.points || ATTENDEES.indexOf(a.attendee) - ATTENDEES.indexOf(b.attendee),
  );
}

/* ------------------------------------------------------------------- awards */

export type AwardCard = { attendee: Attendee; title: string; line: string };

const AWARDS: { title: string; line: string; measure: (score: Score, state: State) => number }[] = [
  { title: 'The Oracle', line: 'Read the day before it happened.', measure: (score) => score.correct },
  {
    title: 'The Witness',
    line: 'Saw it, said so, asked for nothing.',
    measure: (score, state) => heldBounties(state).filter((held) => held.witness === score.attendee).length,
  },
  { title: 'The Quiet Confirm', line: 'Did the thing, and let one person notice.', measure: (score) => score.confirmed },
  {
    title: 'The Archivist',
    line: 'Kept the parts that were going to get lost.',
    measure: (score, state) => state.vault.filter((memory) => memory.author === score.attendee).length,
  },
  { title: 'The Ghost', line: 'Finished a mission nobody was told about.', measure: (score) => score.missions },
  {
    title: 'The Deckhand',
    line: 'Called the fish and stood by it.',
    measure: (score, state) => (state.draft[score.attendee] ? 1 : 0),
  },
  {
    title: 'Sealed Future',
    line: 'Left a note for people five years from here.',
    measure: (score, state) => (state.future[score.attendee] ? 1 : 0),
  },
];

const GOOD_COMPANY = { title: 'Good Company', line: 'Showed up and made the day easier for everyone else.' };

/**
 * One card per person, most distinctive first, nobody left out.
 *
 * Awards are handed out greedily in priority order: whoever leads a category
 * and has not been recognised yet takes it, ties broken by roster order.
 * Everyone still standing gets the same warm fallback, which is the point. A
 * story award should never read as a consolation prize.
 */
export function awardCards(state: State): AwardCard[] {
  const table = scores(state);
  const taken = new Set<Attendee>();
  const cards: AwardCard[] = [];

  for (const award of AWARDS) {
    const winner = table
      .filter((score) => !taken.has(score.attendee) && award.measure(score, state) > 0)
      .sort((a, b) => award.measure(b, state) - award.measure(a, state))[0];
    if (!winner) continue;
    taken.add(winner.attendee);
    cards.push({ attendee: winner.attendee, title: award.title, line: award.line });
  }

  for (const attendee of ATTENDEES) {
    if (!taken.has(attendee)) cards.push({ attendee, ...GOOD_COMPANY });
  }

  return cards.sort((a, b) => ATTENDEES.indexOf(a.attendee) - ATTENDEES.indexOf(b.attendee));
}

/* -------------------------------------------------------------- dock draft */

export type DraftRow = { fish: Fish; drafter: Attendee | null };

export function draftBoard(state: State): DraftRow[] {
  const byFish = new Map<string, Attendee>();
  for (const attendee of ATTENDEES) {
    const fish = state.draft[attendee];
    if (fish) byFish.set(fish, attendee);
  }
  return FISH.map((fish) => ({ fish, drafter: byFish.get(fish.id) ?? null }));
}

export const myFish = (state: State): Fish | null => {
  const who = me(state);
  if (!isAttendee(who)) return null;
  return FISH.find((fish) => fish.id === state.draft[who]) ?? null;
};

/* ----------------------------------------------------------------- bounties */

export type BountyRow = {
  bounty: Bounty;
  owner: Attendee | null;
  witness: Attendee | null;
  status: 'open' | 'claimed' | 'confirmed' | 'void';
};

export function bountyBoard(state: State): BountyRow[] {
  return BOUNTIES.map((bounty) => {
    const held = state.bounties[bounty.id];
    return {
      bounty,
      owner: held?.owner ?? null,
      witness: held?.witness ?? null,
      status: held ? held.status : 'open',
    };
  });
}

export const myBounty = (state: State): BountyRow | null => {
  const who = me(state);
  if (!isAttendee(who)) return null;
  return bountyBoard(state).find((row) => row.owner === who && row.status !== 'void') ?? null;
};

/* ----------------------------------------------------------------- missions */

export type PrivateMission = { text: string; status: 'sealed' | 'accepted' | 'done' | 'void' };

/** Only ever answers for the identity this device is currently holding. */
export function privateMission(state: State): PrivateMission | null {
  const who = me(state);
  if (!isAttendee(who)) return null;
  return { text: MISSIONS[who], status: state.missions[who] ?? 'sealed' };
}

/* -------------------------------------------------------------------- vault */

/** What the current identity may see: their own, plus anything read out at dinner. */
export function vaultEntries(state: State): Memory[] {
  const who = me(state);
  return state.vault.filter((memory) => memory.revealed || memory.author === who);
}

export type InboxGroup = { about: Attendee; memories: Memory[] };

/** The organizer inbox, grouped by who each memory is about. Empty for everyone else. */
export function organizerInbox(state: State): InboxGroup[] {
  if (!isOrganizer(state)) return [];
  return ATTENDEES.map((about) => ({
    about,
    memories: state.vault.filter((memory) => memory.about === about),
  })).filter((group) => group.memories.length > 0);
}

export const myMemories = (state: State): Memory[] =>
  state.vault.filter((memory) => memory.author === me(state));

/* ------------------------------------------------------------ sealed future */

export function futureEntries(state: State, now: number = Date.now()): { attendee: Attendee; text: string }[] {
  if (now < Date.parse(FUTURE_OPENS_AT)) return [];
  return ATTENDEES.flatMap((attendee) => {
    const text = state.future[attendee];
    return text ? [{ attendee, text }] : [];
  });
}

export const sealedCount = (state: State): number => ATTENDEES.filter((who) => state.future[who]).length;

/* --------------------------------------------------------------- today view */

export type NextAction = { id: string; title: string; body: string; tab: string };

/**
 * One thing to do, never a list. The app is trying to get the phone back into a
 * pocket, so the home screen refuses to show a queue of chores.
 */
export function nextAction(state: State, now: number = Date.now()): NextAction {
  const who = me(state);

  if (!who) {
    return { id: 'join', title: 'Join the party', body: 'Party code, your name, a color. Thirty seconds.', tab: 'today' };
  }
  if (isReadOnly(state, now)) {
    return { id: 'recap', title: 'The trip is closed', body: 'Everything here is the recap now. Nothing can change.', tab: 'dinner' };
  }
  if (!isAttendee(who)) {
    return {
      id: 'spectate',
      title: 'You are watching',
      body: 'Follow the feed and the boards. Switch to an attendee any time you want in.',
      tab: 'feed',
    };
  }

  if (Object.keys(state.picks[who] ?? {}).length === 0) {
    return { id: 'predict', title: 'Call one thing', body: 'Pick a side on any prediction. Three is the most you can hold.', tab: 'predictions' };
  }
  if (!state.draft[who]) {
    return { id: 'draft', title: 'Draft a fish', body: 'One species each, no repeats, before lines hit the water.', tab: 'draft' };
  }
  if ((state.missions[who] ?? 'sealed') === 'sealed') {
    return { id: 'mission', title: 'Open your mission', body: 'One private, low-key thing. Only this phone can see it.', tab: 'mission' };
  }

  const held = myBounty(state);
  if (!held) {
    return { id: 'bounty', title: 'Take one bounty', body: 'Opt in to a single small act. Void it any time, no penalty.', tab: 'bounties' };
  }
  if (held.status === 'claimed') {
    return {
      id: 'witness',
      title: 'Find one witness',
      body: `Hand someone the phone after ${held.bounty.title}. One tap confirms it.`,
      tab: 'bounties',
    };
  }
  if (myMemories(state).length === 0) {
    return { id: 'vault', title: 'Add one memory', body: 'A short story, a photo, or a voice note for the Nostalgia Vault.', tab: 'vault' };
  }
  if (!state.future[who]) {
    return { id: 'future', title: 'Seal a note', body: 'One prediction for five years from now. Nobody reads it until then.', tab: 'dinner' };
  }

  return {
    id: 'rest',
    title: 'You are set',
    body: 'Put the phone away. This will be here when something needs settling.',
    tab: 'feed',
  };
}

/** The Energy-Dip Spark: one prompt during the 4pm to 7pm regroup, and only then. */
export function energyDipSpark(now: number = Date.now()): string | null {
  const when = new Date(now);
  if (when.getHours() < 16 || when.getHours() >= 19) return null;
  const dayOfYear = Math.floor((now - new Date(when.getFullYear(), 0, 0).getTime()) / 86_400_000);
  return SPARKS[dayOfYear % SPARKS.length];
}

/* -------------------------------------------------------------- predictions */

export type PredictionRow = {
  prediction: Prediction;
  myPick: 'yes' | 'no' | null;
  result: 'yes' | 'no' | 'void' | null;
  tally: { yes: number; no: number };
};

export function predictionBoard(state: State): PredictionRow[] {
  const who = me(state);
  return PREDICTIONS.map((prediction) => {
    const tally = { yes: 0, no: 0 };
    for (const attendee of ATTENDEES) {
      const pick = state.picks[attendee]?.[prediction.id];
      if (pick) tally[pick] += 1;
    }
    return {
      prediction,
      myPick: (isAttendee(who) && state.picks[who]?.[prediction.id]) || null,
      result: state.results[prediction.id] ?? null,
      tally,
    };
  });
}

export const picksLeft = (state: State): number => {
  const who = me(state);
  if (!isAttendee(who)) return 0;
  return Math.max(0, MAX_PICKS - Object.keys(state.picks[who] ?? {}).length);
};
