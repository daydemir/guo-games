/** @vitest-environment happy-dom */
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Media } from '../../core/media';

const downscaleImage = vi.fn();
vi.mock('../downscale', () => ({ downscaleImage: (file: File) => downscaleImage(file) }));

const { Vault } = await import('./Vault');
const { join } = await import('../../core/actions');
const { emptyState } = await import('../../core/state');

const jpeg = (name: string): Media => ({
  name,
  type: 'image/jpeg',
  bytes: 3,
  data: 'data:image/jpeg;base64,AAAA',
});

/** A promise this test resolves by hand, so two picks can finish out of order. */
function deferred<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

const run = vi.fn();
const onProblem = vi.fn();

function renderVault() {
  const state = join(emptyState(), 'GUO27', 'Kevin', 'Kevin', 'sea');
  render(<Vault state={state} locked={false} now={Date.now()} run={run} onProblem={onProblem} />);
}

const fileField = () => screen.getByLabelText(/Photo or voice note/i);
const saveButton = () => screen.getByRole('button', { name: /save to the vault|resizing/i }) as HTMLButtonElement;

beforeEach(() => {
  downscaleImage.mockReset();
  run.mockReset();
  onProblem.mockReset();
});

it('disables saving while a photo is still being resized', async () => {
  const slow = deferred<Media>();
  downscaleImage.mockReturnValue(slow.promise);
  renderVault();
  const user = userEvent.setup();

  await user.upload(fileField(), new File(['a'], 'a.jpg', { type: 'image/jpeg' }));
  await waitFor(() => expect(saveButton().disabled).toBe(true));
  expect(screen.getByText(/resizing/i)).toBeTruthy();

  slow.settle(jpeg('a.jpg'));
  await waitFor(() => expect(saveButton().disabled).toBe(false));
  expect(screen.getByText(/a\.jpg attached/i)).toBeTruthy();
});

it('ignores a slow resize that lands after a newer photo was picked', async () => {
  const first = deferred<Media>();
  const second = deferred<Media>();
  downscaleImage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  renderVault();
  const user = userEvent.setup();

  await user.upload(fileField(), new File(['a'], 'first.jpg', { type: 'image/jpeg' }));
  await user.upload(fileField(), new File(['b'], 'second.jpg', { type: 'image/jpeg' }));

  // The newer pick finishes first, then the stale one arrives.
  second.settle(jpeg('second.jpg'));
  await waitFor(() => expect(screen.getByText(/second\.jpg attached/i)).toBeTruthy());

  first.settle(jpeg('first.jpg'));
  await waitFor(() => expect(screen.getByText(/second\.jpg attached/i)).toBeTruthy());
  expect(screen.queryByText(/first\.jpg attached/i)).toBeNull();
});

it('never attaches a resize that finishes after the memory was already saved', async () => {
  const slow = deferred<Media>();
  downscaleImage.mockReturnValue(slow.promise);
  renderVault();
  const user = userEvent.setup();

  await user.type(screen.getByLabelText(/the story/i), 'A story with no photo.');
  await user.upload(fileField(), new File(['a'], 'late.jpg', { type: 'image/jpeg' }));
  slow.settle(jpeg('late.jpg'));
  await waitFor(() => expect(saveButton().disabled).toBe(false));

  await user.click(saveButton());
  expect(run.mock.calls[0][0]).toMatchObject({ media: { name: 'late.jpg' } });

  // A second, still pending resize must not reattach to the next memory.
  const stale = deferred<Media>();
  downscaleImage.mockReturnValue(stale.promise);
  await user.upload(fileField(), new File(['b'], 'stale.jpg', { type: 'image/jpeg' }));
  await user.click(saveButton());
  stale.settle(jpeg('stale.jpg'));

  await waitFor(() => expect(screen.queryByText(/stale\.jpg attached/i)).toBeNull());
});
