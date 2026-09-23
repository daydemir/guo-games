import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

if (!globalThis.crypto?.randomUUID) {
  let n = 0;
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: () => `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`,
  });
}
