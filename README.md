# The Guo Games

A local-first, installable web app for the rest of the weekend in Maui. A few
predictions, a fish draft, one quiet act confirmed by one witness, a vault of
stories, a mock-official Bureau investigating a fish that got away, and a long
dinner where it all gets settled.

It is a shared attention engine, not a scoreboard with a party attached, and no
reason to hold the phone for more than a minute at a time. The Wedding Markets
keep score in dollars and are the one part shared live between phones; the app
never moves real money.

## Commands

```bash
npm install          # Node >= 22.12
npm run dev          # http://127.0.0.1:5173
npm test             # unit and screen tests (Vitest)
npm run typecheck    # tsc --noEmit, strict
npm run lint         # ESLint, type-aware
npm run build        # typecheck, Vite build, then generate dist/sw.js
npm run build:pages  # the same, for GitHub Pages under /guo-games/
npm run preview      # serve the production build on :4173
npm run smoke        # build, then Playwright smoke tests against that build
npm run server       # the Wedding Markets server on :8787 (Node >= 22.18)
npm run smoke:live   # the two-phone market journey against the deployed server
```

`npm run smoke` builds first, so a clean checkout or a stale `dist/` cannot
give a misleading pass; the Playwright config then starts `vite preview` and a
fresh market server for you, and the build points at that server. Screenshots from a run land in `test-results/`, which is ignored; the
curated captures in `artifacts/` are committed and a run never rewrites them.

## How the app is laid out

Six tabs, in the order the day runs: **Today** (the one next thing, where you
stand, and the shared feed), **Picks** (yes or no predictions and the Dock
Draft), **Bounties**, **Mission**, **Vault** and **Dinner** (award cards, stories
read out of the vault, sealed notes). Tapping your name in the masthead opens
**You**: who is holding the phone, organizer settings, backup and restore, and
the reset. Six is the most a 390px phone holds without a scrolling tab bar.

## The Bureau of the Uncaught Fish

*Case GUO-27: a fish got away, and the Bureau suspects it had help.* The fiction
runs in four acts that a Clerk (an organizer) moves by hand from the Today
screen: **I Intake**, **II Investigation**, **III Tribunal** (dinner, the peak)
and **IV Release** (the last morning). Kevin presides and is never on trial. The
court only tries objects, stories and small decisions, and anyone may strike
anything, no reason owed.

Nothing but the markets syncs between phones, so the design leans on that:

- **The Bench** (`#bench`) is a full-screen card deck for one phone in the
  middle of the table. A Clerk reads each card aloud and can run a whole act
  alone: show-of-hands votes tapped in and entered as verdicts, Seven
  Witnesses (sealed testimony passed round one phone, read out by role with no
  names), the Docket, Naming Rights, the Re-Commissioning. It keeps the screen
  awake, and walks by arrow keys; Escape leaves.
- **Personal phones** carry the private or bundled parts: a Classified Order
  (a Contraband Phrase under Mission), the fish augury (the Dock Draft notes),
  the prophecies on Picks, and the Case File on Today for Incident Reports and
  seven-word Fish Weather forecasts.
- **The group chat is the notification layer.** Each act has a Dispatch memo a
  Clerk copies from Today, with a link such as `#mission`, `#picks/dock-draft`
  or `#card/exhibit-a`. A link survives the join screen.

## Wedding Markets

Yes or no questions about the weekend that trade like Kalshi, in dollars, on
one board every phone shares live. Everyone starts with $100. The app keeps
score and never moves real money: no deposits, withdrawals, payouts or
payment system of any kind.

- **Starting.** A Clerk (Deniz or Nick) opens Picks and taps **Start the
  markets**, then **Share the link** and posts it in the group chat. Everyone
  else taps the link, picks their name, and lands on the markets. Nobody types
  a code. The link carries a random party key; without it nobody can read or
  trade on the party. Share it in the group chat only.
- **Trading.** Anyone playing opens a market with a question and, optionally,
  when it closes. It starts at 50 cents. Tap Yes or No, pick $1, $5, $10 or
  $25, read the quote (shares, average price, what it pays if right), and buy.
  Every buy moves the price for everyone within a few seconds.
- **No waiting for a match.** An automatic market maker (a logarithmic market
  scoring rule, `src/core/market.ts`) always takes the other side, so every
  buy fills at once.
- **Settling.** Only a Clerk closes trading, resolves Yes or No (behind a
  second tap), or voids. A winning share pays $1, exactly once. A void refunds
  every buy and clears the question from the server.
- **Standings.** Everyone's gain or loss against their $100, best first. Open
  bets count at what they cost, so once every market is resolved it is the
  end-of-night tally. The market maker's line makes the column add up.
- **Offline.** The server is the only place a trade happens. When it cannot be
  reached the markets say so, buttons wait, and it reconnects by itself.

Markets live on Picks (`#picks/markets`), and Today shows the open ones.
Identity is the same name-pick as the rest of the app: fine among friends, not
authentication.

### The market server

`server/` is a small Node service with no dependencies beyond `zod`. It runs
`apply` from `src/core/market.ts`, the same file every phone uses to quote and
draw the board, straight from TypeScript (Node 22.18 or later).

| Route | What |
| --- | --- |
| `GET /health` | health check |
| `POST /parties` | starts a party, answers `{ key, ledger }` |
| `GET /party?since=N` | the ledger, or `204` when it is still version `N` |
| `POST /party` | `{ who, command }`, answers the new ledger or `{ error }` |

The key rides in an `x-party-key` header, never a URL. Phones poll every 2.5
seconds while the app is on screen. Each party is one JSON file on a persistent
disk, named by a hash of its key, written atomically on every change; an
unreadable file is skipped and left alone. Commands that create something carry
an id from the phone, so a retried request is applied once. Limits: 4 KB
bodies, 600 requests a minute per address, 120 writes a minute per party, 5 new
parties an hour per address and 30 in total, 500 parties, 20 live markets and
5,000 trades a party. CORS allows only GitHub Pages and local dev and preview.

It runs on Render as `guo-games-markets` (Starter, Oregon, 1 GB disk at
`/var/data`), built with `npm ci --omit=dev` and started with
`node server/main.ts`. Environment: `DATA_DIR=/var/data`, `NODE_VERSION=24`,
and optionally `ALLOWED_ORIGINS`. A build points at a different server with
`VITE_MARKETS_URL`.

## Architecture

The rules and the interface are kept apart on purpose. Every rule lives in
`src/core` and is tested without a DOM, so the screens stay declarative: they
render state and dispatch intent, and nothing else.

```
src/core/       the game, with no React in it
  content.ts      the roster, fish, predictions, bounties, missions, all copy
  bureau.ts       the Bureau: acts, memos, Bench cards, orders, witness roles
  market.ts       Wedding Markets: pricing, the ledger and its rules, shared
                  by the phones and the server
  state.ts        the Zod schema, an empty party, and the seeded demo party
  actions.ts      join() and act(): the only ways a party can change
  selectors.ts    derived views: scores, boards, awards, the single next action
  storage.ts      load, save, migrate, and refuse to destroy an unreadable save
  media.ts        photo and voice note validation
  time.ts         the date kill switch and relative time
src/app/        React: one hook for state, one screen per tab, plus You and
                the Bench; route.ts reads and writes the hash links
src/ui/         the five visual primitives every screen is built from
server/         the Wedding Markets server: routes, file store, entry point
e2e/            Playwright smoke tests against the real build
```

`act(state, action, now)` is the single write path. It throws a sentence written
for a player, and `useParty` turns that into the message on screen. Persistence
is a consequence of a command rather than a reaction to a render, which is what
keeps an unreadable save from being overwritten on mount.

## Constraints this build holds to

- **Local first.** No account, no analytics, and no MIX infrastructure of any
  kind. The whole party is one `localStorage` key, except the Wedding Markets,
  which live on this repo's own market server. The party key for them is a
  separate `localStorage` key, so the save format did not change.
- **Identity is a demonstration, not authentication.** Anyone holding the device
  can switch to anyone on the roster. That is deliberate for a phone that gets
  passed around a table, and it is stated in the interface.
- **No real money moves.** Predictions, bounties and missions score points.
  Wedding Markets keep score in dollars; the app has no deposits, withdrawals,
  payouts, transfers or payment system of any kind.
- **Opt-in, always.** Nothing asks for a dangerous stunt, an ocean dare, a
  drinking challenge or pressure on a stranger. Anyone playing can void anything that is
  still open, with no points lost and no explanation owed. Once a prediction is
  settled or a bounty is confirmed it holds other people's points, so undoing it
  is limited to an organizer (and, for a bounty, the person who did it).
  Spectator is a real role.
- **Private stays private.** Mission text, vault stories, sealed notes,
  Classified Orders, Case File text and sworn testimony never reach the shared
  feed. Testimony is stored under a random role with no author, and the roll of
  who has sworn is kept only to stop a second account. Nobody can read who wrote
  what in the app. Before the reveal, though, someone with direct access to the
  device storage or to backups could compare two copies taken either side of one
  account and match that name to it. At the reveal the roll is dropped, and every
  later save and backup holds no link between a name and an account. A round
  saved by the branch's first build, whose roles were derived from names, is
  dropped if it was never read out, and has its roles dealt again by the words
  alone if it was. A struck Case File
  entry is deleted, not hidden. There are tests that assert exactly this.
- **Tabs share one save.** A memo link often opens a second tab. Every command
  re-reads the save before it runs, and other open tabs follow along through
  the browser's storage event, so no tab writes an older copy over newer work.
- **Old saves keep opening.** Fish, prediction and bounty ids are stored as
  enum keys, so they are append only: removing or renaming one would send every
  live save to the recovery screen. New state fields default and the save
  version stays 3, so a newer build opens every older save or backup. The
  reverse only partly holds: an older build refuses a save that uses anything
  it does not know, such as a pick on a new prophecy, a new bounty, or a memory
  filed under Tonight or Tomorrow, and shows the recovery screen rather than
  overwriting it. A save it can open loses its Case File, testimony and act on
  that build's next write. Avoid rolling back mid-trip. Markets from the
  earlier local-only build are dropped when a save opens; an old tab still open
  may write them back, and the next open drops them again.
- **The kill switch is real.** After `settings.expiresAt`, every mutation is
  refused and the app is a read-only recap. Organizers can move the date forward
  while the trip is live, and never into the past.

### Privacy and durability warning

Everything you type, photograph or record stays inside one browser on one device.
It is not encrypted, it is not backed up, and it is not uploaded anywhere. Anyone
who can unlock the device can read the whole vault, including the organizer inbox.

A browser is not durable storage. Clearing site data destroys the party instantly,
and iOS evicts storage for a site or installed web app that has not been opened in
roughly seven days. **Export a backup from the You page** (tap your name at the
top) before the trip and again
after dinner; that file is the only copy that survives the browser.

If the save on a device becomes unreadable, the app refuses to start the game and
refuses to write anything. It offers three explicit ways out: download the raw
bytes, restore a backup file, or delete and start fresh. Nothing is overwritten
until you choose.

## Configuration

| What | Where | Default |
| --- | --- | --- |
| Party code | `PARTY_CODE` in `src/core/content.ts` | `GUO27` |
| Photo long edge | `MAX_IMAGE_EDGE` in `src/core/media.ts` | 1280px, resized on upload |
| Roster and organizers | `ATTENDEES`, `ORGANIZERS` | seven names, Deniz and Nick organize |
| Kill switch | `DEFAULT_EXPIRES_AT`, editable in the app by an organizer | `2027-07-06T10:00:00Z` |
| Sealed notes open | `FUTURE_OPENS_AT` | `2032-07-06T10:00:00Z` |
| Story vs points awards, hidden rankings | organizer settings on the You page | story awards, hidden |

The trip dates are placeholders. Set `DEFAULT_EXPIRES_AT` to the real end of the
trip before sharing the link, or move it from the You page as an organizer.

## First run

Opening the app on a new device seeds a demo party that is already half in motion:
other people have picked, drafted, confirmed and filed memories. Kevin and Deniz
are left untouched, so joining as either one still walks the whole loop from the
start. **Reset this device** on the You page puts the demo back.

## Deploying to Vercel

The app is a static SPA with no secrets. The market server is deployed
separately (see above), and its CORS list would need the Vercel origin added.

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

Nothing else is required for the app itself.

## PWA

`public/manifest.webmanifest` plus SVG and PNG icons make the app installable.
Every URL is relative to the build's base (`GUO_BASE`, `/` by default,
`/guo-games/` for `npm run build:pages`), so the same source serves Vercel at the
root and GitHub Pages under a sub-path without hand-patching the build.
`scripts/build-sw.mjs` writes `dist/sw.js` after each build with the real hashed
asset names baked in, so the offline shell can never drift from what Vite emitted.
The shell is cache-first; the market server is on another origin, so the
service worker never touches its requests.
Cache lookups ignore `Vary`, because a host that answers `Vary: Origin` would
otherwise make the module script miss its cached copy and open offline as a
blank page. A Playwright check loads the app, goes offline, reloads and joins.
It runs in Chromium; Playwright's WebKit cannot emulate offline under a service
worker, so iOS offline behavior is worth one manual check on a real phone.

## Testing

Behaviour was built test-first. The red and green runs are kept in `artifacts/`:

| File | What it shows |
| --- | --- |
| `tdd-01-red-domain.log` | 11 domain test files failing before any rule existed |
| `tdd-02-green-domain.log` | the same 55 domain tests passing |
| `tdd-03-red-app.log` | the screen tests failing before the React app existed |
| `tdd-04-green-all.log` | the full suite passing |
| `tdd-05-red-review-fixes.log` | the review-fix tests failing before the fixes |
| `tdd-06-green-review-fixes.log` | the full suite passing after them |
| `tdd-07-red-coderabbit.log` | the CodeRabbit-round tests failing before the fixes |
| `tdd-08-green-coderabbit.log` | the full suite passing after them |
| `tdd-09-green-final-review.log` | the full suite passing after the final review round |
| `tdd-10-red-final-pass.log` | the first final-pass rule and save tests failing before their fixes |
| `tdd-11-green-final-pass.log` | the full suite passing after them |
| `smoke-browser.log` | the Playwright checks at 390px (WebKit) and 1280px (Chromium) |
| `smoke-bureau.log` | the same checks plus the Bureau journeys, after the weekend upgrade |

Covered: join and spectator roles (including arrival dedupe), the three-pick cap
and the slot a settled or voided pick gives back,
organizer-only settling, settlement finality, who may void an open versus a
settled item, duplicate fish prevention and release, one-bounty-at-a-time,
witness-must-be-someone-else, mission privacy and opt-out, vault visibility and
the organizer inbox, media type, size and budget limits, photo downscaling
arithmetic, award card assignment, sealed notes, the kill switch across every
action (a late join leaves the feed alone), storage migration and defaults, an
unparseable closing date, refusing to overwrite an unreadable save, keeping the
last saved state when a write fails, forms that keep their text when a save is
refused, the recovery and backup round trip, deliberate identity switching that
never carries one person's name to another, the dinner read-out, the offline
shell, and the closing-date guard.

Screenshots at 390px and 1280px are in `artifacts/`: join, today, picks, mission,
bounties, vault, dinner, you, and the spectator view, plus `*-bureau-*` captures
of the Case File, the Bench vote, Seven Witnesses and the Classified Order.

## Licence

`public/fonts/fraunces.ttf` is Fraunces, under the SIL Open Font License. The
licence text is at `public/fonts/OFL.txt`.
