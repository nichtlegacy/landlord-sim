// Browser worker: plays a range of games and reports progress.
import { runRange, type RunConfig } from './runner';

export type WorkerIn = { id: number; cfg: RunConfig; from: number; to: number };
export type WorkerOut =
  | { id: number; type: 'progress'; games: number; wins: number[] }
  | { id: number; type: 'done'; stats: ReturnType<typeof runRange> };

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const { id, cfg, from, to } = e.data;
  const stats = runRange(cfg, from, to, (s) => postMessage({ id, type: 'progress', games: s.games, wins: s.wins } satisfies WorkerOut));
  postMessage({ id, type: 'done', stats } satisfies WorkerOut);
};
