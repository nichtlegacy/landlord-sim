// npm run bake: precomputes the example end game so a static host (GitHub Pages) shows a finished
// result on the first visit. Writes public/precomputed/result/<key>.json, the same entry the app
// stores in the cache server; `vite build` then copies it into dist/.
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_VERSION, hashKey } from '../ui/cache';
import { presetExample, setupKey } from '../ui/model';
import { configFor } from '../ui/useSimulation';
import { run } from './runner';

const setup = presetExample();
const key = setupKey(setup);
const t = performance.now();
const stats = run(configFor(setup));
const file = path.resolve('public/precomputed/result', `${hashKey(key)}.json`);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ stats, key, setup, v: ENGINE_VERSION }));
console.log(`baked ${stats.games} games in ${((performance.now() - t) / 1000).toFixed(1)} s: ${path.relative(process.cwd(), file)}`);
