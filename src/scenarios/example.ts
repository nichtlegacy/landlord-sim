// Example end game on the 52-space board: three players, one of them in jail, a rent deal.
// Used as the app's example position, by the CLI, the benchmark and the tests.
import { grandRules } from '../editions/grand';
import type { Scenario } from '../engine/state';
import type { RuleConfig } from '../engine/types';
import { applyAmounts, applyHouseRules, HOUSE_RULES, type Amounts } from '../house-rules';

const ADA = 0, BEN = 1, CLEO = 2;

export const exampleEndgame: Scenario = {
  id: 'example-endgame',
  label: 'Example: three-player end game',
  current: ADA,
  players: [
    { name: 'Ada', cash: [1000, 1400], pos: 30, token: 'car' },
    { name: 'Ben', cash: [2400, 2800], pos: 13, inJail: true, jailTurns: 1, goojf: ['chance'], token: 'boat' },
    { name: 'Cleo', cash: [5000, 5500], pos: 30, token: 'cat' },
  ],
  properties: [
    // Ada: the red group with skyscrapers, 3 of 4 green, one brown
    ...[27, 29, 30, 31].map((space) => ({ space, owner: ADA, level: 6 })),
    ...[41, 42, 44].map((space) => ({ space, owner: ADA })),
    { space: 1, owner: ADA },
    // Ben: all stations with depots, 3 of 4 yellow, a few single streets
    ...[6, 20, 33, 45].map((space) => ({ space, owner: BEN, depot: true })),
    { space: 34, owner: BEN }, { space: 35, owner: BEN }, { space: 37, owner: BEN, level: 1 },
    { space: 16, owner: BEN, level: 1 },
    { space: 51, owner: BEN, level: 1 },
    // Cleo: the orange group with skyscrapers, one brown, two mortgaged streets
    ...[21, 23, 24, 25].map((space) => ({ space, owner: CLEO, level: 6 })),
    { space: 4, owner: CLEO },
    { space: 40, owner: CLEO, mortgaged: true },
    { space: 18, owner: CLEO, mortgaged: true },
  ],
  pot: 70,
  busTicketsLeft: 0,
  // Cleo sold a station cheaply and in return pays at most 100 at Ben's stations
  agreements: [{ kind: 'rent', payer: CLEO, owner: BEN, scope: 'stations', maxAmount: 100, note: 'Cleo pays at most 100 at Ben\'s stations' }],
};

/** a typical table's house rules for the example: all of them except switching the speed die off */
export const EXAMPLE_HOUSE_RULES = HOUSE_RULES.filter((h) => h.id !== 'H13').map((h) => h.id);
export const EXAMPLE_AMOUNTS: Amounts = { goPass: 200, goLand: 400, jailFine: 100 };

export function exampleRules(opts: { singleSite?: boolean; without?: string[] } = {}): RuleConfig {
  const list = EXAMPLE_HOUSE_RULES.filter((id) => (opts.singleSite ?? true) || id !== 'H10').filter((id) => !opts.without?.includes(id));
  return applyAmounts(applyHouseRules(grandRules, list), EXAMPLE_AMOUNTS);
}
