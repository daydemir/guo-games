/** @vitest-environment happy-dom */
import { beforeEach, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { STORAGE_KEY, save } from '../core/storage';
import { join } from '../core/actions';
import { emptyState } from '../core/state';

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

  await user.click(tab(/predictions/i));
  expect(screen.queryByRole('button', { name: /settle yes/i })).toBeNull();

  await user.click(tab(/^you$/i));
  await user.selectOptions(screen.getByLabelText(/switch identity/i), 'Deniz');
  await user.click(tab(/predictions/i));
  expect(screen.getAllByRole('button', { name: /settle yes/i }).length).toBeGreaterThan(0);
});

it('stops a second attendee drafting a species that is gone', async () => {
  render(<App />);
  const user = await joinAs('Kevin');
  await user.click(tab(/^draft$/i));

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

  await user.click(tab(/^you$/i));
  await user.selectOptions(screen.getByLabelText(/switch identity/i), 'Jack');
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
  await user.click(tab(/predictions/i));
  expect(screen.queryByRole('button', { name: /^yes$/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /settle yes/i })).toBeNull();
});

it('resets a device back to the seeded demo party', async () => {
  render(<App />);
  const user = await joinAs('Kevin');
  expect(localStorage.getItem(STORAGE_KEY)).toContain('Kevin');

  await user.click(tab(/^you$/i));
  await user.click(screen.getByRole('button', { name: /reset this device/i }));
  await user.click(screen.getByRole('button', { name: /yes, reset/i }));

  expect(screen.getByRole('heading', { name: /the guo games/i })).toBeTruthy();
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});
