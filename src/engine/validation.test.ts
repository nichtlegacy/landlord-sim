// Validation against external references and a rule audit over many simulated games.
import { describe, expect, it } from 'vitest';
import { classicRules, classic } from '../editions/classic';
import { grandRules, grand } from '../editions/grand';
import { exampleEndgame, exampleRules } from '../scenarios/example';
import { audit } from './audit';
import { Game } from './game';
import { heuristicPolicy, PROFILES } from './policy';
import { createRng } from './rng';
import { buildState, newGameScenario } from './state';

// Truman Collins, long-run % of rolls ending on each square, "jail short" strategy
// (squares 0-39 with 10 = just visiting, then "in jail").
const COLLINS = [3.0961, 2.1314, 1.8849, 2.1624, 2.3285, 2.9631, 2.2621, 0.865, 2.321, 2.3003, 2.2695,
  2.7017, 2.604, 2.3721, 2.4649, 2.92, 2.7924, 2.5945, 2.9356, 3.0852, 2.8836, 2.8358, 1.048, 2.7357,
  3.1858, 3.0659, 2.7072, 2.6789, 2.8074, 2.5861, 0, 2.6774, 2.6252, 2.3661, 2.5006, 2.4326, 0.8669,
  2.1864, 2.1799, 2.626, 3.9499];

function landingFrequencies(rolls: number) {
  const sc = newGameScenario(classic, ['A', 'B']);
  sc.players.forEach((p) => (p.cash = [1e9, 1e9]));
  const rng = createRng(42);
  const leave = heuristicPolicy({ ...PROFILES.aggressive, jail: 'leave' });
  const g = new Game(classic, { ...classicRules, roundCap: Infinity }, buildState(classic, sc, rng), [leave, leave], rng);
  const counts = new Array(41).fill(0);
  let n = 0;
  g.onRollEnd = (p) => {
    const pl = g.s.players[p];
    counts[pl.inJail ? 40 : pl.pos]++;
    n++;
  };
  while (n < rolls) g.playTurn();
  return counts.map((c) => (c / n) * 100);
}

describe('movement matches the published Markov solution (classic board)', () => {
  const freq = landingFrequencies(1_500_000);
  it('every square within 0.12 percentage points of Truman Collins', () => {
    const worst = COLLINS.map((ref, i) => ({ i, ref, got: freq[i], d: Math.abs(freq[i] - ref) })).sort((a, b) => b.d - a.d)[0];
    expect(worst.d, `square ${worst.i}: ${worst.got.toFixed(3)} vs ${worst.ref}`).toBeLessThan(0.12);
  });
});

describe('rule audit over simulated games', () => {
  const cases = [
    ['Grand, Hausregeln ohne H10, Spielstand', grand, exampleRules({ singleSite: false }), exampleEndgame],
    ['Grand, Hausregeln mit Schnellwürfel aus', grand, { ...exampleRules(), speedDie: null, triplesAnySpace: false }, exampleEndgame],
    ['Grand, unsere Hausregeln (mit H10), Spielstand', grand, exampleRules(), exampleEndgame],
    ['Grand, offiziell, Spielstand', grand, grandRules, exampleEndgame],
    ['Grand, offiziell, neues Spiel', grand, grandRules, newGameScenario(grand, ['A', 'B', 'C', 'D'])],
    ['Grand, Hausregeln, neues Spiel', grand, exampleRules({ singleSite: true }), newGameScenario(grand, ['A', 'B', 'C', 'D', 'E'])],
    ['Classic, offiziell, neues Spiel', classic, classicRules, newGameScenario(classic, ['A', 'B', 'C', 'D'])],
  ] as const;
  for (const [label, ed, rules, sc] of cases) {
    it(label, () => {
      const r = audit(ed, rules, sc, 150);
      expect(r.violations).toEqual([]);
      expect(r.rolls).toBeGreaterThan(1000);
    });
  }
});
