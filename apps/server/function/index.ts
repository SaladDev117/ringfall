// Neon Function entry: one public HTTPS URL serves the web app at / and the game API under /api.
import { attachDatabasePool } from '@neon/functions';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { startWorker } from '../src/worker.js';
import { WEB_FILES } from './web-assets.js';

const config = loadConfig();
// Neon injects DATABASE_URL (pooled). Keep the pool small: every isolate has its own.
const db = createDb({ ...process.env, DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX ?? '5' });
if (db.pool) attachDatabasePool(db.pool);
const app = buildApp(db, { jwtSecret: config.jwtSecret });
await app.ready();
// Each isolate runs the worker while it's alive; arrivals are also resolved on every request, so nothing waits on it.
if (db.orm && config.worker) startWorker(db.orm, app.log, { pushEnabled: process.env.EXPO_PUSH !== 'off' });

const HOP_BY_HOP = new Set(['connection', 'transfer-encoding', 'keep-alive']);

/** Hands a web request to Fastify in-process (no socket) and converts the reply back. */
async function api(request: Request, path: string): Promise<Response> {
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const res = await app.inject({
    method: request.method as 'GET',
    url: path,
    headers: Object.fromEntries(request.headers),
    payload: hasBody ? Buffer.from(await request.arrayBuffer()) : undefined,
  });
  const headers = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined || HOP_BY_HOP.has(key)) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(key, String(v));
  }
  const body = res.statusCode === 204 || res.statusCode === 304 ? null : new Uint8Array(res.rawPayload);
  return new Response(body, { status: res.statusCode, headers });
}

const decoded = new Map<string, Uint8Array>();

/** The Expo web export, with single-page-app fallback to index.html. */
function web(pathname: string): Response {
  let path = decodeURIComponent(pathname);
  if (!WEB_FILES[path]) path = '/index.html';
  const file = WEB_FILES[path];
  if (!file) return new Response('Web app not bundled', { status: 404 });
  let bytes = decoded.get(path);
  if (!bytes) {
    bytes = new Uint8Array(Buffer.from(file.base64, 'base64'));
    decoded.set(path, bytes);
  }
  // Hashed bundles never change; the page itself must always be fresh.
  const immutable = path.startsWith('/_expo/static/') || path.startsWith('/assets/');
  return new Response(bytes, {
    headers: { 'content-type': file.type, 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return api(request, (url.pathname.slice(4) || '/') + url.search);
    }
    return web(url.pathname);
  },
};
