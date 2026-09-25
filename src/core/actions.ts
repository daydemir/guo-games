import {
  ATTENDEES,
  FEED_LIMIT,
  MAX_FUTURE_CHARS,
  MAX_MEMORIES,
  MAX_NAME_CHARS,
  MAX_PICKS,
  MAX_STORY_CHARS,
  MOMENTS,
  ORGANIZERS,
  PARTY_CODE,
  bountyById,
  fishById,
  predictionById,
} from './content';
import type { Attendee, Color, Identity, Moment } from './content';
import { MEDIA_BUDGET_CHARS, mediaWeight, validateMedia } from './media';
import type { Media } from './media';
import {
  ACTS,
  DOCKET,
  FORECAST_WORDS,
  MAX_DOCKET,
  MAX_DOCKET_CHARS,
  MAX_SUBJECT_CHARS,
  MAX_TESTIMONY_CHARS,
  WITNESS_ROLES,
} from './bureau';
import type { Act, DocketKind, WitnessRole } from './bureau';
import { sessionSchema } from './state';
import type { FeedEvent, State, Testimony } from './state';
import { isReadOnly } from './time';

export type Action =
  | { type: 'pick'; id: string; choice: 'yes' | 'no' }
  | { type: 'settle'; id: string; result: 'yes' | 'no' }
  | { type: 'voidPrediction'; id: string }
  | { type: 'draft'; fish: string }
  | { type: 'claim'; id: string }
  | { type: 'confirm'; id: string }
  | { type: 'voidBounty'; id: string }
  | { type: 'mission'; status: 'accepted' | 'done' | 'void' }
  | { type: 'submitMemory'; about: Attendee; moment: Moment; text: string; media: Media | null }
  | { type: 'revealMemory'; id: string }
  | { type: 'removeMemory'; id: string }
  | { type: 'sealFuture'; text: string }
  | { type: 'dinner' }
  | { type: 'settings'; hideRankings?: boolean; awards?: 'stories' | 'points'; expiresAt?: string }
  | { type: 'setAct'; act: Act }
  | { type: 'file'; kind: DocketKind; text: string }
  | { type: 'strike'; id: string }
  | { type: 'openTestimony'; subject: string }
  | { type: 'testify'; author: Attendee; role: WitnessRole; text: string }
  | { type: 'revealTestimony' }
  | { type: 'strikeTestimony'; id: string };

const newId = () => globalThis.crypto.randomUUID();

/**
 * Switches which attendee this device is playing as.
 *
 * There is no server and no password: identity here demonstrates the shape of
 * the game, it is not authentication. Joining stays legal after the kill switch
 * so the recap can be read from any phone, but it no longer announces itself:
 * the recap is read-only, feed included.
 */
export function join(
  state: State,
  code: string,
  attendee: Identity,
  name: string,
  color: Color,
  now: number = Date.now(),
): State {
  if (code.trim().toUpperCase() !== PARTY_CODE) {
    throw new Error('That party code does not match. Ask an organizer, or try GUO27.');
  }

  const session = sessionSchema.safeParse({ attendee, name, color });
  if (!session.success) {
    throw new Error(`Pick who you are, and a name of 1 to ${MAX_NAME_CHARS} characters.`);
  }

  // Dedupe on the actor's own arrival line. Matching on the word "joined"
  // missed spectators entirely, so every switch back re-announced them.
  const arrival = attendee === 'Spectator' ? 'A spectator is watching.' : `${attendee} joined the party.`;
  const quiet =
    isReadOnly(state, now) || state.feed.some((event) => event.actor === attendee && event.text === arrival);

  return {
    ...state,
    session: session.data,
    feed: quiet ? state.feed : record(state.feed, { actor: attendee, text: arrival, at: now }),
  };
}

/**
 * The single way the party changes. Every rule that matters lives here, so the
 * screens stay declarative: they render state and dispatch intent, nothing else.
 *
 * Throws a sentence the interface can show the player verbatim.
 */
export function act(state: State, action: Action, now: number = Date.now()): State {
  if (isReadOnly(state, now)) {
    throw new Error('The trip has closed. This is a read-only recap.');
  }

  const me = state.session?.attendee;
  if (!me) throw new Error('Join the party first.');
  if (me === 'Spectator') {
    throw new Error('Spectators watch rather than play. Switch to an attendee to join in.');
  }

  const next = structuredClone(state);
  const log = (text: string) => {
    next.feed = record(next.feed, { actor: me, text, at: now });
  };

  switch (action.type) {
    case 'pick': {
      const prediction = mustFindPrediction(action.id);
      assertOpen(state, action.id);
      const mine = next.picks[me] ?? {};
      if (!mine[action.id] && openPicks(state, me) >= MAX_PICKS) {
        throw new Error('Keep it to three predictions at a time. Void one to make room.');
      }
      next.picks[me] = { ...mine, [action.id]: action.choice };
      log(`${me} took a side on: ${prediction.title}`);
      break;
    }

    case 'settle': {
      organizerOnly(state, 'settle a prediction');
      const prediction = mustFindPrediction(action.id);
      assertOpen(state, action.id);
      next.results[action.id] = action.result;
      log(`${me} settled ${prediction.title} as ${action.result}.`);
      break;
    }

    case 'voidPrediction': {
      const prediction = mustFindPrediction(action.id);
      // Opting out of something uncomfortable has to stay frictionless, so an
      // open market can be voided by anyone. Once it is settled it holds other
      // people's points, and erasing those is an organizer's call.
      if (state.results[action.id]) organizerOnly(state, 'void a settled prediction');
      next.results[action.id] = 'void';
      log(`${prediction.title} was voided. No points lost.`);
      break;
    }

    case 'draft': {
      const fish = fishById(action.fish);
      if (!fish) throw new Error('That species is not on the board.');
      const taken = Object.entries(state.draft).find(([who, id]) => who !== me && id === action.fish);
      if (taken) throw new Error(`${taken[0]} already drafted ${fish.name}. Pick another species.`);
      next.draft[me] = action.fish;
      log(`${me} drafted ${fish.name}.`);
      break;
    }

    case 'claim': {
      const bounty = mustFindBounty(action.id);
      const existing = state.bounties[action.id];
      if (existing && existing.status !== 'void') {
        throw new Error(`${existing.owner} already claimed this one. Take another.`);
      }
      if (heldBounties(state).some((held) => held.owner === me && held.status !== 'void')) {
        throw new Error('Just one bounty at a time. Let the day happen.');
      }
      next.bounties[action.id] = { owner: me, status: 'claimed' };
      log(`${me} claimed a bounty: ${bounty.title}.`);
      break;
    }

    case 'confirm': {
      const bounty = mustFindBounty(action.id);
      const held = state.bounties[action.id];
      if (!held || held.status !== 'claimed') throw new Error('This bounty needs an open claim first.');
      if (held.owner === me) throw new Error('A witness has to be someone else. Hand them the phone.');
      next.bounties[action.id] = { ...held, status: 'confirmed', witness: me };
      log(`${me} confirmed ${bounty.title} for ${held.owner}.`);
      break;
    }

    case 'voidBounty': {
      const bounty = mustFindBounty(action.id);
      const held = state.bounties[action.id];
      if (!held) throw new Error('Nothing to void here yet.');
      // Same shape as a prediction: an open claim is anyone's to wave off, a
      // confirmed one belongs to the person who did it.
      if (held.status === 'confirmed' && held.owner !== me && !isOrganizerIdentity(me)) {
        throw new Error('Only whoever did it, or an organizer, can undo a confirmed bounty.');
      }
      next.bounties[action.id] = { ...held, status: 'void' };
      log(`${bounty.title} was voided. No points lost.`);
      break;
    }

    case 'mission': {
      const current = state.missions[me];
      if (action.status === 'accepted') {
        if (current === 'void') throw new Error('You passed on this mission. It stays closed.');
        if (current) throw new Error('Your mission is already open.');
      }
      if (action.status === 'done' && current !== 'accepted') {
        throw new Error('Accept your mission first.');
      }
      next.missions[me] = action.status;
      log(MISSION_FEED[action.status](me));
      break;
    }

    case 'submitMemory': {
      const text = action.text.trim();
      if (!text && !action.media) throw new Error('Add a story or a small file.');
      if (text.length > MAX_STORY_CHARS) throw new Error('Keep stories under 1,200 characters.');
      if (state.vault.length >= MAX_MEMORIES) {
        throw new Error(`This device holds up to ${MAX_MEMORIES} memories. Withdraw one to add another.`);
      }
      if (!MOMENTS.includes(action.moment)) throw new Error('Pick a moment for this memory.');
      if (action.media) {
        validateMedia(action.media);
        const used = state.vault.reduce((total, memory) => total + mediaWeight(memory.media), 0);
        if (used + mediaWeight(action.media) > MEDIA_BUDGET_CHARS) {
          throw new Error('The local media budget is full. Add this one as text, or withdraw an older file.');
        }
      }
      next.vault.push({
        id: newId(),
        at: now,
        author: me,
        about: action.about,
        moment: action.moment,
        text,
        media: action.media,
        revealed: false,
      });
      log(`${me} added a memory to the vault.`);
      break;
    }

    case 'revealMemory': {
      organizerOnly(state, 'read a memory out loud');
      if (!state.dinner) throw new Error('Open dinner before revealing anything from the vault.');
      const memory = next.vault.find((entry) => entry.id === action.id);
      if (!memory) throw new Error('That memory is no longer here.');
      memory.revealed = true;
      log('A story from the vault was read out loud.');
      break;
    }

    case 'removeMemory': {
      const memory = state.vault.find((entry) => entry.id === action.id);
      if (!memory) throw new Error('That memory is no longer here.');
      if (memory.author !== me && !isOrganizerIdentity(me)) {
        throw new Error('You can only withdraw your own memory.');
      }
      next.vault = next.vault.filter((entry) => entry.id !== action.id);
      log('A memory was withdrawn from the vault.');
      break;
    }

    case 'sealFuture': {
      const text = action.text.trim();
      if (!text || text.length > MAX_FUTURE_CHARS) {
        throw new Error(`Write a note of 1 to ${MAX_FUTURE_CHARS} characters.`);
      }
      if (state.future[me]) throw new Error('Your note is already sealed. One per person.');
      next.future[me] = text;
      log(`${me} sealed a note for the future.`);
      break;
    }

    case 'dinner': {
      organizerOnly(state, 'open dinner');
      next.dinner = true;
      log('Dinner is open. Time to settle up.');
      break;
    }

    case 'settings': {
      organizerOnly(state, 'change settings');
      if (action.expiresAt !== undefined) {
        const parsed = Date.parse(action.expiresAt);
        if (Number.isNaN(parsed)) throw new Error('That is not a date the app can read.');
        if (parsed <= now) throw new Error('The closing date cannot be in the past.');
        // Stored as canonical ISO, whatever parseable shape the caller used.
        next.settings.expiresAt = new Date(parsed).toISOString();
      }
      if (action.hideRankings !== undefined) next.settings.hideRankings = action.hideRankings;
      if (action.awards !== undefined) next.settings.awards = action.awards;
      break;
    }

    case 'setAct': {
      organizerOnly(state, 'change the act');
      const info = ACTS[action.act];
      if (!info) throw new Error('The Bureau runs in four acts, I to IV.');
      next.settings.act = action.act;
      log(`The Bureau has opened Act ${info.numeral}: ${info.title}.`);
      break;
    }

    case 'file': {
      const text = action.text.trim().replace(/\s+/g, ' ');
      const kind = DOCKET[action.kind];
      if (!kind) throw new Error('The Bureau does not recognise that form.');
      if (action.kind === 'verdict') organizerOnly(state, 'enter a verdict');
      if (!text || text.length > MAX_DOCKET_CHARS) {
        throw new Error(`Filings are 1 to ${MAX_DOCKET_CHARS} characters.`);
      }
      const words = text.split(' ').length;
      if (action.kind === 'forecast' && words !== FORECAST_WORDS) {
        throw new Error(`Forecasts are exactly seven words. You have ${words}.`);
      }
      if (state.docket.length >= MAX_DOCKET) throw new Error('The record is full. Strike something first.');
      next.docketSeq = state.docketSeq + 1;
      next.docket.push({ id: newId(), at: now, author: me, seq: next.docketSeq, kind: action.kind, text });
      // The number only. The filing itself stays in the Case File, where it can be struck.
      log(`${me} filed ${caseNumber(action.kind, next.docketSeq)}.`);
      break;
    }

    case 'strike': {
      // The X-card: anyone playing can strike anything, and it is gone for good.
      if (!state.docket.some((entry) => entry.id === action.id)) throw new Error('That entry is already gone.');
      next.docket = next.docket.filter((entry) => entry.id !== action.id);
      log('An entry was struck from the record.');
      break;
    }

    case 'openTestimony': {
      organizerOnly(state, 'open testimony');
      const subject = action.subject.trim();
      if (!subject || subject.length > MAX_SUBJECT_CHARS) {
        throw new Error(`Name the event in 1 to ${MAX_SUBJECT_CHARS} characters.`);
      }
      // A round that never got going can be replaced, so a group that declines
      // never leaves Seven Witnesses stuck. Two sworn accounts are protected.
      if (state.testimony && !state.testimony.revealed && state.testimony.entries.length >= 2) {
        throw new Error('Testimony is already open. Read it out before starting another.');
      }
      next.testimony = { subject, revealed: false, sworn: [], entries: [] };
      log('Testimony is open. The phone goes round.');
      break;
    }

    case 'testify': {
      const round = next.testimony;
      if (!round) throw new Error('No testimony is open.');
      if (round.revealed) throw new Error('This testimony has been read out. It is closed.');
      // The Bench phone is signed in as a Clerk and passed round, so a Clerk may
      // take testimony for anyone. Anyone else only speaks for themselves.
      if (action.author !== me && !isOrganizerIdentity(me)) {
        throw new Error('You can only testify as yourself.');
      }
      if (round.sworn.includes(action.author)) throw new Error(`${action.author} has already testified.`);
      if (!freeRoles(round).includes(action.role)) throw new Error('That role is already taken. Choose again.');
      const text = action.text.trim();
      if (!text || text.length > MAX_TESTIMONY_CHARS) {
        throw new Error(`Testimony is 1 to ${MAX_TESTIMONY_CHARS} characters.`);
      }
      // The name goes on the roll, the words go under the role, and nothing
      // joins the two: roster order and role order say nothing about who wrote what.
      round.sworn = ATTENDEES.filter((who) => who === action.author || round.sworn.includes(who));
      round.entries = [...round.entries, { id: newId(), role: action.role, text }].sort(
        (a, b) => WITNESS_ROLES.indexOf(a.role) - WITNESS_ROLES.indexOf(b.role),
      );
      // No author and no role in the feed: either would unseal the reveal.
      log('A witness has sworn to it.');
      break;
    }

    case 'revealTestimony': {
      organizerOnly(state, 'read the testimony');
      const round = next.testimony;
      if (!round) throw new Error('No testimony is open.');
      if (round.revealed) throw new Error('This testimony has already been read out.');
      if (round.entries.length < 2) throw new Error('At least two witnesses have to testify first.');
      round.revealed = true;
      // Nobody can testify after the reveal, so the roll of names has no job left.
      round.sworn = [];
      log('The testimony was read into the record.');
      break;
    }

    case 'strikeTestimony': {
      const round = next.testimony;
      const entry = round?.entries.find((item) => item.id === action.id);
      if (!round || !entry) throw new Error('That testimony is already gone.');
      // Accounts carry no author, so striking one is a Clerk's job, on request, no reason owed.
      organizerOnly(state, 'strike testimony');
      round.entries = round.entries.filter((item) => item.id !== action.id);
      log('A testimony was struck from the record.');
      break;
    }
  }

  return next;
}

/** Roles nobody holds yet. The Bench deals one at random, so a role never points at a person. */
export const freeRoles = (round: Testimony): WitnessRole[] =>
  WITNESS_ROLES.filter((role) => !round.entries.some((entry) => entry.role === role));

/** INC-0004. Numbers are never reused, so a struck case leaves a gap. */
export const caseNumber = (kind: DocketKind, seq: number): string =>
  `${DOCKET[kind].prefix}-${String(seq).padStart(4, '0')}`;

const MISSION_FEED: Record<'accepted' | 'done' | 'void', (who: Attendee) => string> = {
  accepted: (who) => `${who} took on a quiet mission.`,
  done: (who) => `${who} quietly finished something.`,
  void: (who) => `${who} passed on a mission. No points lost.`,
};

/**
 * Picks still waiting on a result. A settled or voided pick has done its job,
 * so it stops holding one of the three slots.
 */
export const openPicks = (state: State, who: Attendee): number =>
  Object.keys(state.picks[who] ?? {}).filter((id) => !(id in state.results)).length;

/** Object.values on a partial record can yield holes. This drops them. */
export const heldBounties = (state: State) =>
  Object.values(state.bounties).filter((held) => held !== undefined);

const isOrganizerIdentity = (identity: Identity) => ORGANIZERS.includes(identity as Attendee);

function organizerOnly(state: State, what: string): void {
  if (!isOrganizerIdentity(state.session?.attendee ?? 'Spectator')) {
    throw new Error(`Only an organizer can ${what}. Ask Deniz or Nick.`);
  }
}

function mustFindPrediction(id: string) {
  const prediction = predictionById(id);
  if (!prediction) throw new Error('That prediction is not on the board.');
  return prediction;
}

function mustFindBounty(id: string) {
  const bounty = bountyById(id);
  if (!bounty) throw new Error('That bounty is not on the board.');
  return bounty;
}

/** A prediction with any result is closed, to further picks and to settling. */
function assertOpen(state: State, id: string): void {
  const result = state.results[id];
  if (result === 'void') throw new Error('This prediction was voided.');
  if (result) throw new Error('This prediction is already settled.');
}

/** Newest first, trimmed so a long day cannot grow the save without bound. */
function record(feed: FeedEvent[], event: Omit<FeedEvent, 'id'>): FeedEvent[] {
  return [{ id: newId(), ...event }, ...feed].slice(0, FEED_LIMIT);
}
