import { defineConfig, devices } from '@playwright/test';

/**
 * The two-phone market journey against the deployed market server: a GitHub
 * Pages build (`npm run build:pages`) served locally, talking to the real
 * server. Every run starts one new party there.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'markets.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173/guo-games/', trace: 'off', reducedMotion: 'reduce' },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 14'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: 'GUO_BASE=/guo-games/ npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/guo-games/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
