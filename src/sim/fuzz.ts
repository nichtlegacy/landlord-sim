// Fuzzing: random editions, rule combinations, positions and bots (random legal moves mixed with
// heuristics), each game checked by the rule audit. Finds corners the regular tests never reach.
import { classicRules, classic } from '../editions/classic';
import { grandRules, grand } from '../editions/grand';
import { audit } from '../engine/audit';
import { PROFILES } from '../engine/policy';
import { createRng, type Rng } from '../engine/rng';
import { newGameScenario, type Scenario } from '../engine/state';
import type { Edition, RuleConfig } from '../engine/types';
import { applyAmounts, applyHouseRules, HOUSE_RULES } from '../house-rules';

const EDITIONS: [Edition, RuleConfig][] = [[grand, grandRules], [classic, classicRules]];

export interface FuzzReport { games: number; rolls: number; builds: number; trades: number; violations: string[] }

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(xs.length)];
const coin = (rng: Rng, p = 0.5) => rng.next() < p;

function randomRules(rng: Rng, official: RuleConfig): { rules: RuleConfig; label: string } {
  const on = HOUSE_RULES.filter((h) => (!h.needsSpeedDie || official.speedDie) && coin(rng, 0.4)).map((h) => h.id);
  const base = applyAmounts(applyHouseRules(official, on), {
    goPass: pick(rng, [0, 100, 200, 400]), goLand: pick(rng, [0, 200, 400]), jailFine: pick(rng, [0, 50, 100, 200]),
  });
  const rules: RuleConfig = {
    ...base,
    trading: coin(rng, 0.8), doublesAgain: coin(rng, 0.8), buying: coin(rng, 0.9), building: coin(rng, 0.9),
    roundCap: 120,
  };
  return { rules, label: `${on.join(',') || 'official'} trade=${rules.trading} doubles=${rules.doublesAgain}` };
}

/** a random but consistent position: owners, even buildings on sets within the supply, mortgages, cash, jail */
function randomScenario(rng: Rng, ed: Edition, n: number, unlimited: boolean): Scenario {
  const sc = newGameScenario(ed, Array.from({ length: n }, (_, i) => `P${i + 1}`));
  if (coin(rng, 0.4)) { sc.current = rng.int(n); return sc; }
  const owner = ed.spaces.map((sp) => (sp.type === 'street' || sp.type === 'station' || sp.type === 'utility') && coin(rng, 0.7) ? rng.int(n) : -1);
  const level = ed.spaces.map(() => 0);
  const supply = { ...ed.supply };
  for (const members of Object.values(ed.groups)) {
    const o = owner[members[0]];
    if (o < 0 || !members.every((i) => owner[i] === o) || !coin(rng, 0.6)) continue;
    const lvl = 1 + rng.int(ed.maxLevel);
    for (const i of members) {
      // stay within the supply unless it is unlimited; buildings are placed evenly
      const need = lvl <= 4 ? { houses: lvl } : lvl === 5 ? { hotels: 1 } : { skyscrapers: 1 };
      const [k, v] = Object.entries(need)[0] as [keyof typeof supply, number];
      if (!unlimited && supply[k] < v) break;
      supply[k] -= v;
      level[i] = lvl;
    }
    if (members.some((i) => level[i] !== lvl)) for (const i of members) level[i] = 0;
  }
  sc.properties = owner.flatMap((o, i) => {
    if (o < 0) return [];
    const sp = ed.spaces[i];
    const built = sp.type === 'street' && ed.groups[sp.group!].some((j) => level[j] > 0);
    const depot = sp.type === 'station' && ed.supply.depots > 0 && coin(rng, 0.3);
    return [{ space: i, owner: o, level: level[i], depot, mortgaged: !built && !depot && coin(rng, 0.2) }];
  });
  // depots within the supply
  let depots = ed.supply.depots;
  for (const pr of sc.properties) if (pr.depot && (unlimited ? false : depots-- <= 0)) pr.depot = false;
  const held = { chance: false, community_chest: false };
  sc.players.forEach((pl) => {
    const c = rng.int(4000);
    pl.cash = [c, c + rng.int(300)];
    pl.pos = rng.int(ed.spaces.length);
    if (coin(rng, 0.15)) { pl.inJail = true; pl.pos = ed.jailIndex; pl.jailTurns = rng.int(3); }
    for (const d of ['chance', 'community_chest'] as const) if (!held[d] && coin(rng, 0.2)) { held[d] = true; pl.goojf = [...(pl.goojf ?? []), d]; }
    if (ed.decks.bus.length) pl.busTickets = rng.int(3);
  });
  sc.current = rng.int(n);
  sc.pot = rng.int(500);
  sc.busTicketsLeft = ed.decks.bus.length ? rng.int(ed.decks.bus.length + 1) : null;
  if (coin(rng, 0.3) && n >= 2) sc.agreements = [{ kind: 'joker', payer: 0, owner: null, uses: 1 + rng.int(3), percent: pick(rng, [50, 100]) }];
  return sc;
}

/** the random setup of fuzz game k, so a failure can be replayed on its own */
export function fuzzCase(k: number, seed = 1) {
  const rng = createRng(Math.imul(seed, 0x9e3779b1) + k);
  const [ed, official] = pick(rng, EDITIONS);
  const { rules, label } = randomRules(rng, official);
  const n = 2 + rng.int(5);
  const scenario = randomScenario(rng, ed, n, rules.unlimitedSupply);
  // mostly random bots, with some heuristics among them so trades between the two kinds happen too
  const ids = Object.keys(PROFILES);
  const profiles = scenario.players.map(() => (coin(rng, 0.6) ? 'random' : pick(rng, ids)));
  return { ed, rules, label, scenario, profiles, auditSeed: seed * 100_000 + k };
}

export function fuzz(games: number, seed = 1): FuzzReport {
  const out: FuzzReport = { games: 0, rolls: 0, builds: 0, trades: 0, violations: [] };
  for (let k = 0; k < games; k++) {
    const c = fuzzCase(k, seed);
    const where = `fuzz ${k} (${c.ed.id}, ${c.label}, ${c.profiles.join('/')})`;
    let r;
    try {
      r = audit(c.ed, c.rules, c.scenario, 1, c.auditSeed, c.profiles);
    } catch (e) {
      out.violations.push(`${where}: threw ${e instanceof Error ? e.message : e}`);
      continue;
    }
    out.games++;
    out.rolls += r.rolls;
    out.builds += r.builds;
    out.trades += r.trades;
    for (const v of r.violations) if (out.violations.length < 50) out.violations.push(`${where}: ${v}`);
  }
  return out;
}
