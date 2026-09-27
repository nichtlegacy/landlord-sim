// Trading, raising cash by choice, bot registry, common random numbers, seat rotation, win kinds.
import { describe, expect, it } from 'vitest';
import { classicRules, classic } from '../editions/classic';
import { grandRules, grand } from '../editions/grand';
import { exampleEndgame, exampleRules } from '../scenarios/example';
import { run, replay } from '../sim/runner';
import { eventText } from '../ui/events';
import { Game } from './game';
import { createPolicy, PROFILES, STYLE_IDS } from './policy';
import { createRng } from './rng';
import { buildState, newGameScenario, type Scenario, type ScenarioProperty } from './state';
import type { RuleConfig } from './types';

const make = (sc: Scenario, rules: RuleConfig = classicRules, ids?: string[], ed = classic) => {
  const rng = createRng(1);
  const policies = sc.players.map((_, i) => createPolicy(ids?.[i] ?? 'balanced', createRng(99)));
  return new Game(ed, rules, buildState(ed, sc, rng), policies, rng, { log: true });
};
const two = (props: ScenarioProperty[], cash: [number, number] = [1500, 1500]) => {
  const sc = newGameScenario(classic, ['A', 'B']);
  sc.players[0].cash = [cash[0], cash[0]];
  sc.players[1].cash = [cash[1], cash[1]];
  sc.properties = props;
  return sc;
};
const own = (owner: number, ...spaces: number[]) => spaces.map((space) => ({ space, owner }));
// classic: orange 16/18/19, red 21/23/24, stations 5/15/25/35
const ORANGE = [16, 18, 19], RED = [21, 23, 24];

describe('trading', () => {
  it('two players swap so that both complete a set', () => {
    const g = make(two([...own(0, 16, 18, 21), ...own(1, 19, 23, 24)]));
    (g as any).tradePhase(0);
    expect(g.trades).toBe(1);
    expect(ORANGE.every((i) => g.s.owner[i] === 0)).toBe(true);
    expect(RED.every((i) => g.s.owner[i] === 1)).toBe(true);
    const e = g.log!.find((x) => x.t === 'trade');
    expect(eventText(e!, { names: ['A', 'B'], ed: classic })).toMatch(/^trades with B: gets Library Lane, gives Lantern Street/);
  });

  it('no trade when the buyer cannot pay and has nothing the seller needs', () => {
    const g = make(two([...own(0, 16, 18), ...own(1, 19)], [20, 1500]));
    (g as any).tradePhase(0);
    expect(g.trades).toBe(0);
    expect(g.s.owner[19]).toBe(1);
  });

  it('a set is sold for cash when both sides gain by their valuation, and the price is paid', () => {
    const g = make(two([...own(0, 16, 18), ...own(1, 19)], [3000, 100]));
    const before = g.s.players[0].cash + g.s.players[1].cash;
    (g as any).tradePhase(0);
    expect(g.s.owner[19]).toBe(0);
    const e = g.log!.find((x) => x.t === 'trade')!;
    expect(e.t === 'trade' && e.cash).toBeGreaterThan(200); // more than the list price: it completes a set
    expect(g.s.players[0].cash + g.s.players[1].cash).toBe(before); // cash only moves between them
  });

  it('bots that do not trade (Friedman) neither offer nor accept', () => {
    const g = make(two([...own(0, 16, 18, 21), ...own(1, 19, 23, 24)]), classicRules, ['balanced', 'friedman']);
    (g as any).tradePhase(0);
    expect(g.trades).toBe(0);
  });

  it('the engine refuses illegal trades and cash that is not there', () => {
    const g = make(two([...own(0, 16, 18, 19, 21), ...own(1, 23)]));
    g.s.level[16] = 1; g.s.supply.houses--; g.changed();
    const accept = () => true;
    (g.policies[1] as any).acceptTrade = accept;
    expect(() => g.trade(0, { to: 1, give: [18], get: [], cash: 0 })).toThrow(/cannot give/); // house in the group
    expect(() => g.trade(0, { to: 1, give: [23], get: [], cash: 0 })).toThrow(/cannot give/); // not his
    expect(() => g.trade(0, { to: 0, give: [21], get: [], cash: 0 })).toThrow(/partner/);
    expect(g.trade(0, { to: 1, give: [21], get: [], cash: 5000 })).toBe(false); // cannot pay
    expect(g.trade(0, { to: 1, give: [21], get: [23], cash: 0 })).toBe(true);
  });

  it('the receiver of mortgaged property pays 10 % interest at once', () => {
    const g = make(two([...own(0, 21), { space: 23, owner: 1, mortgaged: true }]));
    (g.policies[1] as any).acceptTrade = () => true;
    const c0 = g.s.players[0].cash;
    expect(g.trade(0, { to: 1, give: [21], get: [23], cash: 0 })).toBe(true);
    expect(g.s.players[0].cash).toBe(c0 - 11); // Guild Street: mortgage 110, interest 11
    expect(g.s.mortgaged[23]).toBe(true);
  });

  it('with trading switched off nobody trades', () => {
    const st = run({ edition: classic, rules: { ...classicRules, trading: false }, scenario: newGameScenario(classic, ['A', 'B', 'C']), profiles: ['balanced', 'aggressive', 'cautious'], games: 200, seed: 3 });
    expect(st.trades).toBe(0);
    const on = run({ edition: classic, rules: classicRules, scenario: newGameScenario(classic, ['A', 'B', 'C']), profiles: ['balanced', 'aggressive', 'cautious'], games: 200, seed: 3 });
    expect(on.trades).toBeGreaterThan(200);
  });
});

describe('raising cash by choice', () => {
  it('mortgages a lone station to buy the street that completes a set', () => {
    const g = make(two([...own(0, 16, 18, 5)], [250, 1500]));
    (g as any).landProperty(0, 19, { dice: 7 }); // Library Lane $200: affordable, but it would eat the reserve
    expect(g.s.owner[19]).toBe(0);
    expect(g.s.mortgaged[5]).toBe(true);
    expect(g.log!.some((e) => e.t === 'mortgage' && e.reason === 'buy')).toBe(true);
  });

  it('does not borrow for a street that neither completes nor blocks a set', () => {
    const g = make(two([...own(0, 5)], [50, 1500]), { ...classicRules, auctionOnDecline: false });
    (g as any).landProperty(0, 39, { dice: 7 }); // Lighthouse Point, nothing else dark blue
    expect(g.s.owner[39]).toBe(-1);
    expect(g.s.mortgaged[5]).toBe(false);
  });

  it('mortgages outside the set to build, but never a street of a set', () => {
    const g = make(two([...own(0, 16, 18, 19, 5, 12)], [300, 1500]));
    (g as any).buildOnGroup(0, 'orange');
    expect(ORANGE.some((i) => g.s.level[i] > 0)).toBe(true);
    expect(g.s.mortgaged[5] || g.s.mortgaged[12]).toBe(true);
    expect(ORANGE.some((i) => g.s.mortgaged[i])).toBe(false);
  });

  it('cautious players do not borrow', () => {
    const g = make(two([...own(0, 16, 18, 5)], [150, 1500]), { ...classicRules, auctionOnDecline: false }, ['cautious', 'balanced']);
    (g as any).landProperty(0, 19, { dice: 7 });
    expect(g.s.owner[19]).toBe(-1);
  });
});

describe('bot registry', () => {
  it('every profile builds a policy, styles are the everyday three', () => {
    for (const id of Object.keys(PROFILES)) expect(typeof createPolicy(id, createRng(1)).buy).toBe('function');
    expect(STYLE_IDS).toEqual(['balanced', 'aggressive', 'cautious']);
    expect(() => createPolicy('nope', createRng(1))).toThrow(/unknown profile/);
  });

  it('literature presets play whole games', () => {
    const st = run({ edition: classic, rules: classicRules, scenario: newGameScenario(classic, ['A', 'B', 'C', 'D', 'E']), profiles: ['friedman', 'fp_a', 'fp_b', 'fp_c', 'darling'], games: 100, seed: 1, rotateStart: true });
    expect(st.wins.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe('dice and turns', () => {
  it('without doubles-again every turn is one roll', () => {
    const sc = newGameScenario(classic, ['A', 'B']);
    const g = make(sc, { ...classicRules, doublesAgain: false });
    let rolls = 0;
    g.onRollEnd = () => rolls++;
    for (let t = 0; t < 400; t++) { const before = rolls; g.playTurn(); expect(rolls - before).toBeLessThanOrEqual(1); }
    expect(g.log!.some((e) => e.t === 'third_double')).toBe(false);
  });

  it('each player has his own dice stream: a rule change elsewhere keeps his rolls (common random numbers)', () => {
    const dice = (rules: RuleConfig) => {
      const g = make(newGameScenario(classic, ['A', 'B', 'C']), rules);
      while (g.s.round < 30) g.playTurn();
      return g.log!.filter((e) => e.player === 1 && e.t === 'roll').map((e) => (e.t === 'roll' ? e.dice.join() : ''));
    };
    const a = dice(classicRules), b = dice({ ...classicRules, freeParkingPot: true, goSalary: 400 });
    const n = Math.min(a.length, b.length, 15);
    expect(n).toBeGreaterThan(10);
    expect(b.slice(0, n)).toEqual(a.slice(0, n));
  });
});

describe('runner statistics', () => {
  const sc = newGameScenario(classic, ['A', 'B', 'C']);
  it('rotating starts cycle through the seats, seat wins add up', () => {
    const st = run({ edition: classic, rules: classicRules, scenario: sc, profiles: ['balanced', 'balanced', 'balanced'], games: 300, seed: 5, rotateStart: true });
    expect(st.samples.slice(0, 6).map((s) => s.start)).toEqual([0, 1, 2, 0, 1, 2]);
    expect(st.seatWins.reduce((a, b) => a + b, 0)).toBe(300);
    expect(st.samples.map((s) => s.k)).toEqual([...Array(300).keys()]);
  });
  it('wins at the round cap are counted separately', () => {
    const st = run({ edition: classic, rules: { ...classicRules, roundCap: 5 }, scenario: sc, profiles: ['balanced', 'balanced', 'balanced'], games: 50, seed: 1 });
    expect(st.capWins.reduce((a, b) => a + b, 0)).toBe(st.timeouts);
    expect(st.timeouts).toBe(50);
  });
  it('replay reproduces a game from its seed and start', () => {
    const cfg = { edition: classic, rules: classicRules, scenario: sc, profiles: ['balanced', 'aggressive', 'cautious'], games: 20, seed: 9, rotateStart: true };
    const st = run(cfg);
    for (const s of st.samples.slice(0, 5)) expect(replay(cfg, s.seed, s.start).winner).toBe(s.winner);
  });
});

describe('events as data', () => {
  it('every event of whole games turns into readable text', () => {
    const seen = new Set<string>();
    const cases: [typeof grand, RuleConfig, Scenario][] = [
      [grand, exampleRules(), exampleEndgame],
      [grand, grandRules, newGameScenario(grand, ['A', 'B', 'C', 'D'])],
      [classic, classicRules, newGameScenario(classic, ['A', 'B', 'C'])],
    ];
    for (const [ed, rules, sc] of cases) for (let seed = 1; seed <= 6; seed++) {
      const cfg = { edition: ed, rules, scenario: sc, profiles: sc.players.map((_, i) => STYLE_IDS[i % 3]), games: 1, seed };
      const names = sc.players.map((p) => p.name);
      for (const f of replay(cfg, seed).frames) for (const e of f.events) {
        seen.add(e.t);
        const text = eventText(e, { names, ed });
        expect(text).not.toMatch(/undefined|NaN|\[object/);
      }
    }
    for (const t of ['roll', 'buy', 'rent', 'build', 'card', 'trade', 'bankrupt', 'mortgage', 'auction_won']) expect(seen).toContain(t);
  });
});
