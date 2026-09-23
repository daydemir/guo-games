/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
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

afterEach(() => vi.unstubAllGlobals());

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
  // Both picks are in flight before anything is saved, so the older promise is
  // still genuinely pending at submit time. That is the case that used to
  // reattach a stale photo to the next memory.
  const older = deferred<Media>();
  const newer = deferred<Media>();
  downscaleImage.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  renderVault();
  const user = userEvent.setup();

  await user.type(screen.getByLabelText(/the story/i), 'A story.');
  await user.upload(fileField(), new File(['a'], 'older.jpg', { type: 'image/jpeg' }));
  await user.upload(fileField(), new File(['b'], 'newer.jpg', { type: 'image/jpeg' }));

  await act(async () => {
    newer.settle(jpeg('newer.jpg'));
  });
  expect(screen.getByText(/newer\.jpg attached/i)).toBeTruthy();
  expect(saveButton().disabled).toBe(false);

  await user.click(saveButton());
  expect(run).toHaveBeenCalledTimes(1);
  expect(run.mock.calls[0][0]).toMatchObject({ media: { name: 'newer.jpg' } });
  expect(screen.queryByText(/attached/i)).toBeNull();

  // The older resize lands now, against a form that has already moved on.
  await act(async () => {
    older.settle(jpeg('older.jpg'));
  });

  expect(screen.queryByText(/older\.jpg attached/i)).toBeNull();
  expect(screen.queryByText(/attached/i)).toBeNull();
  expect(saveButton().disabled).toBe(false);
  expect(run).toHaveBeenCalledTimes(1);
});

it('never attaches a voice note whose read finishes after the memory was saved', async () => {
  // Photos block Save while they resize, so a pending photo can never be
  // submitted past. A voice note has no such flag: the read is asynchronous
  // and Save stays enabled throughout. This is the case submit invalidation
  // is actually there for.
  let finishRead!: () => void;
  class ControlledReader {
    result: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL() {
      finishRead = () => {
        this.result = 'data:audio/mpeg;base64,AAAA';
        this.onload?.();
      };
    }
  }
  vi.stubGlobal('FileReader', ControlledReader);

  renderVault();
  const user = userEvent.setup();

  await user.type(screen.getByLabelText(/the story/i), 'A story.');
  await user.upload(fileField(), new File(['abc'], 'note.mp3', { type: 'audio/mpeg' }));
  expect(saveButton().disabled).toBe(false);

  await user.click(saveButton());
  expect(run).toHaveBeenCalledTimes(1);
  expect(run.mock.calls[0][0]).toMatchObject({ media: null });

  await act(async () => {
    finishRead();
  });

  expect(screen.queryByText(/note\.mp3 attached/i)).toBeNull();
  expect(screen.queryByText(/attached/i)).toBeNull();
});
