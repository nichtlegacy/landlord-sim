// Client for the server-side result cache (see vite.config.ts).

/** 64-bit FNV-1a as hex; crypto.subtle is unavailable on plain-http LAN addresses */
export function hashKey(text: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
    h2 ^= h2 >>> 15;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export type CacheKind = 'result' | 'variants' | 'sensitivity';

/**
 * Bump whenever the engine or the bots decide differently for the same setup (a rule fix, a
 * policy change). Entries from another version are ignored, so nobody sees stale results.
 */
export const ENGINE_VERSION = 7;

export async function cacheGet<T>(kind: CacheKind, key: string): Promise<T | null> {
  try {
    const res = await fetch(`/api/cache/${kind}/${key}`, { cache: 'no-store' });
    const data = res.ok ? await res.json() : null;
    return data && data.v === ENGINE_VERSION ? (data as T) : null;
  } catch {
    return null; // no cache server (e.g. static hosting): simply compute
  }
}

/** the server accepts up to 8 MB (server/cache.ts); bigger results are not worth the upload */
const MAX_UPLOAD = 8 * 1024 * 1024;

export function cachePut(kind: CacheKind, key: string, data: unknown) {
  const body = JSON.stringify({ ...(data as object), v: ENGINE_VERSION });
  if (body.length > MAX_UPLOAD) return;
  fetch(`/api/cache/${kind}/${key}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body })
    .catch(() => { /* cache is best effort */ });
}
