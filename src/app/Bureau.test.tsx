/** @vitest-environment happy-dom */
import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { useWakeLock } from './useWakeLock';
import { STORAGE_KEY } from '../core/storage';
import { CONTRABAND } from '../core/bureau';

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
}

const cardTitle = () => screen.getByRole('heading', { level: 2 }).textContent;
const saved = () => localStorage.getItem(STORAGE_KEY) ?? '';

it('keeps a card link from the group chat through the join, and opens the Bench there', async () => {
  history.replaceState(null, '', '/#card/exhibit-a');
  render(<App />);
  await joinAs('Deniz');

  expect(screen.getByRole('heading', { level: 1, name: 'The Bench' })).toBeTruthy();
  expect(cardTitle()).toBe('Exhibit A');
  expect(screen.getByText(/Card \d of \d · Act II/)).toBeTruthy();
});

it('lets a Clerk tap in a show of hands and enter the verdict into the Case File', async () => {
  history.replaceState(null, '', '/#card/exhibit-a');
  render(<App />);
  const user = await joinAs('Deniz');

  const hands = screen.getByRole('group', { name: /show of hands/i });
  for (let i = 0; i < 4; i += 1) await user.click(within(hands).getByRole('button', { name: /authentic/i }));
  for (let i = 0; i < 2; i += 1) await user.click(within(hands).getByRole('button', { name: /forgery/i }));
  await user.click(screen.getByRole('button', { name: /enter the verdict/i }));

  expect(screen.getByRole('status').textContent).toBe('Entered as VER-0001.');
  expect(saved()).toContain('Exhibit A ruled Authentic, 4 to 2.');
});

it('shows anyone else the cards, but leaves verdicts to a Clerk', async () => {
  history.replaceState(null, '', '/#card/object-trial');
  render(<App />);
  await joinAs('Kevin');

  expect(cardTitle()).toBe('The Fish Court');
  expect(screen.queryByRole('button', { name: /enter the verdict/i })).toBeNull();
  expect(screen.getByText('A Clerk enters verdicts.')).toBeTruthy();
});

it('walks the deck by button and keyboard, strikes a card, and leaves', async () => {
  render(<App />);
  const user = await joinAs('Deniz');
  await user.click(screen.getByRole('button', { name: /convene the bench/i }));

  expect(cardTitle()).toBe('Case GUO-27 is open');
  expect(screen.getByRole('button', { name: /^back$/i }).hasAttribute('disabled')).toBe(true);

  await user.click(screen.getByRole('button', { name: /^strike it$/i }));
  expect(cardTitle()).toBe('Maritime Law is in effect');
  expect(location.hash).toBe('#card/maritime-law');

  await user.keyboard('{ArrowRight}');
  expect(cardTitle()).toBe('The Fish Have Spoken');
  await user.keyboard('{ArrowLeft}');
  expect(cardTitle()).toBe('Maritime Law is in effect');

  await user.keyboard('{Escape}');
  expect(screen.getByRole('heading', { level: 2, name: 'Today' })).toBeTruthy();
});

it('runs Seven Witnesses on one phone and reveals the words without a single name', async () => {
  history.replaceState(null, '', '/#card/witness');
  render(<App />);
  const user = await joinAs('Deniz');

  await user.type(screen.getByLabelText(/name one small thing/i), 'The cooler lid');
  await user.click(screen.getByRole('button', { name: /open testimony/i }));

  for (const [who, words] of [
    ['Kevin', 'It opened itself. I was elsewhere.'],
    ['Jack', 'Classic lid behaviour, honestly.'],
    ['Nate', 'Blub.'],
  ]) {
    await user.selectOptions(screen.getByLabelText(/who is holding the phone/i), who);
    expect(screen.getByText(/You are the /)).toBeTruthy();
    await user.type(screen.getByLabelText(/your testimony/i), words);
    await user.click(screen.getByRole('button', { name: /swear to it/i }));
  }
  expect(screen.getByText(/3 of 7 witnesses have testified/)).toBeTruthy();
  expect(screen.queryByText(/Blub/)).toBeNull();

  // At the Tribunal, the Clerk opens the reveal card from a fresh link.
  cleanup();
  history.replaceState(null, '', '/#card/witness-reveal');
  render(<App />);
  await user.click(await screen.findByRole('button', { name: /read the testimony/i }));

  const stage = screen.getByRole('main');
  expect(within(stage).getAllByRole('heading', { name: /^Testimony of the / })).toHaveLength(3);
  expect(within(stage).getByText('Blub.')).toBeTruthy();
  expect(stage.textContent).not.toMatch(/Kevin|Jack|Nate|Deniz/);
});

it('files and strikes an incident from Today, and the words leave the device save', async () => {
  render(<App />);
  const user = await joinAs('Nick');

  await user.type(screen.getByLabelText(/what happened/i), 'The speaker was moved without consent.');
  await user.click(screen.getByRole('button', { name: /^file it$/i }));
  expect(screen.getByRole('status').textContent).toBe('Filed as INC-0001.');
  expect(saved()).toContain('without consent');

  await user.click(screen.getByRole('button', { name: 'Strike INC-0001 from the record' }));
  expect(screen.getByRole('status').textContent).toBe('Struck. No reason owed.');
  expect(saved()).not.toContain('without consent');
  expect(screen.getByText('The record is empty. The fish is still out there.')).toBeTruthy();
});

it('keeps a Classified Order sealed, and only ever shows the current identity its own phrase', async () => {
  render(<App />);
  const user = await joinAs('Jack');

  await user.click(screen.getByRole('link', { name: /^mission$/i }));
  expect(screen.queryByTestId('contraband-text')).toBeNull();
  await user.click(screen.getByRole('button', { name: /break the seal/i }));
  expect(screen.getByTestId('contraband-text').textContent).toContain(CONTRABAND.Jack);

  await switchTo(user, 'Nick');
  await user.click(screen.getByRole('link', { name: /^mission$/i }));
  expect(screen.queryByTestId('contraband-text')).toBeNull();
  await user.click(screen.getByRole('button', { name: /break the seal/i }));
  expect(screen.getByTestId('contraband-text').textContent).toContain(CONTRABAND.Nick);
  expect(document.body.textContent).not.toContain(CONTRABAND.Jack);
  expect(saved()).not.toContain(CONTRABAND.Jack);
});

it('lets a Clerk move the act and copy that act’s dispatch, with a text box when the clipboard refuses', async () => {
  render(<App />);
  const user = await joinAs('Deniz');

  await user.click(screen.getByRole('button', { name: 'II Investigation' }));
  expect(screen.getByRole('heading', { name: 'Act II: The Investigation' })).toBeTruthy();

  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  await user.click(screen.getByRole('button', { name: /copy dispatch/i }));
  expect(write).toHaveBeenCalledWith(expect.stringContaining(`${location.origin}/#today/case-file`));
  expect(await screen.findByText('Dispatch copied. Paste it in the group chat.')).toBeTruthy();

  write.mockRejectedValue(new Error('denied'));
  await user.click(screen.getByRole('button', { name: /copy dispatch/i }));
  const box = await screen.findByLabelText(/copy this into the group chat/i);
  expect((box as HTMLTextAreaElement).value).toMatch(/^Memo 2\./);
});

it('hides the act controls from anyone who is not a Clerk', async () => {
  render(<App />);
  await joinAs('Kevin');
  expect(screen.getByRole('heading', { name: 'Act I: Intake' })).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'Act' })).toBeNull();
  expect(screen.queryByRole('button', { name: /convene the bench/i })).toBeNull();
});

it('holds a wake lock while mounted, lets it go on unmount, and shrugs where there is none', async () => {
  const release = vi.fn().mockResolvedValue(undefined);
  const request = vi.fn().mockResolvedValue({ release });
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

  const { unmount } = renderHook(() => useWakeLock());
  expect(request).toHaveBeenCalledWith('screen');
  await Promise.resolve();
  unmount();
  expect(release).toHaveBeenCalled();

  delete (navigator as { wakeLock?: unknown }).wakeLock;
  expect(() => renderHook(() => useWakeLock()).unmount()).not.toThrow();
});

it('keeps a show of hands when the Clerk steps off the card and back', async () => {
  history.replaceState(null, '', '/#card/exhibit-a');
  render(<App />);
  const user = await joinAs('Deniz');
  const authentic = () => within(screen.getByRole('group', { name: /show of hands/i })).getByRole('button', { name: /authentic/i });

  await user.click(authentic());
  await user.click(authentic());
  expect(authentic().textContent).toContain('2');
  await user.keyboard('{ArrowLeft}');
  expect(cardTitle()).toBe('Seven Witnesses');
  await user.click(screen.getByRole('button', { name: /next card/i }));
  expect(authentic().textContent).toContain('2');
});

it('lands a returning player on the section a memo linked to, then leaves the address clean', async () => {
  render(<App />);
  await joinAs('Kevin');
  cleanup();

  history.replaceState(null, '', '/#dinner/sealed-future');
  render(<App />);
  expect(document.activeElement?.id).toBe('sealed-future');
  expect(location.hash).toBe('');
});
