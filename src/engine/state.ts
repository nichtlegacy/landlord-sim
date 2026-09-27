// Starting positions: a new game or a snapshot with uncertain values (sampled per run).
import type { Agreement, Deck, Edition, GameState } from './types';
import { createPlayer } from './game';
import { shuffle, type Rng } from './rng';

export interface ScenarioPlayer {
  name: string;
  /** cash range [min, max]; sampled uniformly per run */
  cash: [number, number];
  pos: number;
  inJail?: boolean;
  jailTurns?: number;
  goojf?: Deck[];
  busTickets?: number;
  /** playing piece, UI only (see src/ui/art.tsx) */
  token?: string;
}

export interface ScenarioProperty {
  space: number;
  owner: number;
  /** street: 0 site, 1-4 houses, 5 hotel, 6 skyscraper */
  level?: number;
  depot?: boolean;
  mortgaged?: boolean;
}

export interface Scenario {
  id: string;
  label: string;
  players: ScenarioPlayer[];
  current: number;
  properties: ScenarioProperty[];
  pot: number;
  /** bus tickets still in the stack (null = full stack) */
  busTicketsLeft: number | null;
  /** deals between players (rent caps, jokers) */
  agreements?: Agreement[];
}

export function newGameScenario(ed: Edition, names: string[]): Scenario {
  return {
    id: 'new', label: 'New game', current: 0, pot: 0, busTicketsLeft: null, properties: [],
    players: names.map((name) => ({ name, cash: [ed.startMoney, ed.startMoney], pos: 0 })),
  };
}

/** stock used when the supply is unlimited (house rule H12) */
export const UNLIMITED = 100_000;

/** more buildings on the board than the game has; the UI words the message */
export class SupplyError extends Error {
  constructor(readonly over: { kind: keyof Edition['supply']; have: number; max: number }[]) {
    super(`More ${over.map((o) => `${o.kind} (${o.have} instead of ${o.max})`).join(', ')} on the board than the game has. Turn on house rule H12 or correct the buildings.`);
  }
}

export function buildState(ed: Edition, sc: Scenario, rng: Rng, opts: { unlimitedSupply?: boolean } = {}): GameState {
  const n = ed.spaces.length;
  const supply = opts.unlimitedSupply
    ? { houses: UNLIMITED, hotels: UNLIMITED, skyscrapers: ed.supply.skyscrapers ? UNLIMITED : 0, depots: ed.supply.depots ? UNLIMITED : 0 }
    : { ...ed.supply };
  const owner = new Array(n).fill(-1), level = new Array(n).fill(0);
  const depot = new Array(n).fill(false), mortgaged = new Array(n).fill(false);
  for (const pr of sc.properties) {
    owner[pr.space] = pr.owner;
    level[pr.space] = pr.level ?? 0;
    depot[pr.space] = !!pr.depot;
    mortgaged[pr.space] = !!pr.mortgaged;
    const l = pr.level ?? 0;
    if (l <= 4) supply.houses -= l;
    else if (l === 5) supply.hotels--;
    else supply.skyscrapers--;
    if (pr.depot) supply.depots--;
  }
  const over = (Object.keys(supply) as (keyof typeof supply)[]).filter((k) => supply[k] < 0);
  if (over.length) throw new SupplyError(over.map((kind) => ({ kind, have: ed.supply[kind] - supply[kind], max: ed.supply[kind] })));

  const players = sc.players.map((sp) => {
    const [lo, hi] = sp.cash;
    const pl = createPlayer(sp.name, lo + rng.int(hi - lo + 1), sp.pos);
    pl.inJail = !!sp.inJail;
    pl.jailTurns = sp.jailTurns ?? 0;
    pl.goojf = [...(sp.goojf ?? [])];
    pl.busTickets = sp.busTickets ?? 0;
    return pl;
  });

  const deck = (d: Deck) => {
    const held = players.flatMap((pl) => pl.goojf).filter((x) => x === d).length;
    const idx = ed.decks[d].map((_, i) => i);
    const goojf = idx.filter((i) => ed.decks[d][i].effect.type === 'get_out_of_jail_free');
    const out = idx.filter((i) => !goojf.slice(0, held).includes(i));
    return shuffle(out, rng);
  };
  const bus = shuffle(ed.decks.bus.map((_, i) => i), rng).slice(0, sc.busTicketsLeft ?? ed.decks.bus.length);

  return {
    players, owner, level, depot, mortgaged, supply,
    decks: { chance: deck('chance'), community_chest: deck('community_chest'), bus },
    pot: sc.pot, current: sc.current, round: 1,
    agreements: structuredClone(sc.agreements ?? []),
  };
}
