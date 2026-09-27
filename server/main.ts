// Production server: the built app from dist/, the result cache, a health check. No dependencies;
// Node 24 runs this TypeScript file directly (type stripping).
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { cacheOptionsFromEnv, clientIp, createCacheHandler, rateLimiter, tooMany } from './cache.ts';

const env = process.env;
const PORT = Number(env.PORT ?? 3000);
const ROOT = path.resolve(env.STATIC_DIR ?? 'dist');
const DATA = path.resolve(env.DATA_DIR ?? '/data');
const cache = createCacheHandler(cacheOptionsFromEnv(env, path.join(DATA, 'results')));
const perIp = rateLimiter({ max: Number(env.RATE_REQUESTS_PER_MIN ?? 600), windowMs: 60_000 });

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
};

// the only inline script (theme before first paint) is allowed by its hash, everything else must be same-origin
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const inline = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
const CSP = [
  "default-src 'self'", `script-src 'self' ${inline.join(' ')}`, "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:", "font-src 'self'", "connect-src 'self'", "worker-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'",
].join('; ');

function security(res: http.ServerResponse) {
  res.setHeader('content-security-policy', CSP);
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('x-frame-options', 'SAMEORIGIN');
  res.setHeader('cross-origin-opener-policy', 'same-origin');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end(); }
  let rel: string;
  try {
    const { pathname } = new URL(req.url ?? '/', 'http://x');
    // the app routes by #hash, so every real file lives under dist/ and nothing else is served
    rel = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  } catch { res.statusCode = 400; return res.end(); }
  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.statusCode = 404;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    return res.end('Not found');
  }
  const hashed = rel.startsWith('/assets/');
  res.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream');
  // bundles are content-hashed; icons, og.png, robots and sitemap may be cached for a day; the page itself never
  res.setHeader('cache-control', hashed ? 'public, max-age=31536000, immutable' : rel === '/index.html' ? 'no-cache' : 'public, max-age=86400');
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  security(res);
  if (req.url === '/healthz') { res.setHeader('content-type', 'text/plain'); return res.end('ok'); }
  const wait = perIp(clientIp(req));
  if (wait) return tooMany(res, wait);
  cache(req, res, () => serveStatic(req, res));
});
// slow or stuck clients must not hold connections open
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.listen(PORT, '0.0.0.0', () => console.log(`landlord on :${PORT}, data in ${DATA}`));

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
