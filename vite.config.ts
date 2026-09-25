import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the app from /guo-games/ (npm run build:pages); Vercel
  // and local previews serve it from the root.
  base: process.env.GUO_BASE ?? '/',
  plugins: [react()],
  build: { target: 'es2022', sourcemap: false },
  test: {
    // Domain tests are pure and run in node. Screen tests opt into a DOM with an
    // `@vitest-environment happy-dom` docblock, which keeps the suite fast.
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
  },
});
