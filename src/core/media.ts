import { z } from 'zod';

/**
 * A photo or voice note, inlined as a data URL so the vault survives a reload
 * with no server anywhere. Small on purpose: localStorage is the whole backend.
 */
export const mediaSchema = z.object({
  name: z.string().max(120),
  type: z.string(),
  bytes: z.number().int().positive(),
  data: z.string(),
});

export type Media = z.infer<typeof mediaSchema>;

/** Nothing that can execute, and nothing the browser cannot render or play. */
export const MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
] as const;

export const MAX_FILE_BYTES = 300_000;
/**
 * The longest edge a stored photo is allowed to have. A phone camera produces
 * a 4032px, multi-megabyte JPEG, which could never fit the byte budget, so the
 * app resizes before it validates rather than rejecting every real photo.
 */
export const MAX_IMAGE_EDGE = 1280;
/** Total base64 the vault will hold before it asks for text instead. */
export const MEDIA_BUDGET_CHARS = 1_400_000;

export const isImage = (media: Media) => media.type.startsWith('image/');

/**
 * Rejects anything that is not a small, playable, self-consistent data URL.
 * The byte count is re-derived from the payload, so a lying `bytes` field cannot
 * sneak a large file past the budget, and an `svg` or `text/html` payload that
 * could carry script never reaches an `<img>` tag.
 */
export function validateMedia(media: Media): void {
  if (!(MEDIA_TYPES as readonly string[]).includes(media.type)) {
    throw new Error('Use a JPEG, PNG or WebP photo, or an MP3, M4A, WAV, OGG or WebM voice note.');
  }
  if (media.bytes > MAX_FILE_BYTES) {
    throw new Error('Keep each file under 300 KB. A short voice note or a resized photo works well.');
  }

  const prefix = `data:${media.type};base64,`;
  const unreadable = new Error('That file could not be read. Try another one.');
  if (!media.data.startsWith(prefix)) throw unreadable;

  const encoded = media.data.slice(prefix.length);
  if (encoded.length === 0 || encoded.length % 4 !== 0) throw unreadable;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw unreadable;
  if (decodedBytes(encoded) !== media.bytes) throw unreadable;
}

export function decodedBytes(encoded: string): number {
  const padding = encoded.match(/=*$/)?.[0].length ?? 0;
  return (encoded.length / 4) * 3 - padding;
}

export const mediaWeight = (media: Media | null) => media?.data.length ?? 0;

/**
 * Fits a photo inside `maxEdge` on its long side, keeping the aspect ratio and
 * never rounding a dimension down to zero. Kept pure and here so the sizing
 * rule can be tested without a canvas.
 */
export function fitWithin(width: number, height: number, maxEdge: number = MAX_IMAGE_EDGE) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
