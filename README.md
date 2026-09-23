# Guo Games

A standalone, mobile-first party companion for Kevin Guo's Maui bachelor party. It uses a few predictions, a fishing draft, kind private missions, lightweight bounties, a nostalgia vault, and a dinner reveal to create shared moments without requiring constant phone use.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173` and join with party code `GUO27`.

## Verify

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run preview
# In another terminal, after preview is ready:
npm run smoke
```

The browser smoke test exercises joining, predictions, persistence, Dock Draft, bounty witness confirmation, Vault submission, Dinner mode, 390 px mobile layout, and the offline shell. Screenshots and the machine-readable result are written to `artifacts/`.

## Architecture

- React, TypeScript, and Vite
- Pure domain transitions in `src/game.ts`
- State persisted in `localStorage`
- Zod validation and migration for saved state
- Generated cache-first service worker for the production shell
- Vitest domain tests and Playwright browser smoke coverage

## Privacy and constraints

This MVP is deliberately local-only. Party state, stories, photos, and audio remain in the current browser's local storage. Nothing syncs across devices and clearing browser data removes it. Media is restricted to safe image/audio MIME types, 300 KB per file, 20 memories, and a bounded aggregate storage budget.

Deniz and Nick have organizer controls. Spectator mode is supported. Participation is opt-in, any uncomfortable item can be voided without penalty, and prompts exclude dangerous, ocean-risk, intoxication, humiliation, or coercive-stranger activities.

The trip cutoff and future-note reveal date are constants in `src/game.ts`. After the cutoff, game mutations are disabled and the app becomes a read-only recap.
