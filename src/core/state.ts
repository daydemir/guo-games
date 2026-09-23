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
  /** The date kill switch. */
  expiresAt: z.string().default(DEFAULT_EXPIRES_AT),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  hideRankings: true,
  awards: 'stories',
  expiresAt: DEFAULT_EXPIRES_AT,
};

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

  return stateSchema.parse({
    version: STATE_VERSION,
    session: null,
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
