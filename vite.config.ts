import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { cacheOptionsFromEnv, createCacheHandler } from './server/cache.ts';

/** the same result cache as in production (server/cache.ts), with generous limits for local work */
function resultCache(): Plugin {
  const handler = createCacheHandler({
    ...cacheOptionsFromEnv(process.env, path.resolve('.cache/results')),
    getLimit: { max: 10_000, windowMs: 60_000 },
    putLimit: { max: 10_000, windowMs: 60_000 },
    putGlobal: { max: 10_000, windowMs: 60_000 },
    maxParallelPuts: 8,
  });
  return {
    name: 'result-cache',
    configureServer: (server) => { server.middlewares.use(handler); },
    configurePreviewServer: (server) => { server.middlewares.use(handler); },
  };
}

export default defineConfig({
  plugins: [react(), resultCache()],
  server: { host: '0.0.0.0', port: 5180, watch: { ignored: ['**/.cache/**'] } },
  preview: { host: '0.0.0.0', port: 5180 },
  worker: { format: 'es' },
});
