import { z } from 'zod';
import {
  ATTENDEES,
  BOUNTIES,
  COLORS,
  DEFAULT_EXPIRES_AT,
  FISH,
  MAX_FUTURE_CHARS,
  MAX_NAME_CHARS,
  MAX_STORY_CHARS,
  MOMENTS,
  PREDICTIONS,
} from './content';
import { mediaSchema } from './media';
import { BUY_DOLLARS, MAX_CLOSES_CHARS, MAX_QUESTION_CHARS, sharesFor } from './market';
import {
  ACT_NUMBERS,
  DOCKET_KINDS,
  MAX_DOCKET_CHARS,
  MAX_SUBJECT_CHARS,
  MAX_TESTIMONY_CHARS,
  WITNESS_ROLES,
} from './bureau';

export const STATE_VERSION = 3;

const attendee = z.enum(ATTENDEES);
const identity = z.enum([...ATTENDEES, 'Spectator']);
const fishId = z.enum(FISH.map((fish) => fish.id) as [string, ...string[]]);
const predictionId = z.enum(PREDICTIONS.map((prediction) => prediction.id) as [string, ...string[]]);
const bountyId = z.enum(BOUNTIES.map((bounty) => bounty.id) as [string, ...string[]]);

export const sessionSchema = z.object({
  attendee: identity,
  name: z.string().trim().min(1).max(MAX_NAME_CHARS),
  color: z.enum(COLORS),
});
export type Session = z.infer<typeof sessionSchema>;

export const memorySchema = z.object({
  id: z.string(),
  at: z.number(),
  author: attendee,
  about: attendee,
  moment: z.enum(MOMENTS),
  text: z.string().max(MAX_STORY_CHARS),
  media: mediaSchema.nullable(),
  revealed: z.boolean(),
});
export type Memory = z.infer<typeof memorySchema>;

/**
 * One line in the shared activity feed. Only ever holds public facts: private
 * mission text, vault stories and sealed notes never reach it.
 */
export const feedEventSchema = z.object({
  id: z.string(),
  at: z.number(),
  actor: identity,
  text: z.string(),
});
export type FeedEvent = z.infer<typeof feedEventSchema>;

export const settingsSchema = z.object({
  /** Standings stay sealed until dinner unless an organizer opens them early. */
  hideRankings: z.boolean().default(true),
  awards: z.enum(['stories', 'points']).default('stories'),
  /**
   * The date kill switch. A value that does not parse would compare as NaN and
   * leave the trip open forever, so it makes the save unreadable instead.
   */
  expiresAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)))
    .default(DEFAULT_EXPIRES_AT),
  /** Which act of the Bureau is running. Set by hand, because the schedule is not known. */
  act: z.union(ACT_NUMBERS.map((act) => z.literal(act))).default(1),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  hideRankings: true,
  awards: 'stories',
  expiresAt: DEFAULT_EXPIRES_AT,
  act: 1,
};

/**
 * One line in the Case File. Public on the phone it was filed on, and struck
 * outright rather than hidden, so a struck line exists nowhere in the save.
 */
export const docketEntrySchema = z.object({
  id: z.string(),
  at: z.number(),
  author: attendee,
  seq: z.number().int().positive(),
  kind: z.enum(DOCKET_KINDS),
  text: z.string().min(1).max(MAX_DOCKET_CHARS),
});
export type DocketEntry = z.infer<typeof docketEntrySchema>;

/**
 * Seven Witnesses: sealed accounts of one small event, passed round the Bench
 * phone. Nothing stored links a name to an account, so neither the save nor a
 * backup can unseal it:
 * - `entries` hold only a random role and the words, kept in role order rather
 *   than the order sworn, with no author and no timestamp.
 * - `sworn` is who has testified, in roster order, only so nobody testifies
 *   twice. It is emptied at the reveal, when nobody can testify any more.
 */
const testimonyShape = z.object({
  subject: z.string().min(1).max(MAX_SUBJECT_CHARS),
  revealed: z.boolean(),
  sworn: z.array(attendee).default([]),
  entries: z.array(
    z.object({
      id: z.string(),
      role: z.enum(WITNESS_ROLES),
      text: z.string().min(1).max(MAX_TESTIMONY_CHARS),
    }),
  ),
});

export const testimonySchema = testimonyShape;

/**
 * The branch's first build kept each account's author, under a role picked from
 * a hash of that author's name and the event, so the role alone could name its
 * writer. Such a round, recognised by having no `sworn` roll, is made safe:
 * - not yet read out: dropped. Its roles cannot be fixed without changing what
 *   the witnesses were told, and they can simply testify again.
 * - already read out: kept, with authors and timestamps gone and roles dealt
 *   again in the alphabetical order of the words, which says nothing about who
 *   wrote them.
 */
function migrateTestimony(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || 'sworn' in value) return value;
  const round = value as { revealed?: unknown; entries?: unknown };
  if (!round.revealed || !Array.isArray(round.entries)) return null;
  const entries = (round.entries as { id?: unknown; text?: unknown }[])
    .map(({ id, text }) => ({ id, text }))
    .sort((a, b) => String(a.text).localeCompare(String(b.text)))
    .map((entry, index) => ({ ...entry, role: WITNESS_ROLES[index] }));
  return { ...round, sworn: [], entries };
}
export type Testimony = z.infer<typeof testimonySchema>;

/** A Wedding Market: one yes or no question, resolved by a Clerk. */
export const marketSchema = z
  .object({
    id: z.string(),
    at: z.number(),
    creator: attendee,
    question: z.string().min(1).max(MAX_QUESTION_CHARS),
    closes: z.string().max(MAX_CLOSES_CHARS),
    status: z.enum(['open', 'closed', 'resolved', 'void']),
    outcome: z.enum(['yes', 'no']).optional(),
  })
  .refine((market) => (market.status === 'resolved') === (market.outcome !== undefined), 'Only a resolved market has an outcome.');
export type Market = z.infer<typeof marketSchema>;

/**
 * One buy, in pretend cents. Trades are never edited: prices and every balance
 * are worked out from them, so a resolution pays out exactly once, by
 * construction, and there is no second ledger to drift.
 */
export const tradeSchema = z.object({
  id: z.string(),
  at: z.number(),
  market: z.string(),
  buyer: attendee,
  side: z.enum(['yes', 'no']),
  cents: z.union(BUY_DOLLARS.map((amount) => z.literal(amount * 100))),
  shares: z.number().positive(),
});
export type Trade = z.infer<typeof tradeSchema>;

export const stateSchema = z.object({
  version: z.literal(STATE_VERSION),
  session: sessionSchema.nullable().default(null),
  settings: settingsSchema.default(DEFAULT_SETTINGS),
  dinner: z.boolean().default(false),
  picks: z.partialRecord(attendee, z.partialRecord(predictionId, z.enum(['yes', 'no']))).default({}),
  results: z.partialRecord(predictionId, z.enum(['yes', 'no', 'void'])).default({}),
  draft: z.partialRecord(attendee, fishId).default({}),
  bounties: z
    .partialRecord(
      bountyId,
      z.object({
        owner: attendee,
        status: z.enum(['claimed', 'confirmed', 'void']),
        witness: attendee.optional(),
      }),
    )
    .default({}),
  missions: z.partialRecord(attendee, z.enum(['accepted', 'done', 'void'])).default({}),
  vault: z.array(memorySchema).default([]),
  future: z.partialRecord(attendee, z.string().max(MAX_FUTURE_CHARS)).default({}),
  feed: z.array(feedEventSchema).default([]),
  // Added for the Bureau without a version bump: every field defaults, so an
  // older save opens as-is and an older build simply strips these keys.
  docket: z.array(docketEntrySchema).default([]),
  /** Case numbers only go up, so a struck number is never handed out again. */
  docketSeq: z.number().int().nonnegative().default(0),
  testimony: z.preprocess(migrateTestimony, testimonySchema.nullable()).default(null),
  markets: z.array(marketSchema).default([]),
  trades: z.array(tradeSchema).default([]),
});

export type State = z.infer<typeof stateSchema>;

/** A party with nothing in it. The starting point for tests and for a reset. */
export function emptyState(): State {
  return stateSchema.parse({ version: STATE_VERSION });
}

/**
 * The first-run party. A public deployment has to be understandable in about
 * ten seconds, so a visitor lands in a day that is already half in motion:
 * other people have picked, drafted and confirmed, and the vault is filling up.
 *
 * Kevin and Deniz are deliberately left untouched, so whoever joins as an
 * attendee or as an organizer still walks the whole loop from the beginning.
 */
export function demoState(now: number = Date.now()): State {
  const minutes = (count: number) => now - count * 60_000;
  let counter = 0;
  const id = () => `demo-${(counter += 1)}`;

  const feed = [
    { at: minutes(4), actor: 'Nate', text: 'Nate confirmed Small Thanks for Simon.' },
    { at: minutes(11), actor: 'Simon', text: 'Simon claimed a bounty: Small Thanks.' },
    { at: minutes(23), actor: 'Dmitriy', text: 'Dmitriy added a memory to the vault.' },
    { at: minutes(38), actor: 'Jack', text: 'Jack drafted Marlin.' },
    { at: minutes(52), actor: 'Nick', text: 'Nick settled Does the whole crew land before sunset? as yes.' },
    { at: minutes(74), actor: 'Simon', text: 'Simon took a side on: Do at least three people fall asleep before 6pm?' },
    { at: minutes(96), actor: 'Nate', text: 'Nate took on a quiet mission.' },
    { at: minutes(140), actor: 'Jack', text: 'Jack joined the party.' },
  ].map((event) => ({ id: id(), ...event }));

  const vault = [
    {
      id: id(),
      at: minutes(23),
      author: 'Dmitriy',
      about: 'Kevin',
      moment: 'Before Maui',
      text: 'The year Kevin insisted the shortcut was faster. It was not, and we still talk about it.',
      media: null,
      revealed: false,
    },
    {
      id: id(),
      at: minutes(88),
      author: 'Simon',
      about: 'Kevin',
      moment: 'Downtime',
      text: 'He once spent a whole afternoon teaching a stranger to play cribbage, and never mentioned it again.',
      media: null,
      revealed: false,
    },
    {
      id: id(),
      at: minutes(160),
      author: 'Nate',
      about: 'Nick',
      moment: 'Flights',
      text: 'Nick packed a spare charger for everyone. Nobody asked him to.',
      media: null,
      revealed: false,
    },
  ];

  // One live market, already trading, so the price has moved off 50 cents.
  const market = id();
  const firstBuy = sharesFor({ yes: 0, no: 0 }, 'yes', 10);
  const trades = [
    { id: id(), at: minutes(30), market, buyer: 'Simon', side: 'yes', cents: 1000, shares: firstBuy },
    { id: id(), at: minutes(18), market, buyer: 'Jack', side: 'no', cents: 500, shares: sharesFor({ yes: firstBuy, no: 0 }, 'no', 5) },
  ];

  return stateSchema.parse({
    version: STATE_VERSION,
    session: null,
    markets: [{ id: market, at: minutes(45), creator: 'Nick', question: 'Does the DJ play the Macarena?', closes: 'Last song', status: 'open' }],
    trades,
    picks: {
      Nick: { flights: 'yes', fishing: 'yes' },
      Jack: { flights: 'yes', nap: 'no', dinner: 'yes' },
      Simon: { nap: 'yes', firstfish: 'no' },
      Nate: { flights: 'no', story: 'yes' },
      Dmitriy: { dinner: 'yes' },
    },
    results: { flights: 'yes' },
    draft: { Nick: 'ono', Jack: 'marlin', Simon: 'ahi', Nate: 'uku', Dmitriy: 'aku' },
    bounties: {
      gratitude: { owner: 'Simon', status: 'confirmed', witness: 'Nate' },
      frame: { owner: 'Dmitriy', status: 'claimed' },
    },
    missions: { Nate: 'accepted', Simon: 'done' },
    vault,
    future: { Nate: 'Kevin will still be the one who books the boat.' },
    feed,
  });
}
