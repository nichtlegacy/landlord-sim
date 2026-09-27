// House rules H1-H18 (docs/house-rules.md), each a switchable override of an edition's official rules.
// Their texts live in the UI dictionaries (src/ui/i18n), keyed by id.
import type { RuleConfig } from '../engine/types';

export interface HouseRule {
  id: string;
  /** only meaningful on boards with a speed die (bus tickets, Auction space) */
  needsSpeedDie?: boolean;
  /** only takes effect together with this rule (shown nested under it) */
  requires?: string;
  apply: (r: RuleConfig) => RuleConfig;
}

export const HOUSE_RULES: HouseRule[] = [
  {
    id: 'H1', needsSpeedDie: true,
    apply: (r) => ({ ...r, speedDie: r.speedDie && { ...r.speedDie, bonusMove: 'ignore' } }),
  },
  {
    id: 'H3',
    apply: (r) => ({ ...r, build: { ...r.build, maxUnitsPerAction: 6 } }),
  },
  {
    id: 'H4',
    apply: (r) => ({ ...r, build: { ...r.build, timing: 'standing_on_group' } }),
  },
  {
    id: 'H6',
    apply: (r) => ({ ...r, jail: { ...r.jail, maxRollAttempts: 3, afterMaxAttempts: 'free_next_turn', onDoubles: 'free_then_roll' } }),
  },
  {
    id: 'H7', needsSpeedDie: true,
    apply: (r) => ({ ...r, speedDie: r.speedDie && { ...r.speedDie, bus: { ...r.speedDie.bus, withTickets: 'ticket' } } }),
  },
  {
    id: 'H8', needsSpeedDie: true,
    apply: (r) => ({
      ...r, busSquareWhenEmpty: 'choose',
      speedDie: r.speedDie && { ...r.speedDie, bus: { ...r.speedDie.bus, whenEmpty: 'choose', decideBeforeResolve: true } },
    }),
  },
  {
    id: 'H9',
    apply: (r) => ({ ...r, freeParkingPot: true }),
  },
  {
    id: 'H11',
    apply: (r) => ({ ...r, jail: { ...r.jail, rentWhileJailed: false, payThenRoll: false, bailForRent: true } }),
  },
  {
    id: 'H12',
    apply: (r) => ({ ...r, unlimitedSupply: true }),
  },
  {
    id: 'H14',
    apply: (r) => ({ ...r, bankReturn: 0.75 }),
  },
  {
    id: 'H15',
    apply: (r) => ({ ...r, bankruptcyToBank: true }),
  },
  {
    id: 'H13', needsSpeedDie: true,
    apply: (r) => ({ ...r, speedDie: null, triplesAnySpace: false }),
  },
  {
    id: 'H17',
    apply: (r) => ({ ...r, auctionOnDecline: false }),
  },
  {
    id: 'H18', needsSpeedDie: true,
    apply: (r) => ({ ...r, auctionSpaceOptional: true }),
  },
  {
    id: 'H16', requires: 'H10',
    apply: (r) => ({ ...r, build: { ...r.build, singleSiteMaxLevel: 6 } }),
  },
  {
    id: 'H10',
    apply: (r) => ({ ...r, build: { ...r.build, singleSiteOnLanding: true } }),
  },
];

/** H2 (triples to any space) is an official speed-die rule and therefore not listed. */
// shown and applied in numeric order
HOUSE_RULES.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));

/** a rule counts only if the rule it depends on is on too (H16 needs H10) */
export function applyHouseRules(base: RuleConfig, enabled: Iterable<string>): RuleConfig {
  const on = new Set(enabled);
  return HOUSE_RULES.reduce((r, h) => (on.has(h.id) && (!h.requires || on.has(h.requires)) ? h.apply(r) : r), base);
}

/** switching a rule on or off; dependent rules follow their parent */
export function toggleRule(rules: string[], id: string, on: boolean): string[] {
  if (on) {
    const add = [id, ...HOUSE_RULES.filter((h) => h.requires === id).map((h) => h.id)];
    const req = HOUSE_RULES.find((h) => h.id === id)?.requires;
    return [...new Set([...rules, ...add, ...(req ? [req] : [])])];
  }
  const drop = new Set([id, ...HOUSE_RULES.filter((h) => h.requires === id).map((h) => h.id)]);
  return rules.filter((x) => !drop.has(x));
}

/** money amounts that differ between tables: GO when passing / landing (0 = nothing), bail */
export interface Amounts { goPass: number; goLand: number; jailFine: number }

export const officialAmounts = (r: RuleConfig): Amounts => ({ goPass: r.goSalary, goLand: r.goLandTotal ?? r.goSalary, jailFine: r.jail.fine });

export function applyAmounts(r: RuleConfig, a: Amounts): RuleConfig {
  return { ...r, goSalary: a.goPass, goLandTotal: a.goLand, jail: { ...r.jail, fine: a.jailFine } };
}

/** speed die modes: off, official rules, or the bonus face without effect */
export type SpeedMode = 'off' | 'official' | 'no_bonus';
export const speedModeOf = (rules: string[]): SpeedMode => (rules.includes('H13') ? 'off' : rules.includes('H1') ? 'no_bonus' : 'official');
export const withSpeedMode = (rules: string[], mode: SpeedMode) =>
  [...rules.filter((id) => id !== 'H1' && id !== 'H13'), ...(mode === 'off' ? ['H13'] : mode === 'no_bonus' ? ['H1'] : [])];

/** the house rules most tables use (Free Parking pot, no rent from jail, no auctions) plus double pay for landing on GO */
export const POPULAR_HOUSE_RULES = ['H9', 'H11', 'H17'];
export const popularAmounts = (r: RuleConfig): Amounts => ({ ...officialAmounts(r), goLand: 2 * r.goSalary });
