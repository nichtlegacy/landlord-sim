// UI state: which edition, which starting position, which rules. Persisted in localStorage.
import { classic, classicRules } from '../editions/classic';
import { grand, grandRules } from '../editions/grand';
import { applyAmounts, applyHouseRules, HOUSE_RULES, officialAmounts, type Amounts } from '../house-rules';
import { newGameScenario, type Scenario } from '../engine/state';
import type { Edition, RuleConfig } from '../engine/types';
import { i18n } from './i18n';
import { EXAMPLE_AMOUNTS, EXAMPLE_HOUSE_RULES, exampleEndgame } from '../scenarios/example';

export interface EditionEntry { edition: Edition; official: RuleConfig }
export const EDITIONS: Record<string, EditionEntry> = {
  classic: { edition: classic, official: classicRules },
  grand: { edition: grand, official: grandRules },
};

export interface Setup {
  editionId: string;
  scenario: Scenario;
  houseRules: string[];
  /** GO and bail amounts; missing = official amounts of the edition */
  amounts?: Amounts;
  /** how the game goes on after the abort; missing = buying and building as usual */
  continuation?: Continuation;
  profiles: string[];
  games: number;
  seed: number;
  /** rotate who starts from game to game (new games: no seat is favoured) */
  rotateStart?: boolean;
}

/** how the game goes on: buying free property, building, trading between players (missing = yes) */
export interface Continuation { buy: boolean; build: boolean; trade?: boolean }
export const continuationOf = (s: Setup): Required<Continuation> => ({ buy: true, build: true, trade: true, ...s.continuation });

export const PLAYER_COLORS = ['#7c3aed', '#0a72ef', '#0f9488', '#c2185b', '#525252', '#a16207'];
export const playerColor = (i: number) => PLAYER_COLORS[i % PLAYER_COLORS.length];

// colour bars as printed on the board
export const GROUP_COLORS: Record<string, string> = {
  brown: '#955436', light_blue: '#aae0fa', pink: '#d93a96', orange: '#f7941d',
  red: '#ed1b24', yellow: '#fef200', green: '#1fb25a', dark_blue: '#0072bb',
};

/** playing piece of player i; without a choice, the first classic piece nobody else has */
const DEFAULT_TOKENS = ['car', 'boat', 'cat', 'hat', 'dog', 'boot', 'thimble', 'iron', 'barrow', 'duck', 'penguin', 'trex'];
export function tokenOf(s: Setup | { scenario: Scenario }, i: number): string {
  const players = s.scenario.players;
  if (players[i]?.token) return players[i].token!;
  const used = new Set(players.map((p) => p.token).filter(Boolean));
  let pick = DEFAULT_TOKENS[0];
  for (let j = 0, k = 0; j <= i && j < players.length; j++) {
    if (players[j].token) continue;
    while (used.has(DEFAULT_TOKENS[k % DEFAULT_TOKENS.length]) && k < DEFAULT_TOKENS.length * 2) k++;
    pick = DEFAULT_TOKENS[k % DEFAULT_TOKENS.length];
    used.add(pick);
  }
  return pick;
}

/** the example end game (src/scenarios/example.ts) with a typical set of house rules */
export const presetExample = (): Setup => ({
  editionId: 'grand',
  scenario: structuredClone(exampleEndgame),
  houseRules: [...EXAMPLE_HOUSE_RULES],
  amounts: { ...EXAMPLE_AMOUNTS },
  profiles: ['balanced', 'balanced', 'balanced'],
  games: 20000,
  seed: 1,
});

const defaultNames = () => [1, 2, 3, 4].map((n) => i18n().t('player.default', { n }));

export const presetNewGame = (editionId: string, names = defaultNames()): Setup => ({
  editionId,
  scenario: newGameScenario(EDITIONS[editionId].edition, names),
  houseRules: [],
  amounts: officialAmounts(EDITIONS[editionId].official),
  profiles: names.map(() => 'balanced'),
  games: 10000,
  seed: 1,
  rotateStart: true,
});

export function rulesFor(setup: Setup): RuleConfig {
  const { official } = EDITIONS[setup.editionId];
  const applicable = setup.houseRules.filter((id) => {
    const h = HOUSE_RULES.find((x) => x.id === id);
    return h && (!h.needsSpeedDie || official.speedDie);
  });
  const c = continuationOf(setup);
  const r = applyAmounts(applyHouseRules(official, applicable), amountsOf(setup));
  return { ...r, buying: c.buy, building: c.build, trading: r.trading && c.trade };
}

export const amountsOf = (s: Setup): Amounts => s.amounts ?? officialAmounts(EDITIONS[s.editionId].official);

const KEY = 'landlord:setup:v1';
export function loadSetup(): Setup {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Setup;
      if (EDITIONS[s.editionId] && s.scenario?.players?.length) return s;
    }
  } catch { /* ignore broken storage */ }
  // first visit: the example end game, whose result is baked into the static build (npm run bake)
  return presetExample();
}
export const saveSetup = (s: Setup) => localStorage.setItem(KEY, JSON.stringify(s));

/** stable key: results are stale when this changes */
export const setupKey = (s: Setup) => {
  const scenario = { ...s.scenario, players: s.scenario.players.map(({ token: _, ...p }) => p) }; // tokens are cosmetic
  const c = continuationOf(s);
  // defaults stay out of the key, so results cached before a switch existed still match
  const cont = c.buy && c.build && c.trade ? [] : [c];
  const rot = s.rotateStart ? ['rotate'] : [];
  return JSON.stringify([s.editionId, scenario, [...s.houseRules].sort(), amountsOf(s), s.profiles, s.games, s.seed, ...cont, ...rot]);
};
