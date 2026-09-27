// npm run sim -- [--games 20000] [--seed 1] [--profiles balanced,balanced,balanced] [--sensitivity] [--replay SEED]
//                [--audit N] [--fuzz N] [--validate friedman|seats|crn]
import { parseArgs } from 'node:util';
import { classicRules, classic } from '../editions/classic';
import { grandRules, grand } from '../editions/grand';
import { exampleEndgame, exampleRules } from '../scenarios/example';
import { STYLE_IDS } from '../engine/policy';
import { audit } from '../engine/audit';
import { newGameScenario } from '../engine/state';
import type { RuleConfig } from '../engine/types';
import { eventText } from '../ui/events';
import { fuzz } from './fuzz';
import { run, replay, wilson, type RunConfig, type RunStats } from './runner';

const { values: a } = parseArgs({
  options: {
    games: { type: 'string' },
    seed: { type: 'string', default: '1' },
    profiles: { type: 'string', default: 'balanced,balanced,balanced' },
    sensitivity: { type: 'boolean', default: false },
    replay: { type: 'string' },
    audit: { type: 'string' },
    fuzz: { type: 'string' },
    validate: { type: 'string' },
  },
});

const scenario = exampleEndgame;
const names = scenario.players.map((p) => p.name);
const variants: Record<string, RuleConfig> = {
  'A Example house rules': exampleRules(),
  'B Example rules without trading': { ...exampleRules(), trading: false },
  'C Example rules without single-site building (H10)': exampleRules({ singleSite: false }),
  'D Official rules': grandRules,
  'E Example rules, no buying after the snapshot': { ...exampleRules(), buying: false },
  'F Example rules, no buying or building': { ...exampleRules(), buying: false, building: false },
};
const games = (fallback: number) => Number(a.games ?? fallback);
const seed = Number(a.seed);
const base = { edition: grand, scenario, games: games(20000), seed, profiles: a.profiles!.split(',') };
const pct = (x: number) => `${(x * 100).toFixed(1).padStart(5)} %`;
const ci = ([lo, hi]: [number, number]) => `${pct(lo).trim()} – ${pct(hi).trim()}`;
const median = (xs: number[]) => [...xs].sort((x, y) => x - y)[xs.length >> 1];
const timed = (cfg: RunConfig) => { const t = performance.now(); const st = run(cfg); return { st, s: (performance.now() - t) / 1000 }; };

if (a.replay) {
  const r = replay({ ...base, rules: variants['A Example house rules'] }, Number(a.replay));
  for (const f of r.frames) for (const e of f.events) console.log(`R${String(e.round).padStart(3)} ${names[e.player].padEnd(6)} ${eventText(e, { names, ed: grand, lang: 'en' })}`);
  console.log(`\nWinner: ${names[r.winner]}${r.timeout ? ' (round cap)' : ''} after ${r.frames.at(-1)!.round} rounds`);
  process.exit(0);
}

if (a.audit) {
  for (const [label, rules] of Object.entries(variants)) {
    const r = audit(grand, rules, scenario, Number(a.audit), seed);
    console.log(`${label}: ${r.games} games, ${r.rolls} rolls, ${r.builds} build steps, ${r.trades} trades checked, ${r.violations.length} violations`);
    for (const v of r.violations) console.log(`  ${v}`);
  }
  process.exit(0);
}

if (a.fuzz) {
  const t = performance.now();
  const r = fuzz(Number(a.fuzz), seed);
  console.log(`Fuzzing: ${r.games} games with random editions, rules, positions and bots, ${r.rolls} rolls, ${r.builds} build steps, ${r.trades} trades, ${((performance.now() - t) / 1000).toFixed(1)} s, ${r.violations.length} violations`);
  for (const v of r.violations) console.log(`  ${v}`);
  process.exit(r.violations.length ? 1 : 0);
}

/** share of games still running after n rounds, with a 95% Wilson interval */
const survival = (st: RunStats, n: number) => { const k = st.rounds.filter((r) => r > n).length; return { p: k / st.games, ci: wilson(k, st.games) }; };

if (a.validate === 'friedman') {
  // Friedman et al. 2009: two players, one roll per turn, reserve max(200, highest rent), no bids, no trades,
  // stay in jail until the third miss. Published: 0.12 ± 0.01 of games still going after 10,000 rounds.
  const n = games(3100);
  const cfg: RunConfig = {
    edition: classic, rules: { ...classicRules, doublesAgain: false, roundCap: 10_000 },
    scenario: newGameScenario(classic, ['A', 'B']), profiles: ['friedman', 'friedman'], games: n, seed, rotateStart: true,
  };
  const { st, s } = timed(cfg);
  console.log(`Friedman reproduction: ${n} games, 2 players, classic board, ${s.toFixed(0)} s\n`);
  console.log('rounds n   still running   95% interval');
  for (const r of [50, 100, 200, 500, 1000, 2000, 5000, 9999]) {
    const v = survival(st, r);
    console.log(`${String(r).padStart(7)}   ${pct(v.p)}      ${ci(v.ci)}`);
  }
  console.log('\nFriedman et al. 2009: 12% ± 1% after 10,000 rounds (3,100 games).');
  process.exit(0);
}

if (a.validate === 'seats') {
  // who moves first: identical bots, rotating starts, so the seat is the only difference
  const n = games(100_000);
  const setups: [string, RunConfig][] = [2, 3, 4, 6].map((np) => [`Classic, ${np} players`, {
    edition: classic, rules: classicRules, scenario: newGameScenario(classic, Array.from({ length: np }, (_, i) => `P${i + 1}`)),
    profiles: Array(np).fill('balanced'), games: n, seed, rotateStart: true,
  }]);
  setups.push(['Grand, 4 players', {
    edition: grand, rules: grandRules, scenario: newGameScenario(grand, ['P1', 'P2', 'P3', 'P4']),
    profiles: Array(4).fill('balanced'), games: n, seed, rotateStart: true,
  }]);
  setups.push(['Classic, 4 players, no trading', {
    edition: classic, rules: { ...classicRules, trading: false }, scenario: newGameScenario(classic, ['P1', 'P2', 'P3', 'P4']),
    profiles: Array(4).fill('balanced'), games: n, seed, rotateStart: true,
  }]);
  for (const [label, cfg] of setups) {
    const { st, s } = timed(cfg);
    const np = cfg.scenario.players.length;
    console.log(`${label} (${n} games, fair ${pct(1 / np).trim()}, ${s.toFixed(0)} s, median ${median(st.rounds)} rounds, cap ${pct(st.timeouts / st.games).trim()})`);
    st.seatWins.forEach((w, k) => console.log(`  seat ${k + 1}     ${pct(w / st.games)}   (${ci(wilson(w, st.games))})`));
  }
  process.exit(0);
}

if (a.validate === 'crn') {
  // how much pairing by seed narrows the error of a difference between two rule variants
  const n = games(4000);
  const pairs: [string, RunConfig, RuleConfig, RuleConfig][] = [
    ['Classic, 4 players: official vs free parking pot', {
      edition: classic, rules: classicRules, scenario: newGameScenario(classic, ['P1', 'P2', 'P3', 'P4']),
      profiles: ['balanced', 'aggressive', 'cautious', 'balanced'], games: n, seed,
    }, classicRules, { ...classicRules, freeParkingPot: true }],
    ['Example end game: house rules vs without H10', { ...base, games: n, rules: exampleRules() }, exampleRules(), exampleRules({ singleSite: false })],
    ['Example end game: house rules vs no trading', { ...base, games: n, rules: exampleRules() }, exampleRules(), { ...exampleRules(), trading: false }],
  ];
  for (const [label, cfg, ra, rb] of pairs) {
    const A = run({ ...cfg, rules: ra }), B = run({ ...cfg, rules: rb }), C = run({ ...cfg, rules: rb, seed: seed + 7919 });
    const np = cfg.scenario.players.length;
    console.log(`${label} (${n} games per run)`);
    for (let i = 0; i < np; i++) {
      const se = (x: RunStats, y: RunStats) => {
        const d = x.samples.map((sm, k) => (sm.winner === i ? 1 : 0) - (y.samples[k].winner === i ? 1 : 0));
        const m = d.reduce((s, v) => s + v, 0) / d.length;
        return { m, se: Math.sqrt(d.reduce((s, v) => s + (v - m) ** 2, 0) / (d.length - 1) / d.length) };
      };
      const paired = se(A, B), indep = se(A, C);
      console.log(`  player ${i + 1}: Δ ${(paired.m * 100).toFixed(1).padStart(5)} pp, standard error paired ${(paired.se * 100).toFixed(2)} pp, independent ${(indep.se * 100).toFixed(2)} pp → ${(indep.se / paired.se) ** 2 > 1 ? `${((indep.se / paired.se) ** 2).toFixed(1)}× fewer games needed` : 'no gain'}`);
    }
  }
  process.exit(0);
}

if (a.sensitivity) {
  console.log(`Profile combinations, variant A, ${base.games} games each\n`);
  console.log(`${names.map((n) => n.padEnd(11)).join('')}| ${names.map((n) => n.padStart(8)).join('')}`);
  for (const x of STYLE_IDS) for (const y of STYLE_IDS) for (const z of STYLE_IDS) {
    const st = run({ ...base, rules: variants['A Example house rules'], profiles: [x, y, z] });
    console.log(`${[x, y, z].map((s) => s.padEnd(11)).join('')}| ${st.wins.map((w) => pct(w / st.games).padStart(8)).join('')}`);
  }
  process.exit(0);
}

console.log(`Example end game · ${base.games} games per variant · profiles ${base.profiles.join('/')}\n`);
for (const [label, rules] of Object.entries(variants)) {
  const { st, s } = timed({ ...base, rules });
  console.log(label);
  st.wins.forEach((w, i) => {
    const cap = st.capWins[i] ? `, ${pct(st.capWins[i] / st.games).trim()} at the round cap` : '';
    console.log(`  ${names[i].padEnd(6)} ${pct(w / st.games)}   (${ci(st.ci[i])}${cap})`);
  });
  console.log(`  median ${median(st.rounds)} rounds · round cap ${pct(st.timeouts / st.games).trim()} · ${(st.trades / st.games).toFixed(1)} trades/game · ${(st.games / s).toFixed(0)} games/s\n`);
}
