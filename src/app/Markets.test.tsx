/** @vitest-environment happy-dom */
import { beforeEach, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { STORAGE_KEY } from '../core/storage';

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
});

async function joinAs(who: string) {
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText(/who are you/i), who);
  await user.click(screen.getByRole('button', { name: /join the party/i }));
  return user;
}

async function switchTo(user: ReturnType<typeof userEvent.setup>, who: string) {
  await user.click(screen.getByRole('link', { name: /^you/i }));
  await user.selectOptions(screen.getByLabelText(/switch identity/i), who);
  await user.click(screen.getByRole('button', { name: /^apply$/i }));
  await user.click(screen.getByRole('link', { name: /^picks$/i }));
}

const macarena = () => screen.getByRole('heading', { name: 'Does the DJ play the Macarena?' }).closest('article')!;

it('takes a player from Today to a market, quotes the buy, and spends pretend dollars', async () => {
  render(<App />);
  const user = await joinAs('Kevin');

  expect(screen.getByRole('heading', { name: '1 open market' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: /^trade$/i }));
  expect(document.activeElement?.id).toBe('markets');
  expect(screen.getByRole('heading', { name: 'You have $100.00' })).toBeTruthy();

  const card = within(macarena());
  await user.click(card.getByRole('button', { name: /^Yes \d+¢/ }));
  await user.click(card.getByRole('button', { name: '$10' }));
  expect(card.getByText(/\$10 buys [\d.]+ Yes shares at \d+¢ each\. Pays \$[\d.]+ if Yes\./)).toBeTruthy();
  await user.click(card.getByRole('button', { name: 'Buy Yes for $10' }));

  expect(screen.getByRole('status').textContent).toMatch(/^Bought [\d.]+ Yes shares\.$/);
  expect(screen.getByRole('heading', { name: 'You have $90.00' })).toBeTruthy();
  expect(card.getByText(/You: [\d.]+ Yes, \$10\.00 in/)).toBeTruthy();
  expect(localStorage.getItem(STORAGE_KEY)).toContain('"buyer":"Kevin"');
});

it('lets a Clerk resolve only after a second tap, and pays the winners', async () => {
  render(<App />);
  const user = await joinAs('Kevin');
  await user.click(screen.getByRole('link', { name: /^picks$/i }));
  await user.click(within(macarena()).getByRole('button', { name: /^Yes \d+¢/ }));
  await user.click(within(macarena()).getByRole('button', { name: 'Buy Yes for $5' }));
  expect(within(macarena()).queryByRole('button', { name: /resolve yes/i })).toBeNull();

  await switchTo(user, 'Deniz');
  await user.click(within(macarena()).getByRole('button', { name: 'Resolve Yes' }));
  expect(screen.getByText('Resolve Yes? Winning shares pay $1.')).toBeTruthy();
  await user.click(within(macarena()).getByRole('button', { name: 'Yes, resolve Yes' }));
  expect(screen.getByRole('status').textContent).toBe('Resolved Yes.');
  expect(within(macarena()).queryByRole('button', { name: /resolve/i })).toBeNull();
  // Settled prices, as on Kalshi: a Yes share paid $1, a No share nothing.
  expect(within(macarena()).getByText('$1')).toBeTruthy();
  expect(within(macarena()).getByText('0¢')).toBeTruthy();

  await switchTo(user, 'Kevin');
  const title = screen.getByRole('heading', { name: /^You have \$/ }).textContent ?? '';
  expect(Number(title.replace(/[^\d.]/g, ''))).toBeGreaterThan(100);
  expect(within(macarena()).getByText(/Paid \$[\d.]+/)).toBeTruthy();
});

it('lets a Clerk at the desk buy for whoever is holding the phone', async () => {
  render(<App />);
  const user = await joinAs('Nick');
  await user.click(screen.getByRole('link', { name: /^picks$/i }));

  await user.selectOptions(screen.getByLabelText(/buying for/i), 'Dmitriy');
  expect(screen.getByRole('heading', { name: 'Dmitriy has $100.00' })).toBeTruthy();
  await user.click(within(macarena()).getByRole('button', { name: /^No \d+¢/ }));
  await user.click(within(macarena()).getByRole('button', { name: 'Buy No for $5' }));
  expect(screen.getByRole('status').textContent).toMatch(/^Dmitriy bought [\d.]+ No shares\.$/);
  expect(screen.getByRole('heading', { name: 'Dmitriy has $95.00' })).toBeTruthy();
});

it('opens a new market at 50 cents', async () => {
  render(<App />);
  const user = await joinAs('Jack');
  await user.click(screen.getByRole('link', { name: /^picks$/i }));

  await user.type(screen.getByLabelText(/a yes or no question/i), 'Does the cake survive the drive?');
  await user.type(screen.getByLabelText(/closes/i), 'Cake cutting');
  await user.click(screen.getByRole('button', { name: /open market/i }));

  const card = within(screen.getByRole('heading', { name: 'Does the cake survive the drive?' }).closest('article')!);
  expect(card.getByText('Open · closes Cake cutting')).toBeTruthy();
  expect(card.getByRole('button', { name: 'Yes 50¢' })).toBeTruthy();
  expect(card.getByRole('button', { name: 'No 50¢' })).toBeTruthy();
});

it('shows a spectator the prices with nothing to tap', async () => {
  render(<App />);
  const user = await joinAs('Spectator');
  await user.click(screen.getByRole('link', { name: /^picks$/i }));

  const card = within(macarena());
  expect(card.getByText(/^Yes$/)).toBeTruthy();
  expect(card.queryAllByRole('button')).toEqual([]);
  expect(screen.queryByLabelText(/a yes or no question/i)).toBeNull();
  expect(screen.queryByRole('heading', { name: /you have/i })).toBeNull();
});

it('marks a voided position as refunded, and never carries a desk choice to another identity', async () => {
  render(<App />);
  const user = await joinAs('Nick');
  await user.click(screen.getByRole('link', { name: /^picks$/i }));

  await user.selectOptions(screen.getByLabelText(/buying for/i), 'Dmitriy');
  await user.click(within(macarena()).getByRole('button', { name: /^Yes \d+¢/ }));
  await user.click(within(macarena()).getByRole('button', { name: 'Buy Yes for $5' }));
  expect(screen.getByRole('status').textContent).toMatch(/^Dmitriy bought [\d.]+ Yes shares\.$/);

  await user.click(within(macarena()).getByRole('button', { name: 'Void' }));
  await user.click(within(macarena()).getByRole('button', { name: 'Yes, void it' }));
  expect(within(macarena()).getByText(/Dmitriy: [\d.]+ Yes, \$5\.00 refunded/)).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Dmitriy has $100.00' })).toBeTruthy();

  await switchTo(user, 'Deniz');
  await switchTo(user, 'Nick');
  expect((screen.getByLabelText(/buying for/i) as HTMLSelectElement).value).toBe('Nick');
  expect(screen.getByRole('heading', { name: 'You have $100.00' })).toBeTruthy();
});
