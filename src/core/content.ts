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

/** Append only: saved memories and predictions store these as enum values. */
export const MOMENTS = ['Before Maui', 'Flights', 'Fishing', 'Downtime', 'Dinner', 'Tonight', 'Tomorrow'] as const;
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

/**
 * The Dock Draft doubles as the Fish Oracle: each note is an augury for
 * whoever drafted that species. Ids are saved in every party, so they never
 * change; the notes can.
 */
export const FISH: readonly Fish[] = [
  { id: 'mahimahi', name: 'Mahi-mahi', note: 'The crowd pleaser. You will be asked to choose for the table.' },
  { id: 'ono', name: 'Ono', note: 'Speed will betray you before midnight.' },
  { id: 'ahi', name: 'Ahi', note: 'Say nothing for the first ten minutes of dinner. Power follows.' },
  { id: 'marlin', name: 'Marlin', note: 'The long shot. A story you abandoned will be requested.' },
  { id: 'uku', name: 'Uku', note: 'Quietly reliable. You will be handed the Gavel.' },
  { id: 'opakapaka', name: 'Opakapaka', note: 'The chef pick. Your order will be copied.' },
  { id: 'ulua', name: 'Ulua', note: 'Fights harder than it looks. Win one argument you do not care about.' },
  { id: 'kawakawa', name: 'Kawakawa', note: 'Little tuna, big energy. You will start the second wind.' },
  { id: 'aku', name: 'Aku', note: 'Shows up in numbers. Recruit two people to anything.' },
];

export type Prediction = { id: string; moment: Moment; title: string; detail: string };

const PROPHECY = 'Deliberately fulfilling a prophecy voids it. The Bureau is watching, loosely.';

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
  // Prophecies, appended for the rest of the weekend. Ids are append only.
  { id: 'spoon', moment: 'Tonight', title: 'Does a spoon acquire authority before dessert?', detail: PROPHECY },
  { id: 'friday', moment: 'Tomorrow', title: 'Does anyone say Friday before the Tribunal adjourns?', detail: PROPHECY },
  { id: 'smuggled', moment: 'Tonight', title: 'Is a Contraband Phrase called out correctly before midnight?', detail: PROPHECY },
  { id: 'canon', moment: 'Tomorrow', title: 'Does the Naming Rights name survive until breakfast?', detail: PROPHECY },
  { id: 'crime', moment: 'Tonight', title: 'Do two witnesses describe the same event as a crime?', detail: PROPHECY },
  { id: 'forecast', moment: 'Tomorrow', title: 'Does a Fish Weather forecast come true by morning?', detail: PROPHECY },
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
  {
    id: 'contraband',
    title: 'Contraband Run',
    moment: 'Before the Tribunal',
    detail: 'Smuggle your Classified Order phrase into real conversation. Someone who heard it confirms.',
  },
  {
    id: 'apology',
    title: 'Object Apology',
    moment: 'Anytime',
    detail: 'Deliver a twenty second formal apology to an object you used today. Your witness voices its reply.',
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

/**
 * Bureau Directives: one gnomic ruling for a deadlocked group, drawn on the
 * Today screen. Binding unless vetoed, and vetoes are free.
 */
export const DIRECTIVES: readonly string[] = [
  'Honour the second option as a hidden intention.',
  'The person who spoke least in the last hour chooses.',
  'Do the plan you would have done in 2014.',
  'Whoever holds the Gavel decides. If there is no Gavel, appoint one.',
  'Move the whole group to the room with the best lamp.',
  'Ask Kevin what he would have picked at twenty-two, then do the opposite.',
  'Somebody is tired and not saying so. The Bureau orders water and twenty minutes.',
];

export const GUARDRAILS: readonly string[] = [
  'Everything here is opt-in. Skipping is a normal move.',
  'Nothing asks for a dangerous stunt, an ocean dare, a drinking challenge, or pressure on a stranger.',
  'Teasing comes from shared history, never from private exposure.',
  'Anyone playing can void anything still open, with no points lost and no explanation owed.',
  'Spectator is a real role. You can watch the whole day and never pick a thing.',
  'The Bureau tries objects, stories and decisions. Never people.',
  'Anyone may strike anything from the record, or call a recess for themselves, no reason owed.',
  'Nothing about partners, exes, bodies, money, jobs or drinking. Nothing involving strangers, water or staff.',
];

export const isAttendee = (identity: Identity | null | undefined): identity is Attendee =>
  identity != null && identity !== 'Spectator';

export const fishById = (id: string) => FISH.find((fish) => fish.id === id) ?? null;
export const predictionById = (id: string) => PREDICTIONS.find((prediction) => prediction.id === id) ?? null;
export const bountyById = (id: string) => BOUNTIES.find((bounty) => bounty.id === id) ?? null;
