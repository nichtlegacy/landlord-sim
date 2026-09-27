// Immutable edits of a Setup's scenario (owners are player indices, so reorders remap them).
import { Game } from '../engine/game';
import { createRng } from '../engine/rng';
import { spaceName } from '../engine/edition';
import { buildState, SupplyError, type ScenarioPlayer, type ScenarioProperty } from '../engine/state';
import type { Agreement } from '../engine/types';
import { groupName, i18n, levelName, ruleText } from './i18n';
import { EDITIONS, rulesFor, type Setup } from './model';

export function setProperty(s: Setup, space: number, patch: Partial<ScenarioProperty> | null): Setup {
  const props = s.scenario.properties.filter((p) => p.space !== space);
  const old = s.scenario.properties.find((p) => p.space === space);
  const next = patch === null ? null : { space, owner: -1, ...old, ...patch };
  if (next && next.owner >= 0) props.push(next);
  props.sort((a, b) => a.space - b.space);
  return { ...s, scenario: { ...s.scenario, properties: props } };
}

export function setPlayer(s: Setup, i: number, patch: Partial<ScenarioPlayer>): Setup {
  const players = s.scenario.players.map((p, k) => (k === i ? { ...p, ...patch } : p));
  return { ...s, scenario: { ...s.scenario, players } };
}

export function movePlayer(s: Setup, i: number, dir: -1 | 1): Setup {
  const j = i + dir;
  const n = s.scenario.players.length;
  if (j < 0 || j >= n) return s;
  const swap = (x: number) => (x === i ? j : x === j ? i : x);
  const players = [...s.scenario.players];
  [players[i], players[j]] = [players[j], players[i]];
  const profiles = [...s.profiles];
  [profiles[i], profiles[j]] = [profiles[j], profiles[i]];
  return {
    ...s, profiles,
    scenario: {
      ...s.scenario, players,
      current: swap(s.scenario.current),
      properties: s.scenario.properties.map((p) => ({ ...p, owner: swap(p.owner) })),
      agreements: remapAgreements(s.scenario.agreements, swap),
    },
  };
}

export function removePlayer(s: Setup, i: number): Setup {
  if (s.scenario.players.length <= 2) return s;
  const remap = (x: number) => (x > i ? x - 1 : x);
  const cur = s.scenario.current;
  return {
    ...s,
    profiles: s.profiles.filter((_, k) => k !== i),
    scenario: {
      ...s.scenario,
      players: s.scenario.players.filter((_, k) => k !== i),
      current: cur === i ? cur % (s.scenario.players.length - 1) : remap(cur),
      // property of a removed player goes back to the bank, his deals end
      properties: s.scenario.properties.filter((p) => p.owner !== i).map((p) => ({ ...p, owner: remap(p.owner) })),
      agreements: remapAgreements((s.scenario.agreements ?? []).filter((a) => a.payer !== i && a.owner !== i), remap),
    },
  };
}

export function addPlayer(s: Setup): Setup {
  const n = s.scenario.players.length;
  if (n >= 6) return s;
  const start = EDITIONS[s.editionId].edition.startMoney;
  const player: ScenarioPlayer = { name: i18n().t('player.default', { n: n + 1 }), cash: [start, start], pos: 0 };
  return { ...s, profiles: [...s.profiles, 'balanced'], scenario: { ...s.scenario, players: [...s.scenario.players, player] } };
}

/** a deterministic game object for read-only queries (rent, thresholds) and validation */
export function previewGame(s: Setup): Game | { error: string } {
  const ed = EDITIONS[s.editionId].edition;
  try {
    const rules = rulesFor(s);
    const st = buildState(ed, s.scenario, createRng(0), { unlimitedSupply: rules.unlimitedSupply });
    return new Game(ed, rules, st, [], createRng(0));
  } catch (e) {
    if (e instanceof SupplyError) {
      const { t } = i18n();
      const list = e.over.map((o) => t('supply.item', { kind: t(`supply.${o.kind}`), have: o.have, max: o.max })).join(', ');
      return { error: t('supply.text', { list, rule: ruleText(t, 'H12', 'label') }) };
    }
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** warnings about the entered position; never blocking */
export function warnings(s: Setup, g: Game): { space?: number; text: string; level?: 'info' }[] {
  const out: { space?: number; text: string; level?: 'info' }[] = [];
  const ed = g.ed;
  const { t, tp, lang } = i18n();
  const nm = (i: number) => spaceName(ed, i, lang);
  const belowThreshold: string[] = [];
  for (const p of s.scenario.properties) {
    const sp = ed.spaces[p.space];
    const lvl = p.level ?? 0;
    if (lvl > 0 && sp.type === 'street') {
      const grp = sp.group!;
      const b = g.rules.build;
      if (!g.meetsThreshold(p.owner, grp)) {
        // below the building threshold only the single-site rules allow buildings
        const allowed = b.singleSiteOnLanding ? Math.min(b.singleSiteMaxLevel, ed.maxLevel) : 0;
        if (!b.singleSiteOnLanding) belowThreshold.push(nm(p.space));
        else if (lvl > allowed)
          out.push({ space: p.space, text: t('warn.singleHigh', { space: nm(p.space), what: levelName(t, lvl === 6 ? 6 : 5), rule: ruleText(t, 'H16', 'label') }) });
      } else if (lvl === 6 && b.skyscraperNeedsFullGroup && g.ownedIn(p.owner, grp) < g.members[grp].length
        && !(b.singleSiteOnLanding && b.singleSiteMaxLevel >= 6)) {
        // with H16 a skyscraper without the full group is legal (single-site building)
        out.push({ space: p.space, text: t('warn.skyscraper', { space: nm(p.space) }) });
      }
    }
    if (p.mortgaged && (lvl > 0 || p.depot)) out.push({ space: p.space, text: t('warn.mortgageBuilt', { space: nm(p.space) }) });
  }
  // regular building is even: within one owner's group, levels differ by at most one step
  const byGroup = new Map<string, number[]>();
  for (const p of s.scenario.properties) {
    const sp = ed.spaces[p.space];
    if (sp.type !== 'street' || !g.meetsThreshold(p.owner, sp.group!)) continue;
    const k = `${p.owner}:${sp.group}`;
    byGroup.set(k, [...(byGroup.get(k) ?? []), p.level ?? 0]);
  }
  for (const [k, lv] of byGroup) {
    const [owner, grp] = k.split(':');
    if (Math.max(...lv) - Math.min(...lv) > 1)
      out.push({ text: t('warn.uneven', { name: s.scenario.players[Number(owner)]?.name ?? t('common.unknown'), group: groupName(t, grp) }) });
  }
  if (belowThreshold.length)
    out.push({ level: 'info', text: tp('warn.below', belowThreshold.length, { list: belowThreshold.join(', ') }) });
  const names = s.scenario.players.map((pl) => pl.name.trim().toLowerCase());
  names.forEach((n, i) => {
    if (!n) out.push({ text: t('warn.noName', { n: i + 1 }) });
    else if (names.indexOf(n) < i) out.push({ text: t('warn.dupName', { name: s.scenario.players[i].name }) });
  });
  for (const d of ['chance', 'community_chest'] as const) {
    const inDeck = ed.decks[d].filter((c) => c.effect.type === 'get_out_of_jail_free').length;
    const held = s.scenario.players.reduce((a, pl) => a + (pl.goojf ?? []).filter((x) => x === d).length, 0);
    if (held > inDeck) out.push({ text: t('warn.goojf', { held, deck: t(d === 'chance' ? 'warn.deckChance' : 'warn.deckChest'), n: inDeck }) });
  }
  if (ed.decks.bus.length) {
    const held = s.scenario.players.reduce((a, pl) => a + (pl.busTickets ?? 0), 0);
    const left = s.scenario.busTicketsLeft ?? ed.decks.bus.length;
    if (held + left > ed.decks.bus.length) out.push({ text: t('warn.bus', { held, left, n: ed.decks.bus.length }) });
  }
  const tries = g.rules.jail.maxRollAttempts;
  s.scenario.players.forEach((pl) => {
    if (pl.inJail && tries !== null && (pl.jailTurns ?? 0) >= tries) out.push({ text: t('warn.jailTurns', { name: pl.name, n: pl.jailTurns ?? 0, max: tries - 1 }) });
    if (pl.cash[0] > pl.cash[1]) out.push({ text: t('warn.cashRange', { name: pl.name }) });
    if (pl.inJail && pl.pos !== ed.jailIndex) out.push({ text: t('warn.jailPos', { name: pl.name }) });
  });
  return out;
}

function remapAgreements(list: Agreement[] | undefined, f: (x: number) => number): Agreement[] {
  return (list ?? []).map((a) => ({ ...a, payer: f(a.payer), owner: a.owner === null ? null : f(a.owner) }) as Agreement);
}

export function setAgreements(s: Setup, agreements: Agreement[]): Setup {
  return { ...s, scenario: { ...s.scenario, agreements } };
}

/**
 * Trade between players a and b: a gives giveA to b, b gives giveB to a, a pays b `cash` (negative: b pays a).
 * The receiver of a mortgaged property pays the interest at once, as in the engine. Throws with a message in the UI language.
 */
export function applyTrade(s: Setup, a: number, b: number, giveA: number[], giveB: number[], cash: number): Setup {
  const g = previewGame(s);
  if ('error' in g) throw new Error(g.error);
  const pl = s.scenario.players;
  const { t, lang, money } = i18n();
  if (a === b || !pl[a] || !pl[b]) throw new Error(t('trade.errPlayers'));
  if (!giveA.length && !giveB.length) throw new Error(t('trade.errNone'));
  if (!Number.isInteger(cash)) throw new Error(t('trade.errInt'));
  const nm = (i: number) => (g.ed.spaces[i] ? spaceName(g.ed, i, lang) : String(i));
  const fee = (list: number[], from: number) => list.reduce((sum, i) => {
    if (g.s.owner[i] !== from) throw new Error(t('trade.errNotOwned', { space: nm(i), name: pl[from].name }));
    if (!g.tradeable(i)) throw new Error(t('trade.errUntradeable', { space: nm(i) }));
    return sum + (g.s.mortgaged[i] ? g.mortgageInterest(i) : 0);
  }, 0);
  const dA = -cash - fee(giveB, b), dB = cash - fee(giveA, a);
  const shift = (c: [number, number], d: number): [number, number] => [c[0] + d, c[1] + d];
  const cashA = shift(pl[a].cash, dA), cashB = shift(pl[b].cash, dB);
  for (const [i, c] of [[a, cashA], [b, cashB]] as const)
    if (c[0] < 0) throw new Error(t('trade.errCash', { name: pl[i].name, amount: money(g.ed, -c[0]) }));
  const to = new Map([...giveA.map((i) => [i, b] as const), ...giveB.map((i) => [i, a] as const)]);
  return {
    ...s,
    scenario: {
      ...s.scenario,
      players: pl.map((p, i) => (i === a ? { ...p, cash: cashA } : i === b ? { ...p, cash: cashB } : p)),
      properties: s.scenario.properties.map((p) => (to.has(p.space) ? { ...p, owner: to.get(p.space)! } : p)),
    },
  };
}
