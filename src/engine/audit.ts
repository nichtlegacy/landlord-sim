// Rule audit: plays games and checks rule invariants after every roll and turn.
// State checks catch impossible positions; transition checks verify every build step.
// Used by the tests and by `npm run sim -- --audit N`.
import { Game } from './game';
import { createPolicy, STYLE_IDS } from './policy';
import { createRng } from './rng';
import { buildState, UNLIMITED, type Scenario } from './state';
import type { Edition, RuleConfig } from './types';

export interface AuditReport { games: number; rolls: number; builds: number; trades: number; violations: string[] }

interface Snap { owner: number[]; level: number[]; depot: boolean[] }
const snap = (g: Game): Snap => ({ owner: [...g.s.owner], level: [...g.s.level], depot: [...g.s.depot] });

export function audit(ed: Edition, rules: RuleConfig, sc: Scenario, games: number, seed = 1, profiles?: string[]): AuditReport {
  const violations: string[] = [];
  let rolls = 0, builds = 0, trades = 0;
  for (let k = 0; k < games; k++) {
    const rng = createRng(seed + k);
    // rotate through the styles so every policy path is exercised
    const ids = profiles ?? sc.players.map((_, i) => STYLE_IDS[(k + i) % STYLE_IDS.length]);
    const botRng = createRng(seed + k + 0x9e3779b9);
    const g = new Game(ed, rules, buildState(ed, sc, rng, { unlimitedSupply: rules.unlimitedSupply }), ids.map((id) => createPolicy(id, botRng)), rng);
    const fail = (msg: string) => { if (violations.length < 50) violations.push(`game ${k} round ${g.s.round}: ${msg}`); };
    const goojf = { chance: 0, community_chest: 0 };
    for (const d of ['chance', 'community_chest'] as const) goojf[d] = ed.decks[d].filter((c) => c.effect.type === 'get_out_of_jail_free').length;
    const initialPot = g.s.pot;
    let prev = snap(g);

    const step = (p: number | null) => {
      checkState(g, ed, rules, fail);
      checkCards(g, goojf, fail);
      checkOwners(g, prev, fail);
      builds += checkBuilds(g, prev, built, fail);
      built.clear();
      if (!rules.freeParkingPot && g.s.pot !== initialPot) fail('pot changed without free parking rule');
      prev = snap(g);
    };
    g.onRollEnd = (p) => { rolls++; step(p); };
    // every building unit is checked the moment it is placed: later moves in the same roll
    // (bus, bonus move, cards, buying the missing street) would otherwise look like violations
    const units = new Map<number, number>();
    const built = new Set<number>();
    g.onBuild = (p, i, action, single) => {
      built.add(i);
      const u = (units.get(action) ?? 0) + 1;
      units.set(action, u);
      const cap = rules.build.maxUnitsPerAction ?? Infinity;
      if (u > cap) fail(`${g.s.players[p].name} built ${u} units in one action (cap ${cap})`);
      if (rules.build.timing === 'standing_on_group') {
        if (g.groupOf[g.s.players[p].pos] !== g.groupOf[i]) fail(`${g.s.players[p].name} built on ${g.sp(i).name} while standing on ${g.sp(g.s.players[p].pos).name}`);
        if (g.s.current !== p) fail('built outside of own turn under H4');
      }
      checkBuild(g, rules, p, i, single, fail);
    };
    // a trade moves property between two checks; verify it on the spot, then compare against the new owners
    g.onTrade = (p, o) => {
      for (const i of [...o.give, ...o.get]) {
        const grp = g.groupOf[i]!;
        if (g.s.depot[i] || (g.sp(i).type === 'street' && g.members[grp].some((j) => g.s.level[j] > 0))) fail(`traded ${g.sp(i).name} with buildings in its group`);
      }
      if (g.s.players[p].cash < 0 || g.s.players[o.to].cash < 0) fail('trade left negative cash');
      checkState(g, ed, rules, fail);
      prev = snap(g);
    };
    let guard = 0;
    while (g.activePlayers().length > 1 && g.s.round <= rules.roundCap) {
      g.playTurn();
      step(null); // end-of-turn actions (official rules build here)
      if (++guard > 200_000) { fail('game did not terminate'); break; }
    }
    trades += g.trades;
    if (!rules.trading && g.trades) fail('traded although trading is off');
  }
  return { games, rolls, builds, trades, violations };
}

/** every Get Out of Jail Free card is either in its deck or in exactly one hand */
function checkCards(g: Game, total: Record<'chance' | 'community_chest', number>, fail: (m: string) => void) {
  for (const d of ['chance', 'community_chest'] as const) {
    const inDeck = g.s.decks[d].filter((i) => g.ed.decks[d][i].effect.type === 'get_out_of_jail_free').length;
    const held = g.s.players.reduce((a, pl) => a + pl.goojf.filter((x) => x === d).length, 0);
    if (inDeck + held !== total[d]) fail(`${d} Get Out of Jail Free cards not conserved (${inDeck} in deck + ${held} held)`);
  }
}

/** property changes hands only without buildings, and never back to a bankrupt player */
function checkOwners(g: Game, prev: Snap, fail: (m: string) => void) {
  const s = g.s;
  for (let i = 0; i < g.n; i++) {
    const o = s.owner[i];
    if (o === prev.owner[i]) continue;
    if (o >= 0 && s.players[o].bankrupt) fail(`${g.sp(i).name} went to bankrupt ${s.players[o].name}`);
    if (prev.owner[i] >= 0 && o >= 0 && s.level[i] > 0) fail(`${g.sp(i).name} changed hands with buildings`);
    if (!g.isProperty(i)) fail(`non-property ${g.sp(i).name} has an owner`);
  }
}

function checkState(g: Game, ed: Edition, rules: RuleConfig, fail: (m: string) => void) {
  const s = g.s;
  let houses = 0, hotels = 0, sky = 0, depots = 0;
  for (let i = 0; i < g.n; i++) {
    const l = s.level[i];
    if (l >= 1 && l <= 4) houses += l;
    if (l === 5) hotels++;
    if (l === 6) sky++;
    if (s.depot[i]) depots++;
    if (l > ed.maxLevel) fail(`${g.sp(i).name} above max level`);
    if ((l > 0 || s.depot[i]) && s.owner[i] < 0) fail(`${g.sp(i).name} has buildings but no owner`);
    if ((l > 0 || s.depot[i]) && s.mortgaged[i]) fail(`${g.sp(i).name} mortgaged with buildings`);
    if (s.depot[i] && g.sp(i).type !== 'station') fail(`depot on ${g.sp(i).name}`);
    if (l > 0 && g.sp(i).type !== 'street') fail(`building level on ${g.sp(i).name}`);
  }
  const sup = s.supply;
  const total = rules.unlimitedSupply
    ? { houses: UNLIMITED, hotels: UNLIMITED, skyscrapers: ed.supply.skyscrapers ? UNLIMITED : 0, depots: ed.supply.depots ? UNLIMITED : 0 }
    : ed.supply;
  if (houses + sup.houses !== total.houses) fail(`houses not conserved (${houses} + ${sup.houses})`);
  if (hotels + sup.hotels !== total.hotels) fail(`hotels not conserved (${hotels} + ${sup.hotels})`);
  if (sky + sup.skyscrapers !== total.skyscrapers) fail(`skyscrapers not conserved (${sky} + ${sup.skyscrapers})`);
  if (depots + sup.depots !== total.depots) fail(`depots not conserved (${depots} + ${sup.depots})`);
  for (const k of ['houses', 'hotels', 'skyscrapers', 'depots'] as const) if (sup[k] < 0) fail(`${k} supply negative (${sup[k]})`);
  if (s.pot < 0) fail('pot negative');
  s.players.forEach((pl, p) => {
    if (pl.cash < 0) fail(`${pl.name} has negative cash`);
    if (pl.inJail && pl.pos !== ed.jailIndex) fail(`${pl.name} in jail but not on the jail space`);
    if (pl.bankrupt && s.owner.includes(p)) fail(`${pl.name} is bankrupt but still owns property`);
    if (pl.busTickets < 0) fail(`${pl.name} has negative bus tickets`);
  });
}

/** levels only rise through reported builds, and property never keeps buildings when it changes hands */
function checkBuilds(g: Game, prev: Snap, built: Set<number>, fail: (m: string) => void): number {
  const s = g.s;
  let count = 0;
  for (let i = 0; i < g.n; i++) {
    const raised = s.level[i] > prev.level[i] || (s.depot[i] && !prev.depot[i]);
    if (!raised) continue;
    count++;
    if (!built.has(i)) fail(`${g.sp(i).name} gained a building outside of a build`);
    if (prev.owner[i] >= 0 && prev.owner[i] !== s.owner[i]) fail(`${g.sp(i).name} kept buildings while changing owner`);
  }
  return count;
}

/** one unit just placed on space i by p (level already raised) */
function checkBuild(g: Game, rules: RuleConfig, p: number, i: number, single: boolean, fail: (m: string) => void) {
  const s = g.s, sp = g.sp(i), name = s.players[p].name;
  if (s.owner[i] !== p) fail(`${name} built on ${sp.name} without owning it`);
  if (s.mortgaged[i]) fail(`${name} built on mortgaged ${sp.name}`);
  if (sp.type === 'station') return;
  const grp = g.groupOf[i]!, members = g.members[grp];
  const mine = members.filter((j) => s.owner[j] === p);
  if (mine.some((j) => s.mortgaged[j])) fail(`built on ${grp} while a street of the group is mortgaged`);
  const fullBlocksSky = s.level[i] === 6 && rules.build.skyscraperNeedsFullGroup && mine.length < members.length;
  if (single) {
    // H10 below the threshold; H16 also at the threshold for the skyscraper the full-group rule blocks
    if (!rules.build.singleSiteOnLanding) fail(`single-site build on ${sp.name} without H10`);
    if (s.players[p].pos !== i) fail(`single-site build on ${sp.name} without standing there`);
    if (s.level[i] > Math.min(rules.build.singleSiteMaxLevel, g.ed.maxLevel)) fail(`single-site build on ${sp.name} above the limit`);
    if (g.meetsThreshold(p, grp) && !fullBlocksSky) fail(`single-site build on ${sp.name} although the group can be built normally`);
    return;
  }
  if (!g.meetsThreshold(p, grp)) fail(`${name} built on ${grp} without the required streets`);
  // even building: each unit goes on a lowest street (H10 may have left the group uneven before)
  const others = mine.filter((j) => j !== i).map((j) => s.level[j]);
  if (others.length && s.level[i] - 1 > Math.min(...others)) fail(`${grp} built unevenly: ${mine.map((j) => s.level[j]).join('/')}`);
  if (fullBlocksSky) fail(`skyscraper on ${sp.name} without the full group`);
}
