/**
 * The Bureau of the Uncaught Fish: the fiction that carries the rest of the
 * weekend. Data only, kept apart from the rules for the same reason as
 * content.ts. Case GUO-27: a fish got away, and the Bureau suspects it had help.
 *
 * The court only ever tries objects, stories and trivial decisions. Never a
 * person. Anyone may strike anything, no reason owed.
 */
import type { Attendee } from './content';

export const CASE = 'Case GUO-27';

export const ACT_NUMBERS = [1, 2, 3, 4] as const;
export type Act = (typeof ACT_NUMBERS)[number];

export type ActInfo = {
  numeral: string;
  /** The short label on the act switch. */
  label: string;
  title: string;
  body: string;
  /** The group chat is the notification layer. `link` is the app's own address. */
  memo: (link: string) => string;
};

export const ACTS: Record<Act, ActInfo> = {
  1: {
    numeral: 'I',
    label: 'Intake',
    title: 'Intake',
    body: 'A fish got away today. The Bureau suspects it had help.',
    memo: (link) =>
      `BUREAU OF THE UNCAUGHT FISH. Memo 1. A fish got away today. ${CASE} is open. Maritime Law is in effect: no bananas at the table, no whistling indoors, nobody says Friday. Your Classified Order is under Mission: ${link}#mission. Installed it? Open it from your home screen instead. If it looks unchanged, close it fully and reopen. Twice if needed.`,
  },
  2: {
    numeral: 'II',
    label: 'Investigation',
    title: 'The Investigation',
    body: 'Evidence may be an object, a memory, or seven words about the weather.',
    memo: (link) =>
      `Memo 2. The Bureau has reason to believe the fish had help. File evidence, or forecast the next hour in exactly seven words: ${link}#today/case-file. Smuggling continues.`,
  },
  3: {
    numeral: 'III',
    label: 'Tribunal',
    title: 'The Tribunal',
    body: 'All rise. Kevin presides. People are never on trial.',
    memo: (link) =>
      `Memo 3. All rise. The Tribunal convenes at dinner. Kevin presides. Bring nothing. Your augury is due: ${link}#picks/dock-draft`,
  },
  4: {
    numeral: 'IV',
    label: 'Release',
    title: 'The Release',
    body: 'The Bureau is concluding its investigation. Nobody is in trouble. Everyone is slightly in trouble.',
    memo: (link) =>
      `Memo 4. The Bureau is concluding its investigation. Condition Report at breakfast, one word each. Seal your Treaty article before you leave: ${link}#dinner/sealed-future`,
  },
};

/* ------------------------------------------------------------ case file */

export const DOCKET_KINDS = ['incident', 'forecast', 'verdict', 'decree', 'name'] as const;
export type DocketKind = (typeof DOCKET_KINDS)[number];

export const DOCKET: Record<DocketKind, { prefix: string; label: string; placeholder: string }> = {
  incident: { prefix: 'INC', label: 'Incident Report', placeholder: '2114. Lime shortage, galley. One witness.' },
  forecast: {
    prefix: 'FWS',
    label: 'Fish Weather',
    placeholder: 'Low snack pressure. Cooler front from lanai.',
  },
  verdict: { prefix: 'VER', label: 'Verdict', placeholder: 'Exhibit A ruled Authentic, 4 to 2.' },
  decree: { prefix: 'DEC', label: 'Decree', placeholder: 'The cooler may speak once per hour.' },
  name: { prefix: 'NAM', label: 'Name', placeholder: 'The chair is henceforth Admiral Cushion.' },
};

/** What anyone can file from Today. The rest are filed from the Bench. */
export const PUBLIC_KINDS: readonly DocketKind[] = ['incident', 'forecast'];

export const FORECAST_WORDS = 7;
export const MAX_DOCKET_CHARS = 140;
export const MAX_DOCKET = 80;

/* -------------------------------------------------------- seven witnesses */

/** Handed out in order as the phone goes round. Author names are never shown. */
export const WITNESS_ROLES = [
  'Insurance Adjuster',
  'Marine Biologist',
  'Lighthouse Keeper',
  'Customs Officer',
  'Harbor Poet',
  'Sports Commentator',
  'Victorian Ghost',
] as const;
export type WitnessRole = (typeof WITNESS_ROLES)[number];

export const MAX_SUBJECT_CHARS = 80;
export const MAX_TESTIMONY_CHARS = 120;

/* -------------------------------------------------------- classified orders */

/** One Contraband Phrase each, readable only on the phone signed in as its owner. */
export const CONTRABAND: Record<Attendee, string> = {
  Kevin: 'the mahi recognizes no maritime jurisdiction',
  Deniz: 'I would like that entered into the record',
  Nick: 'respectfully, the tide disagrees',
  Jack: 'that is a very pelagic take',
  Simon: 'we should consult the fish',
  Nate: 'I have concerns about the provenance',
  Dmitriy: 'that is above my pay grade as a deckhand',
};

/* -------------------------------------------------------------- the bench */

/**
 * One card at a time on the Bench phone, read aloud by a Clerk. A card is a
 * script plus at most one or two optional pieces:
 * - `vote`: a show of hands the Clerk taps in, then enters as a verdict.
 * - `file`: a line the Clerk writes into the Case File.
 * - `show`: something read off this phone, such as the auguries or the docket.
 * - `link`: a jump to the part of the app that already does the job.
 */
export type BenchCard = {
  id: string;
  act: Act;
  title: string;
  lines: readonly string[];
  vote?: { a: string; b: string; verdict: string };
  file?: DocketKind;
  show?: 'oracle' | 'incidents' | 'forecasts' | 'testimony' | 'reveal';
  link?: { label: string; tab: string; anchor?: string };
};

export const BENCH_CARDS: readonly BenchCard[] = [
  // Act I. Intake: boat downtime, the dock, arriving at the lodging.
  {
    id: 'intake-open',
    act: 1,
    title: `${CASE} is open`,
    lines: [
      'The Bureau of the Uncaught Fish is now in session.',
      'Today, a fish got away. The Bureau intends to find out what else did.',
      'Kevin presides. He is never on trial.',
      'Anything can be filed. Anything can be struck. No reason owed.',
    ],
  },
  {
    id: 'maritime-law',
    act: 1,
    title: 'Maritime Law is in effect',
    lines: [
      'No bananas at the table. No whistling indoors. Nobody says Friday.',
      'Violators touch wood and compliment the vessel. Fines are forgiven on the spot.',
      'The vessel is whatever room you are in.',
      'Staff are exempt, and are never told.',
    ],
  },
  {
    id: 'oracle',
    act: 1,
    title: 'The Fish Have Spoken',
    lines: ['Each deputy reads their augury aloud, then forgets it.'],
    show: 'oracle',
  },
  {
    id: 'declaration',
    act: 1,
    title: 'Form 27-B: Declaration of Goods',
    lines: [
      'Declare one opinion you are bringing to dinner. A take, not a secret.',
      'The Clerk stamps it Approved or Held for Inspection. Held items must be raised at the Tribunal.',
      'Declining to declare is itself a declaration. It is accepted.',
    ],
  },
  {
    id: 'orders',
    act: 1,
    title: 'Classified Orders issued',
    lines: [
      'Everyone has a Contraband Phrase under Mission.',
      'Call Contraband once. If right, the smuggler explains its provenance for twenty seconds. If wrong, compliment the vessel.',
    ],
  },

  // Act II. The Investigation: lodging downtime, transit, the bar, pre-dinner.
  {
    id: 'investigation-open',
    act: 2,
    title: 'The Investigation',
    lines: [
      'The Bureau has reason to believe the fish had help.',
      'Evidence may be an object, a memory, or seven words about the weather.',
      'Nobody is a suspect. Everything is a clue.',
    ],
  },
  {
    id: 'fish-weather',
    act: 2,
    title: 'Fish Weather Service',
    lines: [
      'Forecast the next hour in exactly seven words.',
      'Weather concerns objects, rooms and snacks. Never bodies, drinking or feelings.',
    ],
    file: 'forecast',
  },
  {
    id: 'witness',
    act: 2,
    title: 'Seven Witnesses',
    lines: [
      'The Clerk names one small thing that just happened to an object: the cooler lid, a sandal, the door. The phone goes round.',
      'Each witness testifies in character, sealed. Nobody reads ahead.',
      'Testimony is read at the Tribunal, with no names attached.',
    ],
    show: 'testimony',
  },
  {
    id: 'exhibit-a',
    act: 2,
    title: 'Exhibit A',
    lines: [
      `Present one object from your pocket as evidence in ${CASE}. Twenty seconds of provenance.`,
      'Nothing sharp, nothing borrowed, nothing that belongs to the building.',
    ],
    vote: { a: 'Authentic', b: 'Forgery', verdict: 'Exhibit A ruled {winner}, {a} to {b}.' },
  },

  // Act III. The Tribunal, the peak: dinner and the night.
  {
    id: 'tribunal-open',
    act: 3,
    title: 'All rise',
    lines: [
      'Kevin presides as Chief Justice.',
      'He appoints an ordinary object as the Gavel. Whoever holds it may issue one Decree, then must pass it on.',
      'Never sand, rock, coral, or anything sharp.',
    ],
    file: 'decree',
  },
  {
    id: 'docket-reading',
    act: 3,
    title: 'The Docket',
    lines: ['The Clerk reads each Incident Report in the flattest voice available.'],
    show: 'incidents',
  },
  {
    id: 'weather-report',
    act: 3,
    title: 'The Weather, Reviewed',
    lines: ['The Clerk reads each forecast. The Gallery murmurs whether it came true.'],
    show: 'forecasts',
  },
  {
    id: 'witness-reveal',
    act: 3,
    title: 'The Testimony',
    lines: ['The Clerk reads each sworn account aloud. Authors are never named.'],
    show: 'reveal',
  },
  {
    id: 'sworn-testimony',
    act: 3,
    title: 'True or Fish',
    lines: [
      'One deputy tells a short story about themselves. It is either true or a fish story.',
      'Your own story only.',
    ],
    vote: { a: 'True', b: 'Fish', verdict: 'Sworn testimony ruled {winner}, {a} to {b}.' },
  },
  {
    id: 'object-trial',
    act: 3,
    title: 'The Fish Court',
    lines: [
      'An object stands accused: the cooler, a sandal, the speaker, the last lime.',
      'Appoint a Prosecutor, a Defender, and an Expert Fish, who may only answer yes, no, or blub.',
      'Ninety seconds, then the Gallery rules.',
      'Whatever the verdict, the Prosecutor apologises to the object for twenty seconds.',
    ],
    vote: { a: 'Guilty', b: 'Innocent', verdict: 'The accused object was found {winner}, {a} to {b}.' },
  },
  {
    id: 'naming-rights',
    act: 3,
    title: 'Naming Rights',
    lines: [
      'The Bureau auctions the naming rights to one nearby object: a chair, the cooler, a cloud.',
      'Bid with nothing. Loudest bid wins. The name is canon until the case closes.',
    ],
    file: 'name',
  },
  {
    id: 'retcon',
    act: 3,
    title: 'The Retcon',
    lines: [
      'Once tonight, a deputy formally amends something that already happened.',
      'Begin: Let the record show that, in fact...',
    ],
    vote: { a: 'Ratified', b: 'Rejected', verdict: 'The Retcon was {winner}, {a} to {b}.' },
  },
  {
    id: 'evidence',
    act: 3,
    title: 'Evidence After the Fact',
    lines: [
      'Category: proof of an aquatic coup.',
      'Nominate a photo already on your phone, or describe something you saw. Description counts in full. Nobody has to show anything.',
    ],
  },
  {
    id: 'to-dinner',
    act: 3,
    title: 'Stories from the vault',
    lines: ['The Tribunal turns to the vault and the award cards.'],
    link: { label: 'Open Dinner', tab: 'dinner' },
  },

  // Act IV. The Release: the last morning, checkout, transit, aftermath.
  {
    id: 'release-open',
    act: 4,
    title: 'The Release',
    lines: [
      'The Bureau is concluding its investigation.',
      'Nobody is in trouble. Everyone is slightly in trouble.',
    ],
  },
  {
    id: 'condition-report',
    act: 4,
    title: 'Condition Report',
    lines: [
      'Each deputy gives the condition of the vessel in one word. Kevin answers as the vessel.',
      'Tired is allowed. So is seaworthy.',
    ],
  },
  {
    id: 'inquiry',
    act: 4,
    title: 'Board of Inquiry',
    lines: [
      'Each witness enters one finding about last night into the record, concerning an object, a room, or the fish.',
      'Findings are final and entirely false. Nobody is named. Nothing you would not say in front of Kevin’s family.',
    ],
  },
  {
    id: 'treaty',
    act: 4,
    title: 'Treaty of Departure',
    lines: ['Seal a note beginning: Article __: The Republic of Guo hereby resolves that...'],
    link: { label: 'Open sealed notes', tab: 'dinner', anchor: 'sealed-future' },
  },
  {
    id: 'recommission',
    act: 4,
    title: 'The Re-Commissioning',
    lines: [
      'Kevin writes his current title on a scrap of paper.',
      'The crew recites: We ask that the records strike the vessel known as Kevin, Unmarried. Henceforth enter him as ____.',
      'The paper goes in a trash can. Never the water.',
    ],
    file: 'name',
  },
  {
    id: 'release',
    act: 4,
    title: 'Case closed',
    lines: [
      `The Bureau releases ${CASE}, unharmed, as all good anglers do.`,
      'Clerk: export a backup before anyone leaves. That file is the only copy.',
      'The Bureau will reconvene in five years. Please retain this notice.',
    ],
    link: { label: 'Export backup', tab: 'you' },
  },
];

export const benchDeck = (act: Act): BenchCard[] => BENCH_CARDS.filter((card) => card.act === act);
export const benchCardById = (id: string): BenchCard | null => BENCH_CARDS.find((card) => card.id === id) ?? null;
