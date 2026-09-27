// Runs simulations in the worker pool. One job at a time; starting a job cancels the previous one.
import { useCallback, useRef, useState } from 'react';
import type { RunConfig, RunStats } from '../sim/runner';
import { EDITIONS, rulesFor, setupKey, type Setup } from './model';
import { isResultEntry } from '../../server/shape.ts';
import { cacheGet, cachePut, hashKey } from './cache';
import { runInPool, type Job } from './pool';

export interface Live { games: number; total: number; wins: number[] }

export function configFor(setup: Setup, overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    edition: EDITIONS[setup.editionId].edition,
    rules: rulesFor(setup),
    scenario: setup.scenario,
    profiles: setup.profiles,
    games: setup.games,
    seed: setup.seed,
    rotateStart: !!setup.rotateStart,
    ...overrides,
  };
}

let active: Job | null = null;

/** run one config; resolves null when cancelled */
export async function runJob(cfg: RunConfig, onLive?: (l: Live) => void): Promise<RunStats | null> {
  active?.cancel();
  const job = runInPool(cfg, (games, wins) => onLive?.({ games, total: cfg.games, wins }));
  active = job;
  try {
    return await job.promise;
  } finally {
    if (active === job) active = null;
  }
}

export function cancelJobs() {
  active?.cancel();
  active = null;
}

export function useSimulation() {
  const [result, setResult] = useState<{ stats: RunStats; key: string; setup: Setup } | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = useRef(0);

  const run = useCallback(async (setup: Setup) => {
    const t = ++token.current;
    setError(null);
    setLive({ games: 0, total: setup.games, wins: setup.scenario.players.map(() => 0) });
    try {
      const stats = await Promise.race([
        runJob(configFor(setup), (l) => t === token.current && setLive(l)),
        new Promise<null>((resolve) => { cancelRef.current = () => resolve(null); }),
      ]);
      if (t !== token.current) return;
      if (stats) {
        const key = setupKey(setup);
        const entry = { stats, key, setup: structuredClone(setup) };
        setResult(entry);
        cachePut('result', hashKey(key), entry);
      }
    } catch (e) {
      if (t === token.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (t === token.current) setLive(null);
    }
  }, []);

  const cancelRef = useRef<() => void>(() => {});
  const cancel = useCallback(() => {
    token.current++;
    cancelJobs();
    cancelRef.current();
    setLive(null);
  }, []);

  /** page load: show the cached result for this setup, else the latest one, else simulate */
  const load = useCallback(async (setup: Setup) => {
    const t = ++token.current;
    const key = setupKey(setup);
    type Entry = { stats: RunStats; key: string; setup: Setup };
    const hit = (await cacheGet<Entry>('result', hashKey(key))) ?? (await cacheGet<Entry>('result', 'latest'));
    if (t !== token.current) return;
    // the key is recomputed so an older cache format never looks fresh by accident
    // anything malformed in the shared cache is ignored, the browser simply simulates again
    if (isResultEntry(hit) && EDITIONS[hit!.setup.editionId]) setResult({ ...hit!, key: setupKey(hit!.setup) });
    else run(setup);
  }, [run]);

  return { result, live, error, run, load, cancel };
}
