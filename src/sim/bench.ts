// npm run bench -- [--games 4000] [--only classic]
// Speed of the engine on three typical setups, plus a fingerprint of the results: with a fixed
// seed, an optimisation must leave the fingerprint unchanged, otherwise it changed the game.
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { classicRules, classic } from '../editions/classic';
import { grandRules, grand } from '../editions/grand';
import { newGameScenario } from '../engine/state';
import { applyAmounts, applyHouseRules } from '../house-rules';
import { EXAMPLE_AMOUNTS, EXAMPLE_HOUSE_RULES } from '../scenarios/example';
import { exampleEndgame } from '../scenarios/example';
import { run, type RunConfig } from './runner';

const { values } = parseArgs({ options: { games: { type: 'string', default: '4000' }, only: { type: 'string' } } });
const games = Number(values.games);
const setups: [string, RunConfig][] = [
  ['Grand, example end game, house rules', { edition: grand, rules: applyAmounts(applyHouseRules(grandRules, EXAMPLE_HOUSE_RULES), EXAMPLE_AMOUNTS), scenario: exampleEndgame, profiles: ['balanced', 'balanced', 'balanced'], games, seed: 1 }],
  ['Grand, example end game, official', { edition: grand, rules: grandRules, scenario: exampleEndgame, profiles: ['balanced', 'aggressive', 'cautious'], games, seed: 1 }],
  ['Classic, new game, 4 players', { edition: classic, rules: classicRules, scenario: newGameScenario(classic, ['A', 'B', 'C', 'D']), profiles: ['balanced', 'balanced', 'balanced', 'balanced'], games, seed: 1 }],
];

run({ ...setups[0][1], games: 200 }); // warm up the JIT
let total = 0;
for (const [label, cfg] of setups) {
  if (values.only && !label.toLowerCase().includes(values.only.toLowerCase())) continue;
  const t = performance.now();
  const st = run(cfg);
  const ms = performance.now() - t;
  total += ms;
  const print = createHash('sha1').update(JSON.stringify([st.wins, st.rounds, st.bankruptBy, st.trajectories])).digest('hex').slice(0, 12);
  console.log(`${label.padEnd(38)} ${String(Math.round((games / ms) * 1000)).padStart(6)} games/s   fingerprint ${print}`);
}
console.log(`total ${(total / 1000).toFixed(2)} s`);
