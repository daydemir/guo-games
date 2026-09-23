/**
 * Everything about this particular party: who is on it, what can be predicted,
 * and the words the app says. Kept apart from the rules so a future trip can be
 * re-skinned without touching game logic.
 */

export const PARTY_NAME = 'The Guo Games';
export const PARTY_CODE = 'GUO27';

export const ATTENDEES = ['Kevin', 'Deniz', 'Nick', 'Jack', 'Simon', 'Nate', 'Dmitriy'] as const;
export type Attendee = (typeof ATTENDEES)[number];

/** Deniz and Nick run the day. Everyone else just plays. */
export const ORGANIZERS: readonly Attendee[] = ['Deniz', 'Nick'];

export type Identity = Attendee | 'Spectator';
export const IDENTITIES: readonly Identity[] = [...ATTENDEES, 'Spectator'];

export const COLORS = ['sea', 'coral', 'sand', 'lilac', 'palm', 'dusk', 'ember'] as const;
export type Color = (typeof COLORS)[number];

export const MOMENTS = ['Before Maui', 'Flights', 'Fishing', 'Downtime', 'Dinner'] as const;
export type Moment = (typeof MOMENTS)[number];

/** Limits that keep the game small and the browser storage healthy. */
export const MAX_PICKS = 3;
export const MAX_MEMORIES = 24;
export const MAX_STORY_CHARS = 1200;
export const MAX_FUTURE_CHARS = 300;
export const MAX_NAME_CHARS = 24;
export const FEED_LIMIT = 60;

/** Default close of the trip. Organizers can move it in settings. */
export const DEFAULT_EXPIRES_AT = '2027-07-06T10:00:00Z';
/** Sealed notes stay shut for five years. */
export const FUTURE_OPENS_AT = '2032-07-06T10:00:00Z';

export const POINTS = { prediction: 10, bounty: 5, mission: 5 } as const;

export type Fish = { id: string; name: string; note: string };

export const FISH: readonly Fish[] = [
  { id: 'mahimahi', name: 'Mahi-mahi', note: 'Gold and green. The crowd pleaser.' },
  { id: 'ono', name: 'Ono', note: 'Fast, and named after the word for delicious.' },
  { id: 'ahi', name: 'Ahi', note: 'Deep water. Patience required.' },
  { id: 'marlin', name: 'Marlin', note: 'The long shot on the board.' },
  { id: 'uku', name: 'Uku', note: 'Grey snapper. Quietly reliable.' },
  { id: 'opakapaka', name: 'Opakapaka', note: 'Pink snapper. The chef pick.' },
  { id: 'ulua', name: 'Ulua', note: 'Trevally. Fights harder than it looks.' },
  { id: 'kawakawa', name: 'Kawakawa', note: 'Little tuna, big energy.' },
  { id: 'aku', name: 'Aku', note: 'Skipjack. Shows up in numbers.' },
];

export type Prediction = { id: string; moment: Moment; title: string; detail: string };

export const PREDICTIONS: readonly Prediction[] = [
  {
    id: 'flights',
    moment: 'Flights',
    title: 'Does the whole crew land before sunset?',
    detail: 'One arrival window. Seven very different packing strategies.',
  },
  {
    id: 'fishing',
    moment: 'Fishing',
    title: 'Do we see three different species from the boat?',
    detail: 'Noticing counts. Nothing has to be caught, and nobody has to go out.',
  },
  {
    id: 'firstfish',
    moment: 'Fishing',
    title: 'Does anyone hit their drafted species?',
    detail: 'The Dock Draft board settles this one.',
  },
  {
    id: 'downtime',
    moment: 'Downtime',
    title: 'Does an old photo start a new story?',
    detail: 'A callback from the archives, somewhere between the beach and the table.',
  },
  {
    id: 'nap',
    moment: 'Downtime',
    title: 'Do at least three people fall asleep before 6pm?',
    detail: 'The afternoon is undefeated.',
  },
  {
    id: 'dinner',
    moment: 'Dinner',
    title: 'Does the first toast make Kevin laugh?',
    detail: 'A kind toast. A familiar story. An easy yes or no.',
  },
  {
    id: 'story',
    moment: 'Dinner',
    title: 'Does a story nobody has heard make it to the table?',
    detail: 'The vault settles this one.',
  },
];

export type Bounty = { id: string; title: string; moment: string; detail: string };

/** Opt-in, low risk, confirmable by one witness. Nothing here needs a photo. */
export const BOUNTIES: readonly Bounty[] = [
  {
    id: 'callback',
    title: 'The Callback',
    moment: 'Anytime',
    detail: 'Ask someone for a favorite Kevin memory, then listen to all of it without adding your own.',
  },
  {
    id: 'spark',
    title: 'Energy-Dip Spark',
    moment: '4pm to 7pm',
    detail: 'When the day goes quiet, offer the crew a break or hand someone the speaker. Let them choose.',
  },
  {
    id: 'gratitude',
    title: 'Small Thanks',
    moment: 'Anytime',
    detail: 'Thank someone for a small thing they did today, and say why it mattered.',
  },
  {
    id: 'bridge',
    title: 'The Bridge',
    moment: 'Anytime',
    detail: 'Introduce two people here using something they have in common that is not Kevin.',
  },
  {
    id: 'frame',
    title: 'One Good Frame',
    moment: 'Anytime',
    detail: 'Take exactly one photo today, then put the phone away. Show it at dinner.',
  },
  {
    id: 'toast',
    title: 'Toast Reveal',
    moment: 'Dinner',
    detail: 'Offer a thirty second toast built from one detail you learned today.',
  },
];

/** One private mission each. Kind, low risk, and never shown to anyone else. */
export const MISSIONS: Record<Attendee, string> = {
  Kevin: 'Quietly thank someone here for a friendship moment you still think about.',
  Deniz: 'Ask someone which small part of today they want to remember, then write it down for them.',
  Nick: 'Invite someone to pick the next song, with no pressure to perform.',
  Jack: 'Tell someone one thing you admire about how they show up for other people.',
  Simon: 'Find a shared memory with whoever you have caught up with least.',
  Nate: 'Help with one small task, then let someone else take the credit for it.',
  Dmitriy: 'Save one kind observation about the crew and bring it to dinner.',
};

/** Shown once during the 4pm to 7pm regroup. Chosen by the day, not at random. */
export const SPARKS: readonly string[] = [
  'The day has gone quiet. Ask someone what surprised them so far.',
  'Somebody is tired and not saying so. Offer water and twenty minutes.',
  'Hand the speaker to whoever has not picked a song yet.',
  'Ask Kevin about a plan he had at twenty-two that he is glad did not happen.',
  'Name one thing you would not have done today on your own.',
];

export const GUARDRAILS: readonly string[] = [
  'Everything here is opt-in. Skipping is a normal move.',
  'Nothing asks for a dangerous stunt, an ocean dare, a drinking challenge, or pressure on a stranger.',
  'Teasing comes from shared history, never from private exposure.',
  'Anyone playing can void anything still open, with no points lost and no explanation owed.',
  'Spectator is a real role. You can watch the whole day and never pick a thing.',
];

export const isAttendee = (identity: Identity | null | undefined): identity is Attendee =>
  identity != null && identity !== 'Spectator';

export const fishById = (id: string) => FISH.find((fish) => fish.id === id) ?? null;
export const predictionById = (id: string) => PREDICTIONS.find((prediction) => prediction.id === id) ?? null;
export const bountyById = (id: string) => BOUNTIES.find((bounty) => bounty.id === id) ?? null;
