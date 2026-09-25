import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Smoke tests run against the real production build, not the dev server, so
 * the service worker, the manifest and the hashed assets are all the ones that
 * would be deployed.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  // Reduced motion keeps captured screenshots off mid-transition colors, and
  // exercises the reduced-motion path at the same time.
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'off', reducedMotion: 'reduce' },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 14'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: [
    {
      command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // The Wedding Markets server, fresh for every run. `npm run smoke` builds
      // the app pointed at it.
      command: 'node server/main.ts',
      url: 'http://127.0.0.1:8788/health',
      env: { PORT: '8788', DATA_DIR: join(tmpdir(), `guo-markets-smoke-${Date.now()}`) },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
