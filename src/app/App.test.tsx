/** @vitest-environment happy-dom */
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { STORAGE_KEY, save } from '../core/storage';
import { join } from '../core/actions';
import { emptyState } from '../core/state';
import { readBackup, writeBackup } from '../core/backup';

beforeEach(() => localStorage.clear());

async function joinAs(who: string, code = 'GUO27') {
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText(/party code/i));
  await user.type(screen.getByLabelText(/party code/i), code);
  await user.selectOptions(screen.getByLabelText(/who are you/i), who);
  await user.click(screen.getByRole('button', { name: /join the party/i }));
  return user;
}

const tab = (name: RegExp) => screen.getByRole('link', { name });

it('prefills the demo party code so joining is a name and one tap', async () => {
  render(<App />);
  expect(screen.getByLabelText(/party code/i)).toHaveProperty('value', 'GUO27');
});

it('opens on the join screen and lands an attendee on their one next action', async () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /the guo games/i })).toBeTruthy();

  await joinAs('Kevin');

  expect(screen.getByRole('heading', { name: /call one thing/i })).toBeTruthy();
});

it('explains a wrong party code instead of failing silently', async () => {
  render(<App />);
  await joinAs('Kevin', 'NOPE');

  expect(screen.getByRole('alert').textContent).toMatch(/party code/i);
  expect(screen.queryByRole('heading', { name: /call one thing/i })).toBeNull();
});

it('shows settle controls to an organizer and hides them from everyone else', async () => {
  render(<App />);
  const user = await joinAs('Kevin');

  await user.click(tab(/^picks$/i));
  expect(screen.queryByRole('button', { name: /settle yes/i })).toBeNull();

  await user.click(tab(/^you/i));
  await user.selectOptions(screen.getByLabelText(/switch identity/i), 'Deniz');
  await user.click(screen.getByRole('button', { name: /^apply$/i }));
  await user.click(tab(/^picks$/i));
  expect(screen.getAllByRole('button', { name: /settle yes/i }).length).toBeGreaterThan(0);
});

it('stops a second attendee drafting a species that is gone', async () => {
  render(<App />);
  const user = await joinAs('Kevin');
  await user.click(tab(/^picks$/i));

  const board = screen.getByRole('list', { name: /dock draft board/i });
  const taken = within(board).getByRole('button', { name: /^Ono/i });
  expect(taken.hasAttribute('disabled')).toBe(true);
  expect(within(board).getByText('Nick')).toBeTruthy();
});

it('keeps a private mission on the phone that owns it', async () => {
  render(<App />);
  const user = await joinAs('Kevin');

  await user.click(tab(/^mission$/i));
  await user.click(screen.getByRole('button', { name: /show my mission/i }));
  const mine = screen.getByTestId('mission-text').textContent ?? '';
  expect(mine.length).toBeGreaterThan(10);

  await user.click(tab(/^you/i));
  await user.selectOptions(screen.getByLabelText(/switch identity/i), 'Jack');
  await user.click(screen.getByRole('button', { name: /^apply$/i }));
  await user.click(tab(/^mission$/i));
  expect(screen.queryByText(mine)).toBeNull();

  await user.click(screen.getByRole('button', { name: /show my mission/i }));
  expect(screen.getByTestId('mission-text').textContent).not.toBe(mine);
});

it('turns the whole app read-only once the closing date has passed', async () => {
  const closed = join(emptyState(), 'GUO27', 'Deniz', 'Deniz', 'sea');
  closed.settings.expiresAt = '2020-01-01T00:00:00Z';
  save(localStorage, closed);

  render(<App />);
  expect(screen.getByRole('status').textContent).toMatch(/read-only recap/i);

  const user = userEvent.setup();
  await user.click(tab(/^picks$/i));
  expect(screen.queryByRole('button', { name: /^yes$/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /settle yes/i })).toBeNull();
});

it('resets a device back to the seeded demo party', async () => {
  render(<App />);
  const user = await joinAs('Kevin');
  expect(localStorage.getItem(STORAGE_KEY)).toContain('Kevin');

  await user.click(tab(/^you/i));
  await user.click(screen.getByRole('button', { name: /reset this device/i }));
  await user.click(screen.getByRole('button', { name: /yes, reset/i }));

  expect(screen.getByRole('heading', { name: /the guo games/i })).toBeTruthy();
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});

it('switching identity needs a deliberate apply and never carries one person\'s name to another', async () => {
  render(<App />);
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText(/party code/i));
  await user.type(screen.getByLabelText(/party code/i), 'GUO27');
  await user.selectOptions(screen.getByLabelText(/who are you/i), 'Kevin');
  await user.type(screen.getByLabelText(/name on your cards/i), 'Kev');
  await user.click(screen.getByRole('button', { name: /join the party/i }));

  await user.click(tab(/^you/i));
  await user.selectOptions(screen.getByLabelText(/switch identity/i), 'Jack');
  // Nothing has happened yet: the roster select alone must not switch anyone.
  expect(screen.getByText(/^Playing as Kevin\./)).toBeTruthy();

  await user.click(screen.getByRole('button', { name: /^apply$/i }));
  expect(screen.getByText(/^Playing as Jack\./)).toBeTruthy();
  expect(screen.getByLabelText(/name on your cards/i)).toHaveProperty('value', 'Jack');
  expect(screen.getByRole('link', { name: /you: jack/i })).toBeTruthy();

  // Switching back restores nothing by magic, but a typed name is kept.
  await user.selectOptions(screen.getByLabelText(/switch identity/i), 'Kevin');
  await user.type(screen.getByLabelText(/name on your cards/i), 'Kev');
  await user.click(screen.getByRole('button', { name: /^apply$/i }));
  expect(screen.getByRole('link', { name: /you: kev$/i })).toBeTruthy();
});

it('refuses to write over an unreadable save and offers a way out', async () => {
  localStorage.setItem(STORAGE_KEY, '{{{ not json');
  render(<App />);

  // The warning survives mount rather than being dismissed before paint.
  expect(screen.getByRole('alert').textContent).toMatch(/could not be read/i);
  expect(screen.queryByLabelText(/party code/i)).toBeNull();

  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /delete and start fresh/i }));

  expect(screen.getByLabelText(/party code/i)).toBeTruthy();
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});

it('leaves the unreadable bytes on the device until the player resolves them', async () => {
  localStorage.setItem(STORAGE_KEY, '{{{ not json');
  render(<App />);

  const written: Blob[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    written.push(blob as Blob);
    return 'blob:stub';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /download the unreadable save/i }));

  // The rescue has to be the bytes as found, not a tidy export of the empty
  // party the app fell back to rendering.
  expect(await written[0].text()).toBe('{{{ not json');
  expect(localStorage.getItem(STORAGE_KEY)).toBe('{{{ not json');
  vi.restoreAllMocks();
});

it('restores a backup file over an unreadable save', async () => {
  const good = join(emptyState(), 'GUO27', 'Simon', 'Si', 'palm');
  const backup = writeBackup(good);
  localStorage.setItem(STORAGE_KEY, 'corrupt');
  render(<App />);

  const user = userEvent.setup();
  await user.upload(
    screen.getByLabelText(/backup file/i),
    new File([backup], 'guo-games-backup.json', { type: 'application/json' }),
  );

  expect(await screen.findByRole('heading', { name: /today/i })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /delete and start fresh/i })).toBeNull();
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).session).toMatchObject({
    attendee: 'Simon',
    name: 'Si',
  });
});

it('exports a backup file that reads straight back in', async () => {
  render(<App />);
  const user = await joinAs('Kevin');
  await user.click(tab(/^you/i));

  const written: Blob[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    written.push(blob as Blob);
    return 'blob:stub';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  await user.click(screen.getByRole('button', { name: /export a backup file/i }));

  expect(written).toHaveLength(1);
  const restored = readBackup(await written[0].text());
  expect(restored.session?.attendee).toBe('Kevin');
  vi.restoreAllMocks();
});

it('explains an unusable closing date instead of throwing', async () => {
  render(<App />);
  const user = await joinAs('Deniz');
  await user.click(tab(/^you/i));

  await user.clear(screen.getByLabelText(/closing date/i));
  await user.click(screen.getByRole('button', { name: /move the closing date/i }));

  expect(screen.getByRole('alert').textContent).toMatch(/full date and time/i);
});

it('shows why a bad backup file was refused, on the recovery screen itself', async () => {
  localStorage.setItem(STORAGE_KEY, 'corrupt');
  render(<App />);

  const user = userEvent.setup();
  await user.upload(
    screen.getByLabelText(/backup file/i),
    new File(['{"app":"not-guo-games"}'], 'wrong.json', { type: 'application/json' }),
  );

  expect((await screen.findByRole('alert')).textContent).toMatch(/not a Guo Games backup/i);
  expect(localStorage.getItem(STORAGE_KEY)).toBe('corrupt');
});

it('refuses an incomplete backup without touching what is already saved', async () => {
  const user = userEvent.setup();
  render(<App />);
  await joinAs('Kevin');
  const before = localStorage.getItem(STORAGE_KEY)!;

  await user.click(tab(/^you/i));
  await user.upload(
    screen.getByLabelText(/restore from a backup/i),
    new File([JSON.stringify({ app: 'guo-games', party: { version: 3 } })], 'truncated.json', {
      type: 'application/json',
    }),
  );

  expect((await screen.findByRole('alert')).textContent).toMatch(/incomplete/i);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  expect(screen.getByText(/^Playing as Kevin\./)).toBeTruthy();
});

it('settles the name field after Apply so the form stops looking unsaved', async () => {
  render(<App />);
  const user = await joinAs('Kevin');
  await user.click(tab(/^you/i));

  // An empty name falls back to the identity, which is what gets submitted.
  await user.clear(screen.getByLabelText(/name on your cards/i));
  const apply = () => screen.getByRole('button', { name: /^apply$/i }) as HTMLButtonElement;
  expect(apply().disabled).toBe(false);

  await user.click(apply());

  expect(screen.getByLabelText(/name on your cards/i)).toHaveProperty('value', 'Kevin');
  expect(apply().disabled).toBe(true);
  expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull();
});

it('does not offer a spectator a void control they cannot use', async () => {
  render(<App />);
  const user = await joinAs('Spectator');
  await user.click(tab(/^picks$/i));

  expect(screen.queryByRole('button', { name: /^void$/i })).toBeNull();
});

it('offers void on an open prediction but not on a settled one, for a plain attendee', async () => {
  render(<App />);
  const user = await joinAs('Jack');
  await user.click(tab(/^picks$/i));

  // The seeded demo has flights already settled and the rest still open.
  expect(screen.getAllByRole('button', { name: /^void$/i }).length).toBeGreaterThan(0);

  const settled = screen.getByText('Does the whole crew land before sunset?').closest('article')!;
  expect(within(settled).queryByRole('button', { name: /^void$/i })).toBeNull();
});

it('fits the day into six tabs, with You reached from the name in the masthead', async () => {
  render(<App />);
  const user = await joinAs('Kevin');

  const nav = screen.getByRole('navigation', { name: /sections/i });
  expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual([
    'Today',
    'Picks',
    'Bounties',
    'Mission',
    'Vault',
    'Dinner',
  ]);

  await user.click(screen.getByRole('link', { name: /you: kevin/i }));
  expect(screen.getByRole('heading', { name: /^you$/i })).toBeTruthy();
});

it('shows the shared feed on Today, and the rest of it on request', async () => {
  render(<App />);
  const user = await joinAs('Kevin');

  const feed = () => within(screen.getByRole('region', { name: /feed/i })).getAllByRole('listitem');
  expect(feed()).toHaveLength(5);
  await user.click(screen.getByRole('button', { name: /show all/i }));
  expect(feed().length).toBeGreaterThan(5);
});

it('gives a spectator the boards to watch but no controls that would only be refused', async () => {
  render(<App />);
  const user = await joinAs('Spectator');

  expect(screen.queryByRole('button', { name: /take me there/i })).toBeNull();
  await user.click(tab(/^picks$/i));
  expect(screen.queryByRole('button', { name: /^yes$/i })).toBeNull();
  expect(screen.getByRole('list', { name: /dock draft board/i })).toBeTruthy();
});

it('lets an organizer read a vault story out from the Dinner tab, for everyone to see', async () => {
  render(<App />);
  const user = await joinAs('Deniz');

  await user.click(tab(/^dinner$/i));
  await user.click(screen.getByRole('button', { name: /open dinner/i }));
  const [first] = screen.getAllByRole('button', { name: /read this out/i });
  await user.click(first);
  expect(screen.getAllByRole('heading', { name: /read out at dinner/i })).toHaveLength(1);

  await user.click(tab(/^you/i));
  await user.selectOptions(screen.getByLabelText(/switch identity/i), 'Jack');
  await user.click(screen.getByRole('button', { name: /^apply$/i }));
  await user.click(tab(/^dinner$/i));
  expect(screen.getAllByRole('heading', { name: /read out at dinner/i })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: /read this out/i })).toBeNull();
});

it('keeps a sealed note on screen when sealing it is refused', async () => {
  render(<App />);
  const user = await joinAs('Kevin');
  await user.click(tab(/^dinner$/i));

  await user.type(screen.getByLabelText(/five years from now/i), '   ');
  await user.click(screen.getByRole('button', { name: /seal it/i }));

  expect(screen.getByRole('alert').textContent).toMatch(/1 to 300/);
  expect(screen.getByLabelText(/five years from now/i)).toHaveProperty('value', '   ');
});

it('takes "Draft a fish" straight to the Dock Draft, not the top of Picks', async () => {
  render(<App />);
  const user = await joinAs('Kevin');
  await user.click(screen.getByRole('button', { name: /take me there/i }));
  const [yes] = screen.getAllByRole('button', { name: /^yes$/i });
  await user.click(yes);

  await user.click(tab(/^today$/i));
  expect(screen.getByRole('heading', { name: /draft a fish/i })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: /take me there/i }));
  expect(document.activeElement?.textContent).toBe('Dock Draft');
});
