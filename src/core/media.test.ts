import { expect, it } from 'vitest';
import { MAX_FILE_BYTES, validateMedia } from './media';
import { act } from './actions';
import { NOW, as } from './fixtures';

const audio = { name: 'hello.mp3', type: 'audio/mpeg', bytes: 1, data: 'data:audio/mpeg;base64,AA==' };

it('accepts a small photo or voice note', () => {
  expect(() => validateMedia(audio)).not.toThrow();
  expect(act(as('Kevin'), { type: 'submitMemory', about: 'Kevin', moment: 'Dinner', text: '', media: audio }, NOW).vault[0].media)
    .toEqual(audio);
});

it('rejects file types that can carry script or that the app cannot play', () => {
  expect(() => validateMedia({ ...audio, type: 'image/svg+xml', data: 'data:image/svg+xml;base64,AA==' })).toThrow(/JPEG/);
  expect(() => validateMedia({ ...audio, type: 'text/html', data: 'data:text/html;base64,AA==' })).toThrow(/JPEG/);
});

it('rejects anything that is not a real base64 data URL of the declared type', () => {
  expect(() => validateMedia({ ...audio, data: 'javascript:alert(1)' })).toThrow(/could not be read/i);
  expect(() => validateMedia({ ...audio, data: 'data:image/png;base64,AA==' })).toThrow(/could not be read/i);
  expect(() => validateMedia({ ...audio, data: 'data:audio/mpeg;base64,!!!!' })).toThrow(/could not be read/i);
});

it('holds each file under the local budget', () => {
  expect(() => validateMedia({ ...audio, bytes: MAX_FILE_BYTES + 1 })).toThrow(/300 KB/);
});

it('stops the vault filling the browser storage quota', () => {
  const big = 'A'.repeat(400_000);
  const chunk = { name: 'a.mp3', type: 'audio/mpeg', bytes: (big.length / 4) * 3, data: `data:audio/mpeg;base64,${big}` };
  let state = as('Kevin');
  for (let i = 0; i < 3; i += 1) {
    state = act(state, { type: 'submitMemory', about: 'Kevin', moment: 'Dinner', text: '', media: chunk }, NOW);
  }
  expect(() => act(state, { type: 'submitMemory', about: 'Kevin', moment: 'Dinner', text: '', media: chunk }, NOW))
    .toThrow(/media budget/i);
});

import { MAX_IMAGE_EDGE, fitWithin } from './media';

it('leaves an already small photo alone', () => {
  expect(fitWithin(800, 600, MAX_IMAGE_EDGE)).toEqual({ width: 800, height: 600 });
});

it('scales a phone photo down by its long edge, keeping the aspect ratio', () => {
  expect(fitWithin(4032, 3024, 1280)).toEqual({ width: 1280, height: 960 });
  expect(fitWithin(3024, 4032, 1280)).toEqual({ width: 960, height: 1280 });
});

it('never returns a zero dimension for an extreme panorama', () => {
  const fitted = fitWithin(12000, 3, 1280);
  expect(fitted.width).toBe(1280);
  expect(fitted.height).toBeGreaterThanOrEqual(1);
});
