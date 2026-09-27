// Worker pool: splits a run into ranges, one per core, and merges the results.
import { mergeStats, type RunConfig, type RunStats } from '../sim/runner';
import type { WorkerIn, WorkerOut } from '../sim/worker';

const SIZE = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
let workers: Worker[] = [];
let nextId = 1;

const spawn = () => new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });

/** promise resolves null once cancelled */
export interface Job { promise: Promise<RunStats | null>; cancel: () => void }

export function runInPool(cfg: RunConfig, onProgress?: (games: number, wins: number[]) => void): Job {
  if (!workers.length) workers = Array.from({ length: SIZE }, spawn);
  const id = nextId++;
  const n = Math.min(workers.length, Math.max(1, Math.ceil(cfg.games / 500)));
  const per = Math.ceil(cfg.games / n);
  const progress = new Array(n).fill(null).map(() => ({ games: 0, wins: new Array(cfg.scenario.players.length).fill(0) }));
  const parts: RunStats[] = [];
  let cancelled = false;
  let settle: (v: null) => void = () => {};

  const promise = new Promise<RunStats | null>((resolve, reject) => {
    settle = resolve;
    workers.slice(0, n).forEach((w, k) => {
      w.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data;
        if (m.id !== id || cancelled) return;
        if (m.type === 'progress') {
          progress[k] = { games: m.games, wins: m.wins };
          const games = progress.reduce((a, p) => a + p.games, 0);
          const wins = progress[0].wins.map((_, i) => progress.reduce((a, p) => a + p.wins[i], 0));
          onProgress?.(games, wins);
        } else {
          parts.push(m.stats);
          if (parts.length === n) resolve(mergeStats(parts));
        }
      };
      w.onerror = (err) => reject(err);
      const from = k * per, to = Math.min(cfg.games, from + per);
      w.postMessage({ id, cfg, from, to } satisfies WorkerIn);
    });
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      workers.forEach((w) => w.terminate());
      workers = [];
      settle(null);
    },
  };
}

export const poolSize = SIZE;
