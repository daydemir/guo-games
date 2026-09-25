import { benchCardById } from '../core/bureau';

/**
 * Where the app is, as a hash, so a Dispatch memo in the group chat can link
 * straight to a tab, a section, or a card on the Bench.
 *
 *   #picks              a tab
 *   #picks/dock-draft   a section inside it
 *   #bench              the Bench, at the current act
 *   #card/exhibit-a     the Bench, at one card
 */
export type Route = { tab: string; anchor: string | null };

const TABS = ['today', 'picks', 'bounties', 'mission', 'vault', 'dinner', 'you'];
const SECTION = /^[a-z0-9-]+$/;

export const HOME: Route = { tab: 'today', anchor: null };

/** Null for anything that is not a route, such as an in-page `#dock-draft` jump. */
export function parseHash(hash: string): Route | null {
  const [head = '', section = ''] = hash.replace(/^#\/?/, '').toLowerCase().split('/');
  if (head === 'bench') return { tab: 'bench', anchor: null };
  if (head === 'card') return benchCardById(section) ? { tab: 'bench', anchor: section } : null;
  if (!TABS.includes(head)) return null;
  return { tab: head, anchor: SECTION.test(section) ? section : null };
}

/** The hash the Bench last wrote for itself, so its own address updates are not mistaken for a tapped link. */
let benchHash = '';

/** Puts the current Bench card in the address, so a reload comes back to it. */
export function showCard(id: string): void {
  benchHash = `#card/${id}`;
  history.replaceState(null, '', benchHash);
}

/** Called when the Bench closes, so a later link to its last card is followed. */
export function forgetCard(): void {
  benchHash = '';
}

/**
 * True when a hash change is only the Bench's own write echoing back. Browsers
 * do not announce replaceState, but some test environments do, and a link that
 * points at the card already showing has nothing to do anyway.
 */
export const isBenchEcho = (hash: string): boolean => hash !== '' && hash === benchHash;
