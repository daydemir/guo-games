/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from 'vitest';
import { downscaleImage, jpegName } from './downscale';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const photo = () => new File(['x'], 'IMG_1234.jpg', { type: 'image/jpeg' });

function stubBitmap() {
  const bitmap = { width: 4032, height: 3024, close: vi.fn() };
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
  return bitmap;
}

const stubContext = () =>
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as never);

const stubEncoder = (payload: string) =>
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(`data:image/jpeg;base64,${payload}`);

it('names the resized file as a jpeg whatever it started as', () => {
  expect(jpegName('IMG_1234.HEIC')).toBe('IMG_1234.jpg');
  expect(jpegName('no-extension')).toBe('no-extension.jpg');
  expect(jpegName('.hidden')).toBe('photo.jpg');
});

it('releases the bitmap on the happy path', async () => {
  const bitmap = stubBitmap();
  stubContext();
  stubEncoder('AAAA');

  const media = await downscaleImage(photo());

  expect(media.name).toBe('IMG_1234.jpg');
  expect(bitmap.close).toHaveBeenCalledTimes(1);
});

it('releases the bitmap when the canvas refuses a 2d context', async () => {
  const bitmap = stubBitmap();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

  await expect(downscaleImage(photo())).rejects.toThrow(/could not resize/i);
  expect(bitmap.close).toHaveBeenCalledTimes(1);
});

it('releases the bitmap when drawing the photo throws', async () => {
  const bitmap = stubBitmap();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: () => {
      throw new Error('out of memory');
    },
  } as never);

  await expect(downscaleImage(photo())).rejects.toThrow(/out of memory/);
  expect(bitmap.close).toHaveBeenCalledTimes(1);
});

it('releases the bitmap when no quality step ever fits the budget', async () => {
  const bitmap = stubBitmap();
  stubContext();
  stubEncoder('A'.repeat(800_000));

  await expect(downscaleImage(photo())).rejects.toThrow(/too detailed/i);
  expect(bitmap.close).toHaveBeenCalledTimes(1);
});
