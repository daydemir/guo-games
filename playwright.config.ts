import { defineConfig, devices } from '@playwright/test';

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
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
