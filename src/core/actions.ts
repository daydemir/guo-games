import {
  FEED_LIMIT,
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
import { sessionSchema } from './state';
import type { FeedEvent, State } from './state';
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
  | { type: 'settings'; hideRankings?: boolean; awards?: 'stories' | 'points'; expiresAt?: string };

const newId = () => globalThis.crypto.randomUUID();

/**
 * Switches which attendee this device is playing as.
 *
 * There is no server and no password: identity here demonstrates the shape of
 * the game, it is not authentication. Joining stays legal after the kill switch
 * so the recap can be read from any phone.
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

  const alreadyHere = state.feed.some((event) => event.actor === attendee && event.text.includes('joined'));
  const arrival = attendee === 'Spectator' ? 'A spectator is watching.' : `${attendee} joined the party.`;

  return {
    ...state,
    session: session.data,
    feed: alreadyHere ? state.feed : record(state.feed, { actor: attendee, text: arrival, at: now }),
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
      if (!mine[action.id] && Object.keys(mine).length >= MAX_PICKS) {
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
      if (!text || text.length > 300) throw new Error('Write a note of 1 to 300 characters.');
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
        next.settings.expiresAt = action.expiresAt;
      }
      if (action.hideRankings !== undefined) next.settings.hideRankings = action.hideRankings;
      if (action.awards !== undefined) next.settings.awards = action.awards;
      break;
    }
  }

  return next;
}

const MISSION_FEED: Record<'accepted' | 'done' | 'void', (who: Attendee) => string> = {
  accepted: (who) => `${who} took on a quiet mission.`,
  done: (who) => `${who} quietly finished something.`,
  void: (who) => `${who} passed on a mission. No points lost.`,
};

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
