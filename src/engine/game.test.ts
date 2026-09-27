import { describe, expect, it } from 'vitest';
import { grandRules, grand } from '../editions/grand';
import { applyAmounts, applyHouseRules, HOUSE_RULES, toggleRule } from '../house-rules';
import { exampleEndgame, exampleRules } from '../scenarios/example';
import { Game } from './game';
import { heuristicPolicy, PROFILES } from './policy';
import { createRng } from './rng';
import { buildState, newGameScenario, type Scenario } from './state';
import type { RuleConfig } from './types';

const policies = (n: number) => Array.from({ length: n }, () => heuristicPolicy(PROFILES.balanced));
const make = (sc: Scenario, rules: RuleConfig = grandRules, seed = 1) => {
  const rng = createRng(seed);
  return new Game(grand, rules, buildState(grand, sc, rng), policies(sc.players.length), rng);
};

describe('edition data', () => {
  it('has 52 spaces with corners every 13', () => {
    expect(grand.spaces).toHaveLength(52);
    expect([0, 13, 26, 39].map((i) => grand.spaces[i].type)).toEqual(['go', 'jail', 'free_parking', 'go_to_jail']);
  });
  it('has 16 cards per deck', () => {
    expect(grand.decks.chance).toHaveLength(16);
    expect(grand.decks.community_chest).toHaveLength(16);
    expect(grand.decks.bus).toHaveLength(16);
  });
});

describe('rent', () => {
  const g = make(exampleEndgame);
  it('streets: skyscraper, houses, all-but-one doubled', () => {
    expect(g.rent(30, 7)).toBe(2100); // Clocktower Square, skyscraper
    expect(g.rent(37, 7)).toBe(120); // Rose Garden, 1 house
    expect(g.rent(34, 7)).toBe(44); // Orchard Avenue, yellow 3/4 → x2
    expect(g.rent(1, 7)).toBe(2); // Tannery Lane, brown 1/3
  });
  it('stations with depots, mortgaged pays nothing, utilities by dice', () => {
    expect(g.rent(6, 7)).toBe(400); // 4 stations x depot
    expect(g.rent(40, 7)).toBe(0); // Hillside Road, mortgaged
    g.s.owner[10] = 2;
    g.changed(); // direct edits of the state must invalidate the derived caches
    expect(g.rent(10, 8)).toBe(32); // one utility: 4x dice
  });
});

describe('building', () => {
  it('builds evenly within the per-action cap (H3) only when standing on the group (H4)', () => {
    const sc = newGameScenario(grand, ['A', 'B']);
    sc.players[0].cash = [5000, 5000];
    sc.properties = [48, 49].map((space) => ({ space, owner: 0 })); // dark blue 2/3
    const g = make(sc, exampleRules({ singleSite: false }));
    (g as any).onOwnLanding(0, 48);
    expect([g.s.level[48], g.s.level[49]]).toEqual([3, 3]);
    expect(g.s.supply.houses).toBe(32 - 6);
  });
  it('H10 adds one house per landing on a lone street', () => {
    const sc = newGameScenario(grand, ['A', 'B']);
    sc.players[0].cash = [5000, 5000];
    sc.properties = [{ space: 16, owner: 0 }];
    const g = make(sc, exampleRules({ singleSite: true }));
    (g as any).onOwnLanding(0, 16);
    (g as any).onOwnLanding(0, 16);
    expect(g.s.level[16]).toBe(2);
  });
  it('no skyscraper without the full group', () => {
    const sc = newGameScenario(grand, ['A', 'B']);
    sc.players[0].cash = [50000, 50000];
    sc.properties = [34, 35, 37].map((space) => ({ space, owner: 0 }));
    const g = make(sc, grandRules);
    (g as any).buildOnGroup(0, 'yellow');
    expect([34, 35, 37].map((i) => g.s.level[i])).toEqual([5, 5, 5]);
  });
});

describe('movement', () => {
  it('pays $400 for landing exactly on GO (H5), $200 for passing', () => {
    const sc = newGameScenario(grand, ['A', 'B']);
    const g = make(sc, exampleRules({ singleSite: false }));
    g.s.players[0].pos = 50;
    (g as any).advance(0, 2);
    expect(g.s.players[0].cash).toBe(2500 + 400);
    (g as any).advance(0, 60);
    expect(g.s.players[0].cash).toBe(2900 + 200);
  });
  it('bus tickets reach forward to the next corner only', () => {
    const g = make(newGameScenario(grand, ['A', 'B']));
    g.s.players[0].pos = 10;
    expect(g.ticketTargets(0)).toEqual([11, 12, 13]);
    g.s.players[0].pos = 39;
    expect(g.ticketTargets(0).at(-1)).toBe(0);
  });
});

describe('invariants over many games', () => {
  for (const [name, rules] of [['house', exampleRules({ singleSite: true })], ['official', grandRules]] as const) {
    it(`${name}: supply and cash stay valid, every game ends`, () => {
      for (let seed = 1; seed <= 300; seed++) {
        const g = make(exampleEndgame, rules, seed);
        let guard = 0;
        while (g.activePlayers().length > 1 && g.s.round <= rules.roundCap) {
          g.playTurn();
          const { houses, hotels, skyscrapers, depots } = g.s.supply;
          expect(Math.min(houses, hotels, skyscrapers, depots)).toBeGreaterThanOrEqual(0);
          for (const pl of g.s.players) expect(pl.cash).toBeGreaterThanOrEqual(0);
          if (++guard > 100_000) throw new Error('stuck');
        }
        const used = g.s.level.reduce((a, l) => a + (l > 0 && l <= 4 ? l : 0), 0);
        expect(used + g.s.supply.houses).toBeLessThanOrEqual(32);
      }
    });
  }
});

describe('house rules in play', () => {
  const setup = (rules: RuleConfig) => {
    const sc = newGameScenario(grand, ['A', 'B']);
    return make(sc, rules, 7);
  };
  it('H6: three attempts at doubles, then out for free and rolling from the next turn', () => {
    const g = setup(exampleRules({ singleSite: false }));
    const pl = g.s.players[0];
    pl.inJail = true; pl.pos = 13; pl.jailTurns = 0;
    g.policies[0] = { ...g.policies[0], jail: () => 'roll' };
    let flip = 0;
    (g as any).d6 = () => (flip++ % 2) + 1; // 1, 2, 1, 2, ...: never doubles
    const cash = pl.cash;
    const turn = () => { g.s.current = 0; g.playTurn(); };
    turn(); turn();
    expect([pl.inJail, pl.jailTurns, pl.pos]).toEqual([true, 2, 13]);
    turn(); // third miss: free, no fine, no move this turn
    expect([pl.inJail, pl.jailTurns, pl.pos, pl.cash]).toEqual([false, 0, 13, cash]);
    turn(); // next turn: a normal roll moves the piece
    expect(pl.pos).not.toBe(13);
  });
  it('H6: doubles in jail only free the player, who then rolls a normal turn', () => {
    const g = setup(exampleRules({ singleSite: false }));
    const pl = g.s.players[0];
    pl.inJail = true; pl.pos = 13; pl.jailTurns = 1;
    g.policies[0] = { ...g.policies[0], jail: () => 'roll', busTicketTarget: () => null };
    const rolls = [3, 3, 1, 2]; // jail: 3+3 doubles; then the normal turn rolls 1+2
    (g as any).d6 = () => rolls.shift() ?? 1;
    g.s.current = 0; g.playTurn();
    expect(pl.inJail).toBe(false);
    expect(pl.jailTurns).toBe(0);
    // moved by the normal roll (1+2 plus the speed die), not by the jail doubles (6)
    expect(pl.pos).not.toBe(13 + 6);
    expect(pl.pos).toBeGreaterThanOrEqual(13 + 3);
  });
  it('official rules: after the third miss the fine is paid and the piece moves', () => {
    const g = setup(grandRules);
    const pl = g.s.players[0];
    pl.inJail = true; pl.pos = 13; pl.jailTurns = 2;
    g.policies[0] = { ...g.policies[0], jail: () => 'roll' };
    (g as any).d6 = (() => { let f = 0; return () => (f++ % 2) + 1; })();
    const cash = pl.cash;
    g.s.current = 0; g.playTurn();
    expect(pl.inJail).toBe(false);
    expect(pl.pos).toBe(13 + 3);
    expect(pl.cash).toBeLessThanOrEqual(cash - 50);
  });
  it('H9: bail goes into the pot, Free Parking pays it out', () => {
    const g = setup(exampleRules({ singleSite: false }));
    const pl = g.s.players[0];
    pl.inJail = true; pl.pos = 13;
    g.policies[0] = { ...g.policies[0], jail: () => 'pay' };
    (g as any).jailTurn(0);
    expect(g.s.pot).toBe(100);
    pl.pos = 26;
    (g as any).resolve(0, { dice: 7 });
    expect(g.s.pot).toBe(0);
    expect(pl.cash).toBe(2500);
  });
  it('official rules: bail $50 to the bank, no pot', () => {
    const g = setup(grandRules);
    const pl = g.s.players[0];
    pl.inJail = true; pl.pos = 13;
    g.policies[0] = { ...g.policies[0], jail: () => 'pay' };
    (g as any).jailTurn(0);
    expect(pl.cash).toBe(2450);
    expect(g.s.pot).toBe(0);
  });
  it('H8: with no tickets left, a player facing a skyscraper rides away instead of paying', () => {
    const g = make(exampleEndgame, exampleRules({ singleSite: false }), 3);
    const ada = g.s.players[0], cleo = g.s.players[2];
    cleo.pos = 29; // Guild Street, Ada's skyscraper: $2,050
    expect(g.policies[2].rideInsteadOfStay(g, 2)).toBe(true);
    const adaBefore = ada.cash;
    (g as any).rideToNextCard(2);
    expect(ada.cash - adaBefore).toBeLessThan(2050);
  });
});

describe('strategic bus choice (H8) looks at the next roll', () => {
  it('Ada rides from Lock Street to the Community Fund past Cleo\'s oranges; Cleo stays', () => {
    const g = make(exampleEndgame, exampleRules({ singleSite: false }), 5);
    g.s.players[0].pos = 16; // Chapel Row (11) + 5 = Lock Street
    expect(g.policies[0].rideInsteadOfStay(g, 0)).toBe(true);
    g.s.players[2].pos = 16;
    expect(g.policies[2].rideInsteadOfStay(g, 2)).toBe(false);
  });
});

describe('agreements between players', () => {
  const withDeals = (agreements: Scenario['agreements']) => make({ ...exampleEndgame, agreements }, exampleRules({ singleSite: false }), 2);
  it('caps rent at Ben\'s stations for Cleo only', () => {
    const g = withDeals([{ kind: 'rent', payer: 2, owner: 1, scope: 'stations', maxAmount: 100 }]);
    expect(g.rentFor(2, 6, 7)).toBe(100);
    expect(g.rentFor(0, 6, 7)).toBe(400);
    expect(g.rentFor(2, 34, 7)).toBe(44); // yellow not covered
  });
  it('percent deals and jokers reduce the payment, jokers count down', () => {
    const g = withDeals([
      { kind: 'rent', payer: 1, owner: 0, scope: { group: 'red' }, percent: 50 },
      { kind: 'joker', payer: 2, owner: null, uses: 2, percent: 100 },
    ]);
    expect(g.rentFor(1, 30, 7)).toBe(1050);
    const cleo = g.s.players[2], ada = g.s.players[0];
    const before = [cleo.cash, ada.cash];
    cleo.pos = 30;
    (g as any).landProperty(2, 30, { dice: 7 });
    expect([cleo.cash, ada.cash]).toEqual(before);
    expect(g.s.agreements[1]).toMatchObject({ uses: 1 });
  });
});

describe('H11: jail and rent', () => {
  it('a jailed owner collects nothing unless he buys out at that moment', () => {
    const g = make(exampleEndgame, exampleRules({ singleSite: false }), 4);
    const ben = g.s.players[1], ada = g.s.players[0];
    ben.goojf = [];
    g.policies[1] = { ...g.policies[1], bailForRent: () => false };
    ada.pos = 6;
    const [aj, jj] = [ada.cash, ben.cash];
    (g as any).landProperty(0, 6, { dice: 7 });
    expect([ada.cash, ben.cash]).toEqual([aj, jj]);
    g.policies[1] = { ...g.policies[1], bailForRent: () => true };
    (g as any).landProperty(0, 6, { dice: 7 });
    expect(ben.inJail).toBe(false);
    expect(ben.cash).toBe(jj - 100 + 400);
    expect(g.s.pot).toBe(70 + 100);
  });
  it('paying on your own turn frees you but you sit this turn out', () => {
    const g = make(exampleEndgame, exampleRules({ singleSite: false }), 4);
    const ben = g.s.players[1];
    ben.goojf = [];
    g.policies[1] = { ...g.policies[1], jail: () => 'pay' };
    g.s.current = 1;
    g.playTurn();
    expect(ben.inJail).toBe(false);
    expect(ben.pos).toBe(13);
  });
  it('official rules: jailed owners still collect', () => {
    const g = make(exampleEndgame, grandRules, 4);
    const ben = g.s.players[1];
    const jj = ben.cash;
    g.s.players[0].pos = 6;
    (g as any).landProperty(0, 6, { dice: 7 });
    expect(ben.cash).toBe(jj + 400);
    // the real deal: Cleo pays at most $100 at Ben's stations
    g.s.players[2].pos = 6;
    (g as any).landProperty(2, 6, { dice: 7 });
    expect(ben.cash).toBe(jj + 500);
  });
});

describe('H12: no building limit', () => {
  const nine: Scenario = { ...exampleEndgame, properties: [...exampleEndgame.properties, { space: 48, owner: 1, level: 6 }] };
  it('rejects a ninth skyscraper with the official supply, with a readable message', () => {
    expect(() => buildState(grand, nine, createRng(1))).toThrow(/skyscrapers \(9 instead of 8\)/);
  });
  it('accepts it with H12 and keeps building', () => {
    const st = buildState(grand, nine, createRng(1), { unlimitedSupply: true });
    expect(st.supply.skyscrapers).toBeGreaterThan(1000);
  });
});

describe('H16 skyscraper with three of four streets', () => {
  const three = () => {
    const sc = newGameScenario(grand, ['A', 'B']);
    sc.players[0].cash = [5000, 5000];
    sc.properties = [27, 29, 30].map((space) => ({ space, owner: 0, level: 5 })); // three reds with hotels, Belfry Lane (31) at the bank
    return sc;
  };
  it('landing exactly on one street builds the skyscraper with H10 + H16', () => {
    const g = make(three(), applyHouseRules(grandRules, ['H10', 'H16']));
    g.s.players[0].pos = 30;
    (g as any).onOwnLanding(0, 30);
    expect(g.s.level[30]).toBe(6);
    expect([g.s.level[27], g.s.level[29]]).toEqual([5, 5]);
  });
  it('without H16 the full-group rule still blocks it', () => {
    const g = make(three(), applyHouseRules(grandRules, ['H10']));
    g.s.players[0].pos = 30;
    (g as any).onOwnLanding(0, 30);
    expect(g.s.level[30]).toBe(5);
  });
});

describe('bank return, bankruptcy to the bank, auctions (H14, H15, H17, H18)', () => {
  const two = () => {
    const sc = newGameScenario(grand, ['A', 'B']);
    sc.players[0].cash = [0, 0];
    sc.properties = [{ space: 51, owner: 0 }, { space: 1, owner: 0, mortgaged: true }];
    return sc;
  };
  it('H14: short of cash, property goes back to the bank for 75 % (mortgage plus 10 % interest netted)', () => {
    const g = make(two(), applyHouseRules(grandRules, ['H14']));
    // mortgage Cliff Terrace ($200), then return the least useful first:
    // Tannery Lane 0.75 * 60 - 1.1 * 30 = 12, Cliff Terrace 0.75 * 400 - 1.1 * 200 = 80
    expect(g.pay(0, 250, 'bank')).toBe(true);
    expect([g.s.owner[1], g.s.owner[51]]).toEqual([-1, -1]);
    expect(g.s.players[0].cash).toBe(200 + 12 + 80 - 250);
  });
  it('mortgage payoff is loan plus 10 % rounded up, without floating point drift', () => {
    const g = make(two(), grandRules);
    expect(g.mortgagePayoff(1)).toBe(33); // Tannery Lane $30: 30 * 1.1 is 33.000000000000004 in floats
    expect(g.mortgagePayoff(51)).toBe(220); // Cliff Terrace $200
    expect(g.mortgagePayoff(6)).toBe(110); // Old Town Station $100
  });
  it('H17: a property the player does not buy stays with the bank', () => {
    const official = make(two(), grandRules);
    const house = make(two(), applyHouseRules(grandRules, ['H17']));
    // nothing left to mortgage either, so player 0 cannot raise the price
    for (const g of [official, house]) { g.s.players[0].cash = 0; g.s.players[1].cash = 5000; g.s.mortgaged[51] = true; g.changed(); }
    (official as any).landProperty(0, 3, { dice: 7 }); // Brickworks Road, player 0 cannot pay
    (house as any).landProperty(0, 3, { dice: 7 });
    expect(official.s.owner[3]).toBe(1); // official: auctioned, the rich player wins
    expect(house.s.owner[3]).toBe(-1);
  });
  it('H18: on the Auction space the player may decline; with nothing unowned it still moves to the highest rent', () => {
    const rules = applyHouseRules(grandRules, ['H18']);
    const poor = make(two(), rules);
    poor.s.players[0].cash = 0; poor.s.players[1].cash = 5000; poor.s.players[0].pos = 14;
    (poor as any).auctionSpace(0);
    expect(poor.s.owner.filter((o) => o === 1)).toHaveLength(0); // no auction started, so B bought nothing
    const rich = make(two(), rules);
    rich.s.players[0].cash = 5000; rich.s.players[0].pos = 14;
    (rich as any).auctionSpace(0);
    expect(rich.s.owner.filter((o) => o === 0).length).toBeGreaterThan(2); // wanted one and started the auction
    const sold = make(two(), rules);
    for (let i = 0; i < 52; i++) if (sold.isProperty(i) && sold.s.owner[i] < 0) sold.s.owner[i] = 1;
    sold.changed();
    sold.s.players[0].pos = 14;
    (sold as any).auctionSpace(0);
    expect(sold.s.players[0].pos).not.toBe(14); // moved on to the highest rent
  });
  it('without H14 the same debt means bankruptcy', () => {
    const g = make(two(), grandRules);
    expect(g.pay(0, 250, 1)).toBe(false);
    expect(g.s.owner[51]).toBe(1); // official: the creditor takes the property
  });
  it('H15: bankrupt over rent, property goes to the bank, creditor gets the cash', () => {
    const g = make(two(), applyHouseRules(grandRules, ['H15']));
    const before = g.s.players[1].cash;
    expect(g.pay(0, 5000, 1, true)).toBe(false);
    expect(g.s.owner[51]).toBe(-1);
    expect(g.s.owner[1]).toBe(-1);
    expect(g.s.players[1].cash).toBe(before + 200); // Cliff Terrace mortgage money
  });
  it('H15 covers rent only: other debts to a player still transfer the property', () => {
    const g = make(two(), applyHouseRules(grandRules, ['H15']));
    expect(g.pay(0, 5000, 1)).toBe(false); // e.g. a card paying each player
    expect([g.s.owner[51], g.s.owner[1]]).toEqual([1, 1]);
  });
  it('H14: buildings in the group are sold before a street goes back to the bank', () => {
    const sc = two();
    sc.properties = [{ space: 34, owner: 0 }, { space: 37, owner: 0, level: 1 }]; // Orchard Avenue unbuilt, Rose Garden 1 house (H10)
    const g = make(sc, applyHouseRules(grandRules, ['H14']));
    // house 75 + mortgages 130 + 140 = 345, then Orchard Avenue back for 0.75 * 260 - 143 = 52
    expect(g.pay(0, 390, 'bank')).toBe(true);
    expect([g.s.level[37], g.s.owner[34], g.s.owner[37]]).toEqual([0, -1, 0]);
  });
  it('H13: speed die off, and GO amounts can be switched off', () => {
    const r = applyAmounts(applyHouseRules(grandRules, ['H13']), { goPass: 0, goLand: 400, jailFine: 100 });
    expect(r.speedDie).toBeNull();
    const g = make(newGameScenario(grand, ['A', 'B']), r);
    g.s.players[0].pos = 50;
    (g as any).advance(0, 5);
    expect(g.s.players[0].cash).toBe(2500);
    g.s.players[0].pos = 50;
    (g as any).advance(0, 2);
    expect(g.s.players[0].cash).toBe(2900);
  });
});

describe('continuation after the abort', () => {
  const sc = () => {
    const s = newGameScenario(grand, ['A', 'B']);
    s.players[0].cash = [5000, 5000];
    s.properties = [48, 49].map((space) => ({ space, owner: 0 }));
    return s;
  };
  it('without buying, free property stays with the bank, also on the Auction space', () => {
    const g = make(sc(), { ...grandRules, buying: false });
    (g as any).landProperty(0, 3, { dice: 7 });
    expect(g.s.owner[3]).toBe(-1);
    g.s.players[0].pos = 14;
    (g as any).auctionSpace(0);
    expect(g.s.owner.filter((o) => o >= 0)).toHaveLength(2);
  });
  it('without building, nothing is built but mortgages can still be lifted', () => {
    const s = sc();
    s.properties.push({ space: 51, owner: 0, mortgaged: true });
    const g = make(s, { ...exampleRules(), building: false });
    (g as any).onOwnLanding(0, 48);
    (g as any).freeActions(0);
    expect([g.s.level[48], g.s.level[49], g.s.level[51]]).toEqual([0, 0, 0]);
    expect(g.s.mortgaged[51]).toBe(false);
  });
});

describe('H16: single-site building up to a skyscraper', () => {
  const lone = () => {
    const sc = newGameScenario(grand, ['A', 'B']);
    sc.players[0].cash = [9000, 9000];
    sc.properties = [{ space: 51, owner: 0, level: 4 }];
    return sc;
  };
  it('with H10 only, a lone street stops at four houses', () => {
    const g = make(lone(), applyHouseRules(grandRules, ['H10']));
    (g as any).onOwnLanding(0, 51);
    expect(g.s.level[51]).toBe(4);
  });
  it('with H16, each exact landing adds hotel, then skyscraper', () => {
    const g = make(lone(), applyHouseRules(grandRules, ['H10', 'H16']));
    (g as any).onOwnLanding(0, 51);
    expect(g.s.level[51]).toBe(5);
    (g as any).onOwnLanding(0, 51);
    expect(g.s.level[51]).toBe(6);
    (g as any).onOwnLanding(0, 51);
    expect(g.s.level[51]).toBe(6);
    expect(g.rent(51, 7)).toBe(3000);
  });
});

describe('house rule list', () => {
  it('is in numeric order', () => {
    const ids = HOUSE_RULES.map((h) => Number(h.id.slice(1)));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
  it('H16 is coupled to H10', () => {
    expect(applyHouseRules(grandRules, ['H16']).build.singleSiteMaxLevel).toBe(grandRules.build.singleSiteMaxLevel);
    expect(applyHouseRules(grandRules, ['H10', 'H16']).build.singleSiteMaxLevel).toBe(6);
    expect(toggleRule(['H3', 'H10', 'H16'], 'H10', false)).toEqual(['H3']);
    expect(toggleRule(['H3'], 'H16', true).sort()).toEqual(['H10', 'H16', 'H3']);
    expect(toggleRule(['H3'], 'H10', true).sort()).toEqual(['H10', 'H16', 'H3']);
  });
});
