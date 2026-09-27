// Edition data: shared mapper from data/**/board.json + cards.json, and a schema check.
import type { BusCard, Card, CardEffect, Edition, EditionLocale, Space, SpaceType } from './types';

/** one entry of board.json "spaces" (extra fields are ignored) */
export interface RawSpace {
  index: number;
  name: string;
  type: string;
  group?: string;
  price?: number;
  rent?: number[];
  house_cost?: number;
  mortgage?: number;
  amount?: number;
  depot_cost?: number;
  rent_multiplier?: number[];
}

export interface RawBoard {
  name: string;
  currency: string;
  side_length: number;
  start_money: number;
  jail_index: number;
  supply: { houses: number; hotels: number; skyscrapers?: number; depots?: number };
  /** colour groups plus 'station' and 'utility' (dropped, the engine derives those) */
  groups: Record<string, number[]>;
  spaces: RawSpace[];
  /** e.g. { de: { name, spaces: { "1": "..." } } } */
  locales?: Record<string, { name?: string; currency?: string; spaces?: Record<string, string> }>;
}

/** `count` copies of the card go into the deck (default 1) */
interface RawCard { id: string; text: string; count?: number; effect: { type: string } }
interface RawBusCard { id: string; text: string; count?: number; effect?: { on_draw?: string } }

/** locales: translated texts per deck, one per raw card (before `count` expansion) */
export interface RawCards {
  chance: RawCard[];
  community_chest: RawCard[];
  bus_ticket?: RawBusCard[];
  locales?: Record<string, { chance?: string[]; community_chest?: string[]; bus_ticket?: string[] }>;
}

const expand = <T extends { count?: number }>(list: T[]) =>
  list.flatMap((c) => Array.from({ length: c.count ?? 1 }, () => c));

const toCard = (c: RawCard): Card => ({ id: c.id, text: c.text, effect: c.effect as CardEffect });

/** translated texts of one raw deck, repeated like the cards themselves (a wrong length is left for validateEdition) */
const expandTexts = (list: { count?: number }[], texts?: string[]) =>
  texts && texts.length === list.length ? list.flatMap((c, i) => Array.from({ length: c.count ?? 1 }, () => texts[i])) : texts;

function loadLocales(board: RawBoard, cards: RawCards): Record<string, EditionLocale> | undefined {
  const langs = [...new Set([...Object.keys(board.locales ?? {}), ...Object.keys(cards.locales ?? {})])];
  if (!langs.length) return undefined;
  return Object.fromEntries(langs.map((lang) => {
    const b = board.locales?.[lang], c = cards.locales?.[lang];
    const loc: EditionLocale = { name: b?.name, currency: b?.currency };
    if (b?.spaces) loc.spaces = Object.fromEntries(Object.entries(b.spaces).map(([i, name]) => [Number(i), name]));
    if (c) {
      loc.cards = {
        chance: expandTexts(cards.chance, c.chance),
        community_chest: expandTexts(cards.community_chest, c.community_chest),
        bus: expandTexts(cards.bus_ticket ?? [], c.bus_ticket),
      };
    }
    return [lang, loc];
  }));
}

export function loadEdition(
  board: RawBoard,
  cards: RawCards,
  meta: { id: string; maxLevel: number },
): Edition {
  const spaces: Space[] = board.spaces.map((s) => ({
    index: s.index,
    name: s.name,
    type: s.type as SpaceType,
    group: s.group,
    price: s.price,
    rent: s.rent,
    houseCost: s.house_cost,
    mortgage: s.mortgage,
    amount: s.amount,
    depotCost: s.depot_cost,
    utilityMultiplier: s.rent_multiplier,
  }));
  return {
    id: meta.id,
    name: board.name,
    locales: loadLocales(board, cards),
    currency: board.currency,
    spaces,
    sideLength: board.side_length,
    groups: Object.fromEntries(
      Object.entries(board.groups).filter(([g]) => g !== 'station' && g !== 'utility'),
    ),
    startMoney: board.start_money,
    jailIndex: board.jail_index,
    maxLevel: meta.maxLevel,
    supply: {
      houses: board.supply.houses,
      hotels: board.supply.hotels,
      skyscrapers: board.supply.skyscrapers ?? 0,
      depots: board.supply.depots ?? 0,
    },
    decks: {
      chance: expand(cards.chance).map(toCard),
      community_chest: expand(cards.community_chest).map(toCard),
      bus: expand(cards.bus_ticket ?? []).map(
        (c): BusCard => ({ id: c.id, text: c.text, expiresOthers: c.effect?.on_draw === 'expire_all_other_tickets' }),
      ),
    },
  };
}

const SPACE_TYPES = new Set<string>([
  'go', 'street', 'station', 'utility', 'tax', 'chance', 'community_chest',
  'jail', 'go_to_jail', 'free_parking', 'auction', 'birthday_gift', 'bus_ticket',
] satisfies SpaceType[]);

const EFFECT_TYPES = new Set<string>([
  'move_to', 'move_nearest', 'move_relative', 'collect', 'pay', 'pay_each_player',
  'collect_each_player', 'repairs', 'get_out_of_jail_free', 'go_to_jail',
] satisfies CardEffect['type'][]);

const pos = (x: number | undefined) => x !== undefined && x > 0;

/** problems with the edition data, empty when the engine can use it */
export function validateEdition(ed: Edition): string[] {
  const out: string[] = [];
  const n = ed.spaces.length;
  const of = (t: string) => ed.spaces.filter((sp) => sp.type === t);
  const at = (sp: Space) => `space ${sp.index} (${sp.name})`;

  // board shape: ticketTargets and the UI assume 4 equal sides
  if (n !== 4 * (ed.sideLength - 1)) out.push(`${n} spaces, but sideLength ${ed.sideLength} needs ${4 * (ed.sideLength - 1)}`);
  ed.spaces.forEach((sp, i) => { if (sp.index !== i) out.push(`space at position ${i} has index ${sp.index}`); });
  if (ed.spaces[0]?.type !== 'go' || of('go').length !== 1) out.push('need exactly one go space, at index 0');
  if (ed.spaces[ed.jailIndex]?.type !== 'jail') out.push(`jailIndex ${ed.jailIndex} is not a jail space`);

  const stations = of('station').length, utilities = of('utility').length;
  for (const sp of ed.spaces) {
    if (!SPACE_TYPES.has(sp.type)) { out.push(`${at(sp)}: unknown type ${sp.type}`); continue; }
    if (sp.type === 'street' || sp.type === 'station' || sp.type === 'utility') {
      if (!pos(sp.price)) out.push(`${at(sp)}: price missing`);
      if (!pos(sp.mortgage)) out.push(`${at(sp)}: mortgage missing`);
    }
    if (sp.type === 'street') {
      if (!sp.group || !ed.groups[sp.group]) out.push(`${at(sp)}: group ${sp.group} not in groups`);
      else if (!ed.groups[sp.group].includes(sp.index)) out.push(`${at(sp)}: missing from group ${sp.group}`);
      if ((sp.rent?.length ?? 0) < ed.maxLevel + 1) out.push(`${at(sp)}: rent has ${sp.rent?.length ?? 0} entries, needs ${ed.maxLevel + 1}`);
      if (!pos(sp.houseCost)) out.push(`${at(sp)}: houseCost missing`);
    }
    if (sp.type === 'station') {
      if (sp.rent?.length !== stations) out.push(`${at(sp)}: rent has ${sp.rent?.length ?? 0} entries, needs one per station (${stations})`);
      if (ed.supply.depots > 0 && !pos(sp.depotCost)) out.push(`${at(sp)}: depotCost missing`);
    }
    if (sp.type === 'utility' && sp.utilityMultiplier?.length !== utilities) {
      out.push(`${at(sp)}: utilityMultiplier has ${sp.utilityMultiplier?.length ?? 0} entries, needs one per utility (${utilities})`);
    }
    if ((sp.type === 'tax' || sp.type === 'birthday_gift') && !pos(sp.amount)) out.push(`${at(sp)}: amount missing`);
  }

  const seen = new Map<number, string>();
  for (const [g, list] of Object.entries(ed.groups)) {
    for (const i of list) {
      const sp = ed.spaces[i];
      if (sp?.type !== 'street' || sp.group !== g) out.push(`group ${g}: space ${i} is not a ${g} street`);
      if (seen.has(i)) out.push(`space ${i} is in groups ${seen.get(i)} and ${g}`);
      seen.set(i, g);
    }
  }

  for (const [k, v] of Object.entries(ed.supply)) {
    if (!Number.isInteger(v) || v < 0) out.push(`supply.${k} ${v} is not a non-negative integer`);
  }
  // findBuild: levels 1-4 houses, 5 hotel, 6 skyscraper
  if (ed.maxLevel !== 5 && ed.maxLevel !== 6) out.push(`maxLevel ${ed.maxLevel} must be 5 or 6`);
  if ((ed.supply.skyscrapers > 0) !== (ed.maxLevel === 6)) out.push(`supply.skyscrapers ${ed.supply.skyscrapers} does not fit maxLevel ${ed.maxLevel}`);

  for (const d of ['chance', 'community_chest'] as const) {
    const deck = ed.decks[d], spaces = of(d).length;
    // returnGoojf finds the card by effect type, so a second one would be lost
    if (deck.filter((c) => c.effect.type === 'get_out_of_jail_free').length > 1) out.push(`${d}: more than one get_out_of_jail_free card`);
    if ((deck.length > 0) !== (spaces > 0)) out.push(`${d}: ${deck.length} cards but ${spaces} ${d} spaces`);
    for (const c of deck) {
      const e = c.effect;
      if (!EFFECT_TYPES.has(e.type)) out.push(`${d} ${c.id}: unknown effect ${e.type}`);
      else if (e.type === 'move_to' && !(Number.isInteger(e.target) && e.target >= 0 && e.target < n)) out.push(`${d} ${c.id}: move_to target ${e.target} out of range`);
      else if (e.type === 'move_nearest' && !of(e.kind).length) out.push(`${d} ${c.id}: move_nearest ${e.kind}, but no such space`);
    }
  }
  if (ed.decks.bus.length && !of('bus_ticket').length && !of('birthday_gift').length) {
    out.push('bus deck without a bus_ticket or birthday_gift space');
  }

  for (const [lang, loc] of Object.entries(ed.locales ?? {})) {
    for (const i of Object.keys(loc.spaces ?? {})) {
      if (!ed.spaces[Number(i)]) out.push(`locale ${lang}: space ${i} does not exist`);
    }
    for (const d of ['chance', 'community_chest', 'bus'] as const) {
      const texts = loc.cards?.[d];
      if (texts && texts.length !== ed.decks[d].length) out.push(`locale ${lang}: ${texts.length} ${d} texts for ${ed.decks[d].length} cards`);
      if (texts?.some((t) => !t)) out.push(`locale ${lang}: empty ${d} text`);
    }
  }
  return out;
}

/** throws with every problem listed; returns the edition for use at module load */
export function assertEdition(ed: Edition): Edition {
  const problems = validateEdition(ed);
  if (problems.length) throw new Error(`invalid edition ${ed.id}:\n- ${problems.join('\n- ')}`);
  return ed;
}

// ------------------------------------------------------------------ localized texts (English is the fallback)

export const editionName = (ed: Edition, lang: string) => ed.locales?.[lang]?.name ?? ed.name;
export const editionCurrency = (ed: Edition, lang: string) => ed.locales?.[lang]?.currency ?? ed.currency;
export const spaceName = (ed: Edition, i: number, lang: string) => ed.locales?.[lang]?.spaces?.[i] ?? ed.spaces[i].name;
export const cardText = (ed: Edition, deck: 'chance' | 'community_chest' | 'bus', i: number, lang: string) =>
  ed.locales?.[lang]?.cards?.[deck]?.[i] ?? ed.decks[deck][i].text;
