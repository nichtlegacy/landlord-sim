// Result cache behind GET/PUT /api/cache/<kind>/<key>, shared by the Vite dev server and the
// production server. The simulation itself runs in the visitor's browser; this cache is the
// only thing a visitor can write to the server, so it carries every limit: rate per IP, a
// global write budget, body size, shape check, and a disk quota that evicts the oldest files.
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isResultEntry } from './shape.ts';

export interface CacheOptions {
  dir: string;
  /** largest accepted body; 20k games are ~3 MB, 50k ~7.5 MB (bigger runs are simply not cached) */
  maxBody: number;
  /** disk quota over all kinds; oldest files go first */
  maxBytes: number;
  maxFiles: number;
  /**
   * uploads parsed at the same time; checking a 15 MB result briefly needs ~150 MB of heap,
   * so the container's memory limit is only safe with a small number here
   */
  maxParallelPuts: number;
  /** per client IP */
  getLimit: Limit;
  putLimit: Limit;
  /** over all clients, so many IPs together cannot fill the disk either */
  putGlobal: Limit;
}
export interface Limit { max: number; windowMs: number }

const KINDS = new Set(['result', 'variants', 'sensitivity']);
const ROUTE = /^\/api\/cache\/([a-z]+)\/([a-z0-9]{1,64})$/;

/** fixed-window counter per key; `take` answers how long to wait, 0 = allowed */
export function rateLimiter({ max, windowMs }: Limit) {
  const hits = new Map<string, { n: number; reset: number }>();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs);
  timer.unref();
  return (key: string): number => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset <= now) { hits.set(key, { n: 1, reset: now + windowMs }); return 0; }
    if (h.n >= max) return h.reset - now;
    h.n++;
    return 0;
  };
}

/**
 * Real visitor address. Cloudflare sets CF-Connecting-IP and a client cannot forge it through
 * Cloudflare; X-Forwarded-For is only used when there is no Cloudflare in front (first hop).
 */
export function clientIp(req: IncomingMessage): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf.trim();
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

/** just enough structure that a stored entry cannot break the page for the next visitor */
function validShape(kind: string, v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, any>;
  if (kind === 'result') return isResultEntry(o);
  return Array.isArray(o.rows) && o.rows.length <= 200;
}

export function tooMany(res: ServerResponse, waitMs: number) {
  res.statusCode = 429;
  res.setHeader('retry-after', String(Math.ceil(waitMs / 1000)));
  res.setHeader('content-type', 'application/json');
  res.end('{"error":"rate_limited"}');
}

/** drop the oldest entries until the quota holds; `latest.json` files are kept */
function enforceQuota(dir: string, maxBytes: number, maxFiles: number) {
  const files: { file: string; size: number; mtime: number }[] = [];
  for (const kind of KINDS) {
    const d = path.join(dir, kind);
    if (!fs.existsSync(d)) continue;
    for (const name of fs.readdirSync(d)) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(d, name);
      const st = fs.statSync(file);
      files.push({ file, size: st.size, mtime: st.mtimeMs });
    }
  }
  let bytes = files.reduce((s, f) => s + f.size, 0);
  let count = files.length;
  const victims = files.filter((f) => path.basename(f.file) !== 'latest.json').sort((a, b) => a.mtime - b.mtime);
  for (const v of victims) {
    if (bytes <= maxBytes && count <= maxFiles) break;
    fs.rmSync(v.file, { force: true });
    bytes -= v.size;
    count--;
  }
}

export function createCacheHandler(opts: CacheOptions) {
  const getLimit = rateLimiter(opts.getLimit);
  const putLimit = rateLimiter(opts.putLimit);
  const putGlobal = rateLimiter(opts.putGlobal);
  let inFlight = 0;

  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const m = req.url?.match(ROUTE);
    if (!m) return next();
    const [, kind, key] = m;
    if (!KINDS.has(kind)) { res.statusCode = 404; return res.end(); }
    const ip = clientIp(req);
    const file = path.join(opts.dir, kind, `${key}.json`);
    res.setHeader('cache-control', 'no-store');

    if (req.method === 'GET') {
      const wait = getLimit(ip);
      if (wait) return tooMany(res, wait);
      res.setHeader('content-type', 'application/json');
      // a miss is an ordinary answer ("null"), not an error in the browser console
      if (!fs.existsSync(file)) return res.end('null');
      fs.createReadStream(file).pipe(res);
      return;
    }

    if (req.method === 'PUT' && key !== 'latest') {
      const wait = putLimit(ip) || putGlobal('*');
      if (wait) { req.resume(); return tooMany(res, wait); }
      const declared = Number(req.headers['content-length'] ?? 0);
      if (declared > opts.maxBody) { req.resume(); res.statusCode = 413; return res.end(); }
      if (inFlight >= opts.maxParallelPuts) {
        // busy: the browser just skips caching this result
        req.resume();
        res.statusCode = 503;
        res.setHeader('retry-after', '5');
        return res.end();
      }
      inFlight++;
      let released = false;
      const release = () => { if (!released) { released = true; inFlight--; } };
      req.on('close', release);
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > opts.maxBody) { res.statusCode = 413; res.end(); req.destroy(); }
        else chunks.push(c);
      });
      req.on('end', () => {
        if (res.writableEnded) return release();
        const body = Buffer.concat(chunks);
        chunks.length = 0;
        let parsed: unknown;
        try { parsed = JSON.parse(body.toString('utf8')); } catch { release(); res.statusCode = 400; return res.end(); }
        const ok = validShape(kind, parsed);
        parsed = null; // let the parsed copy go before writing
        if (!ok) { release(); res.statusCode = 422; return res.end(); }
        fs.mkdirSync(path.dirname(file), { recursive: true });
        // write-then-rename, so a reader never sees half a file
        const tmp = `${file}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, body);
        fs.renameSync(tmp, file);
        fs.copyFileSync(file, path.join(opts.dir, kind, 'latest.json'));
        enforceQuota(opts.dir, opts.maxBytes, opts.maxFiles);
        release();
        res.statusCode = 204;
        res.end();
      });
      return;
    }

    res.statusCode = 405;
    res.end();
  };
}

/** production defaults; env can override for the host */
export function cacheOptionsFromEnv(env: NodeJS.ProcessEnv, dir: string): CacheOptions {
  const n = (k: string, d: number) => (env[k] && Number.isFinite(Number(env[k])) ? Number(env[k]) : d);
  const MB = 1024 * 1024;
  return {
    dir,
    maxBody: n('CACHE_MAX_BODY_MB', 8) * MB,
    maxBytes: n('CACHE_MAX_TOTAL_MB', 512) * MB,
    maxFiles: n('CACHE_MAX_FILES', 500),
    maxParallelPuts: n('CACHE_MAX_PARALLEL_PUTS', 1),
    getLimit: { max: n('RATE_CACHE_GET_PER_MIN', 120), windowMs: 60_000 },
    putLimit: { max: n('RATE_CACHE_PUT_PER_10MIN', 20), windowMs: 600_000 },
    putGlobal: { max: n('RATE_CACHE_PUT_GLOBAL_PER_HOUR', 300), windowMs: 3_600_000 },
  };
}
