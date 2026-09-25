/**
 * Starts the Wedding Markets server. Needs Node 22.18 or later, which runs
 * TypeScript directly.
 *
 *   PORT             where to listen (default 8787)
 *   DATA_DIR         where party files live (default ./data)
 *   ALLOWED_ORIGINS  comma-separated browser origins (default: GitHub Pages and local dev)
 */
import { createServer } from 'node:http';
import { createApp } from './app.ts';
import { openStore } from './store.ts';

const DEFAULT_ORIGINS = [
  'https://daydemir.github.io',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
];

const port = Number(process.env.PORT ?? 8787);
const dir = process.env.DATA_DIR ?? 'data';
const origins = process.env.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? DEFAULT_ORIGINS;

const store = openStore(dir);
const server = createServer(createApp({ store, origins }));
// A phone on a bad signal should not hold a connection open for minutes.
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(port, () => console.log(`Wedding Markets listening on ${port}, ${store.count()} parties in ${dir}`));

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
