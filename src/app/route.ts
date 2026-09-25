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

