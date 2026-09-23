import { MAX_FILE_BYTES, MAX_IMAGE_EDGE, fitWithin, validateMedia } from '../core/media';
import type { Media } from '../core/media';

/** Quality steps tried in order until the encoded photo fits the byte budget. */
const QUALITIES = [0.82, 0.7, 0.58, 0.45, 0.35];

/**
 * Turns a photo straight off a phone camera into something the vault can hold.
 *
 * A modern phone produces a 4032px, three to eight megabyte JPEG. The byte
 * budget is 300 KB, so without this every real photo was rejected and the
 * feature only worked for files somebody had already resized by hand.
 */
export async function downscaleImage(file: File): Promise<Media> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_IMAGE_EDGE);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not resize that photo. Try a smaller one.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  for (const quality of QUALITIES) {
    const data = canvas.toDataURL('image/jpeg', quality);
    const media = toMedia(file.name, data);
    if (media.bytes <= MAX_FILE_BYTES) {
      validateMedia(media);
      return media;
    }
  }

  throw new Error('That photo is too detailed to store on this device. Try a different one.');
}

/** Reads a data URL back into the shape the vault stores, byte count included. */
function toMedia(name: string, data: string): Media {
  const encoded = data.slice(data.indexOf(',') + 1);
  const padding = encoded.match(/=*$/)?.[0].length ?? 0;
  return {
    name: jpegName(name),
    type: 'image/jpeg',
    bytes: (encoded.length / 4) * 3 - padding,
    data,
  };
}

export const jpegName = (name: string) => `${name.replace(/\.[^./\\]+$/, '') || 'photo'}.jpg`;
