# The Guo Games

A local-first, installable web app for one day in Maui. A few predictions, a fish
draft, one quiet act confirmed by one witness, a vault of stories, and a long
dinner where it all gets settled.

It is a shared attention engine, not a scoreboard with a party attached. There is
no money, no real-money mechanic, no stock ticker, and no reason to hold the phone
for more than a minute at a time.

## Commands

```bash
npm install          # Node >= 22.12
npm run dev          # http://127.0.0.1:5173
npm test             # 64 unit and screen tests (Vitest)
npm run typecheck    # tsc --noEmit, strict
npm run lint         # ESLint, type-aware
npm run build        # typecheck, Vite build, then generate dist/sw.js
npm run preview      # serve the production build on :4173
npm run smoke        # Playwright smoke tests against the production build
```

`npm run smoke` builds nothing on its own. Run `npm run build` first; the
Playwright config starts `vite preview` for you.

## Architecture

The rules and the interface are kept apart on purpose. Every rule lives in
`src/core` and is tested without a DOM, so the screens stay declarative: they
render state and dispatch intent, and nothing else.

```
src/core/       the game, with no React in it
  content.ts      the roster, fish, predictions, bounties, missions, all copy
  state.ts        the Zod schema, an empty party, and the seeded demo party
  actions.ts      join() and act(): the only ways a party can change
  selectors.ts    derived views: scores, boards, awards, the single next action
  storage.ts      load, save, migrate, and refuse to destroy an unreadable save
  media.ts        photo and voice note validation
  time.ts         the date kill switch and relative time
src/app/        React: one hook for state, one screen per tab
src/ui/         the five visual primitives every screen is built from
e2e/            Playwright smoke tests against the real build
```

`act(state, action, now)` is the single write path. It throws a sentence written
for a player, and `useParty` turns that into the message on screen. Persistence
is a consequence of a command rather than a reaction to a render, which is what
keeps an unreadable save from being overwritten on mount.

## Constraints this build holds to

- **Local only.** No backend, no account, no network calls, no analytics, and no
  MIX infrastructure of any kind. The whole party is one `localStorage` key.
- **Identity is a demonstration, not authentication.** Anyone holding the device
  can switch to anyone on the roster. That is deliberate for a phone that gets
  passed around a table, and it is stated in the interface.
- **Points only.** Nothing accepts an amount, a stake or a payout.
- **Opt-in, always.** Nothing asks for a dangerous stunt, an ocean dare, a
  drinking challenge or pressure on a stranger. Anyone can void any item with no
  points lost. Spectator is a real role.
- **Private stays private.** Mission text, vault stories and sealed notes never
  reach the shared feed. There are tests that assert exactly this.
- **The kill switch is real.** After `settings.expiresAt`, every mutation is
  refused and the app is a read-only recap. Organizers can move the date forward
  while the trip is live, and never into the past.

### Privacy warning

Everything you type, photograph or record stays inside one browser on one device.
It is not encrypted, it is not backed up, and it is not uploaded anywhere. Anyone
who can unlock the device can read the whole vault, including the organizer inbox.
Clearing site data destroys it permanently, and there is no copy anywhere else.

## Configuration

| What | Where | Default |
| --- | --- | --- |
| Party code | `PARTY_CODE` in `src/core/content.ts` | `GUO27` |
| Roster and organizers | `ATTENDEES`, `ORGANIZERS` | seven names, Deniz and Nick organize |
| Kill switch | `DEFAULT_EXPIRES_AT`, editable in the app by an organizer | `2027-07-06T10:00:00Z` |
| Sealed notes open | `FUTURE_OPENS_AT` | `2032-07-06T10:00:00Z` |
| Hidden rankings, story vs points awards | organizer settings on the You tab | hidden, story awards |

The trip dates are placeholders. Set `DEFAULT_EXPIRES_AT` to the real end of the
trip before sharing the link, or move it from the You tab as an organizer.

## First run

Opening the app on a new device seeds a demo party that is already half in motion:
other people have picked, drafted, confirmed and filed memories. Kevin and Deniz
are left untouched, so joining as either one still walks the whole loop from the
start. **Reset this device** on the You tab puts the demo back.

## Deploying to Vercel

The app is a static SPA with no environment variables and no secrets.

```bash
npm i -g vercel
vercel link
vercel --prod
```

Or import the repository at vercel.com and accept the defaults. `vercel.json`
already sets:

- `buildCommand: npm run build` and `outputDirectory: dist`
- a rewrite so deep links reach `index.html` instead of a 404, while real files
  under `/assets`, `/fonts`, the icons, the manifest and `sw.js` are served directly
- `no-store` on `sw.js` so a new deploy is picked up, and immutable caching on
  hashed assets
- `nosniff`, `no-referrer` and `DENY` framing headers

Nothing else is required. There is no server, no database and no API key.

## PWA

`public/manifest.webmanifest` plus SVG and PNG icons make the app installable.
`scripts/build-sw.mjs` writes `dist/sw.js` after each build with the real hashed
asset names baked in, so the offline shell can never drift from what Vite emitted.
The shell is cache-first, which is always correct here because there is no API.

## Testing

Behaviour was built test-first. The red and green runs are kept in `artifacts/`:

| File | What it shows |
| --- | --- |
| `tdd-01-red-domain.log` | 11 domain test files failing before any rule existed |
| `tdd-02-green-domain.log` | the same 55 domain tests passing |
| `tdd-03-red-app.log` | the screen tests failing before the React app existed |
| `tdd-04-green-all.log` | the full suite passing |
| `smoke-browser.log` | the 10 Playwright checks passing in Chromium at 390px and 1280px |

Covered: join and spectator roles, the three-pick cap, organizer-only settling,
settlement finality, void with no penalty, duplicate fish prevention and release,
one-bounty-at-a-time, witness-must-be-someone-else, mission privacy and opt-out,
vault visibility and the organizer inbox, media type, size and budget limits,
award card assignment, sealed notes, the kill switch across every action, and
storage migration, defaults and corruption refusal.

Screenshots at 390px and 1280px are in `artifacts/`.

## Licence

`public/fonts/fraunces.ttf` is Fraunces, under the SIL Open Font License. The
licence text is at `public/fonts/OFL.txt`.
