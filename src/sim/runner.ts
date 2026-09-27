// Monte-Carlo runner: many seeded games from one scenario, aggregated.
// Pure data in and out, so it runs the same in the CLI and in browser workers.
import { Game } from '../engine/game';
import { createPolicy } from '../engine/policy';
import { createRng } from '../engine/rng';
import { buildState, type Scenario } from '../engine/state';
import type { Edition, GameEvent, RuleConfig } from '../engine/types';

export interface RunConfig {
  edition: Edition;
  rules: RuleConfig;
  scenario: Scenario;
  /** profile id per player */
  profiles: string[];
  games: number;
  seed: number;
  /** rotate who starts: game k starts with player (current + k) mod n, so no seat is favoured */
  rotateStart?: boolean;
}

/** net worth per player and round for a sample of games (for percentile bands) */
export const TRAJ_ROUNDS = 150;
const TRAJ_EVERY = 25; // keep every 25th game

export interface RunStats {
  games: number;
  wins: number[];
  /** 95% Wilson interval per player */
  ci: [number, number][];
  /** wins decided by net worth at the round cap (the rest are wins by bankrupting everyone else) */
  capWins: number[];
  /** wins by seat: 0 = the player who moved first in that game */
  seatWins: number[];
  /** trades made, over all games */
  trades: number;
  timeouts: number;
  /** rounds until the game ended, one entry per game */
  rounds: number[];
  /** bankruptBy[victim][creditor]; creditor index = players.length for the bank */
  bankruptBy: number[][];
  /** game index, seed, starting player, winner and length of every game (replay and paired comparisons use these) */
  samples: Sample[];
  /** trajectories[game][round][player] = net worth */
  trajectories: number[][][];
}

export interface Sample { k: number; seed: number; start: number; winner: number; rounds: number; timeout: boolean }

export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export const gameSeed = (seed: number, k: number) => (Math.imul(seed, 0x2c1b3c6d) + Math.imul(k + 1, 0x9e3779b1)) >>> 0;

/** who starts game k */
export const startOf = (cfg: RunConfig, k: number) =>
  cfg.rotateStart ? (cfg.scenario.current + k) % cfg.scenario.players.length : cfg.scenario.current;

function newGame(cfg: RunConfig, seed: number, start: number) {
  const rng = createRng(seed);
  const state = buildState(cfg.edition, cfg.scenario, rng, { unlimitedSupply: cfg.rules.unlimitedSupply });
  state.current = start;
  // bots that decide at random draw from their own stream, so dice and cards stay paired across runs
  const botRng = createRng(seed ^ 0x5bd1e995);
  const policies = cfg.profiles.map((id) => createPolicy(id, botRng));
  return new Game(cfg.edition, cfg.rules, state, policies, rng);
}

export function emptyStats(np: number): RunStats {
  return {
    games: 0, wins: new Array(np).fill(0), ci: [], capWins: new Array(np).fill(0), seatWins: new Array(np).fill(0), trades: 0,
    timeouts: 0, rounds: [], samples: [], trajectories: [],
    bankruptBy: Array.from({ length: np }, () => new Array(np + 1).fill(0)),
  };
}

/** play games [from, to) of the run */
export function runRange(cfg: RunConfig, from: number, to: number, onProgress?: (s: RunStats) => void): RunStats {
  const np = cfg.scenario.players.length;
  const st = emptyStats(np);
  for (let k = from; k < to; k++) {
    const seed = gameSeed(cfg.seed, k), start = startOf(cfg, k);
    const g = newGame(cfg, seed, start);
    let traj: number[][] | null = null;
    if (k % TRAJ_EVERY === 0) {
      const t: number[][] = [np ? g.s.players.map((_, i) => g.netWorth(i)) : []];
      traj = t;
      g.onRound = (gm) => { if (t.length < TRAJ_ROUNDS) t.push(gm.s.players.map((_, i) => gm.netWorth(i))); };
    }
    const r = g.run();
    if (traj) {
      while (traj.length < TRAJ_ROUNDS) traj.push(r.netWorth);
      st.trajectories.push(traj);
    }
    st.games++;
    st.wins[r.winner]++;
    st.seatWins[(r.winner - start + np) % np]++;
    st.trades += r.trades;
    if (r.timeout) { st.timeouts++; st.capWins[r.winner]++; }
    st.rounds.push(r.rounds);
    st.samples.push({ k, seed, start, winner: r.winner, rounds: r.rounds, timeout: r.timeout });
    r.out.forEach((o, v) => { if (o) st.bankruptBy[v][o.to < 0 ? np : o.to]++; });
    if (onProgress && st.games % 250 === 0) onProgress(finish(st));
  }
  return finish(st);
}

export const run = (cfg: RunConfig, onProgress?: (s: RunStats) => void) => runRange(cfg, 0, cfg.games, onProgress);

export function mergeStats(parts: RunStats[]): RunStats {
  const out = emptyStats(parts[0].wins.length);
  for (const s of parts) {
    out.games += s.games;
    out.timeouts += s.timeouts;
    out.trades += s.trades ?? 0;
    s.wins.forEach((w, i) => (out.wins[i] += w));
    s.capWins?.forEach((w, i) => (out.capWins[i] += w));
    s.seatWins?.forEach((w, i) => (out.seatWins[i] += w));
    s.bankruptBy.forEach((row, v) => row.forEach((c, j) => (out.bankruptBy[v][j] += c)));
    out.rounds.push(...s.rounds);
    out.samples.push(...s.samples);
    out.trajectories.push(...s.trajectories);
  }
  // workers finish in any order; game order keeps the convergence chart and replay picks deterministic
  out.samples.sort((a, b) => a.k - b.k);
  return finish(out);
}

function finish(st: RunStats): RunStats {
  return { ...st, ci: st.wins.map((w) => wilson(w, st.games)) };
}

// ------------------------------------------------------------------ replay

export interface Frame {
  round: number;
  player: number;
  events: GameEvent[];
  pos: number[];
  cash: number[];
  inJail: boolean[];
  bankrupt: boolean[];
  owner: number[];
  level: number[];
  depot: boolean[];
  mortgaged: boolean[];
  pot: number;
  /** bus tickets still in the stack */
  busLeft: number;
}

export function replay(cfg: RunConfig, seed: number, start = cfg.scenario.current): { frames: Frame[]; winner: number; timeout: boolean } {
  const g = newGame(cfg, seed, start);
  g.log = [];
  const frame = (player: number, events: GameEvent[], round = g.s.round): Frame => ({
    round, player, events,
    pos: g.s.players.map((p) => p.pos),
    cash: g.s.players.map((p) => p.cash),
    inJail: g.s.players.map((p) => p.inJail),
    bankrupt: g.s.players.map((p) => p.bankrupt),
    owner: [...g.s.owner], level: [...g.s.level], depot: [...g.s.depot], mortgaged: [...g.s.mortgaged],
    pot: g.s.pot,
    busLeft: g.s.decks.bus.length,
  });
  const frames = [frame(-1, [])];
  while (g.activePlayers().length > 1 && g.s.round <= cfg.rules.roundCap) {
    const p = g.s.current, from = g.log.length, round = g.s.round;
    g.playTurn();
    frames.push(frame(p, g.log.slice(from), round));
  }
  const r = g.run(); // already finished: computes the result without playing
  return { frames, winner: r.winner, timeout: r.timeout };
}
