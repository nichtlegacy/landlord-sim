// Player decisions. Policies only read the game; the engine validates and applies.
// Bots: one parametric heuristic (profiles below) and random legal moves (fuzzing, baseline).
import type { Game } from './game';
import type { Rng } from './rng';
import type { FundAction, TradeOffer } from './types';

export interface Policy {
  buy(g: Game, p: number, i: number): boolean;
  /** maximum the player would pay in an auction */
  bid(g: Game, p: number, i: number): number;
  /** asked before every single building unit (house, hotel, skyscraper, depot) */
  buildMore(g: Game, p: number, i: number, cost: number): boolean;
  jail(g: Game, p: number): 'card' | 'pay' | 'roll';
  tripleTarget(g: Game, p: number): number;
  /** bus without tickets: ride to the next Chance/CC instead of staying */
  rideInsteadOfStay(g: Game, p: number): boolean;
  ticketOrRide(g: Game, p: number): 'ticket' | 'ride';
  birthday(g: Game, p: number): 'cash' | 'ticket';
  /** use a bus ticket instead of rolling; null = roll */
  busTicketTarget(g: Game, p: number): number | null;
  auctionPick(g: Game, p: number, candidates: number[]): number;
  /** Auction space when starting is optional (H18): which property to auction, or null for none */
  startAuction(g: Game, p: number, candidates: number[]): number | null;
  /** properties to unmortgage at the end of the turn, in order */
  unmortgage(g: Game, p: number): number[];
  /** jailed owner: buy out now to collect this rent? (H11) */
  bailForRent(g: Game, p: number, rent: number): boolean;
  /** play a joker (percent off) against this rent? */
  useJoker(g: Game, p: number, owner: number, rent: number, percent: number): boolean;
  /** trades to offer before rolling (the engine tries at most three); none without the hook */
  proposeTrades?(g: Game, p: number): TradeOffer[];
  /** agree to this offer from `from`? Without the hook every offer is declined */
  acceptTrade?(g: Game, p: number, from: number, o: TradeOffer): boolean;
  /** short of cash before buying or building: mortgages and building sales to make first (null = none) */
  fund?(g: Game, p: number, reason: 'buy' | 'build', i: number, cost: number): FundAction[] | null;
}

export interface Profile {
  id: string;
  label: string;
  /** which bot plays (see BOTS) */
  bot: 'heuristic' | 'random';
  /** styles are the everyday choice; literature presets reproduce published bots */
  kind: 'style' | 'literature' | 'test';
  /** where a literature preset comes from */
  source?: string;
  /** cash kept back: base + share of the highest rent an opponent can charge ('max': the larger of the two) */
  reserveBase: number;
  reserveRentShare: number;
  reserveMode?: 'sum' | 'max';
  /** auction bid as a multiple of list price; 0 = never bids */
  bidFactor: number;
  /** leave jail by paying: always, never, or only while the board is still cheap */
  jail: 'leave' | 'stay' | 'smart';
  /** mortgage or sell elsewhere to buy property that completes or blocks a set, and to build on a set */
  leverage: boolean;
  /** proposes and accepts trades */
  trades: boolean;
  /** smallest advantage (in money) that makes a trade worth it */
  tradeMargin: number;
  /** how much a rival's gain from a trade counts against one's own, split over all opponents */
  rivalWeight: number;
  /** only these groups are bought freely; others only when the purchase completes a set */
  focus?: string[];
  /** groups never bought at list price (still bid on below it) */
  avoid?: string[];
  /** building past this level needs twice the reserve */
  buildTarget?: number;
}

const style = { bot: 'heuristic', kind: 'style', reserveMode: 'sum', leverage: true, trades: true } as const;
const lit = { bot: 'heuristic', kind: 'literature', reserveMode: 'sum', leverage: false, trades: true, tradeMargin: 0, rivalWeight: 0.5 } as const;

export const PROFILES: Record<string, Profile> = {
  balanced: { ...style, id: 'balanced', label: 'Balanced', reserveBase: 200, reserveRentShare: 0.5, bidFactor: 1.1, jail: 'smart', tradeMargin: 50, rivalWeight: 0.5 },
  aggressive: { ...style, id: 'aggressive', label: 'Aggressive', reserveBase: 50, reserveRentShare: 0.15, bidFactor: 1.5, jail: 'leave', tradeMargin: 0, rivalWeight: 0.3 },
  cautious: { ...style, id: 'cautious', label: 'Cautious', reserveBase: 400, reserveRentShare: 1.0, bidFactor: 0.8, jail: 'stay', leverage: false, tradeMargin: 150, rivalWeight: 0.8 },
  friedman: {
    ...lit, id: 'friedman', label: 'Friedman 2009', source: 'Friedman et al. 2009, Estimating the probability that the game of Monopoly never ends',
    reserveBase: 200, reserveRentShare: 1, reserveMode: 'max', bidFactor: 0, jail: 'stay', trades: false,
  },
  fp_a: { ...lit, id: 'fp_a', label: 'FP-A (all equal)', source: 'Bonjour et al. 2022, fixed policy A', reserveBase: 200, reserveRentShare: 0, bidFactor: 1, jail: 'leave' },
  fp_b: { ...lit, id: 'fp_b', label: 'FP-B (stations, dark blue)', source: 'Bonjour et al. 2022, fixed policy B', reserveBase: 200, reserveRentShare: 0, bidFactor: 1, jail: 'leave', focus: ['station', 'dark_blue'] },
  fp_c: { ...lit, id: 'fp_c', label: 'FP-C (stations, orange, light blue)', source: 'Bonjour et al. 2022, fixed policy C', reserveBase: 200, reserveRentShare: 0, bidFactor: 1, jail: 'leave', focus: ['station', 'orange', 'light_blue'] },
  darling: {
    ...lit, id: 'darling', label: 'Darling (3 houses)', source: 'Tim Darling, How to win at Monopoly',
    reserveBase: 200, reserveRentShare: 0.5, bidFactor: 1.1, jail: 'smart', leverage: true, avoid: ['utility'], buildTarget: 3,
  },
  random: {
    id: 'random', label: 'Random', bot: 'random', kind: 'test', reserveBase: 0, reserveRentShare: 0, bidFactor: 0, jail: 'smart',
    leverage: false, trades: true, tradeMargin: 0, rivalWeight: 0,
  },
};

/** the everyday styles (sensitivity analysis combines only these) */
export const STYLE_IDS = Object.values(PROFILES).filter((p) => p.kind === 'style').map((p) => p.id);

/** bot implementations by name; a new kind of bot is one entry here plus a profile using it */
export const BOTS: Record<Profile['bot'], (profile: Profile, rng: Rng) => Policy> = {
  heuristic: (profile) => heuristicPolicy(profile),
  random: (_profile, rng) => randomPolicy(rng),
};

/** a fresh policy for one player and one game; `rng` is only used by bots that decide at random */
export function createPolicy(id: string, rng: Rng): Policy {
  const profile = PROFILES[id];
  if (!profile) throw new Error(`unknown profile ${id}`);
  return BOTS[profile.bot](profile, rng);
}

/** probability of each move length for two white dice plus the speed die faces (bonus and bus count 0) */
// keyed by the faces array itself: the rules object lives for the whole run
const distCache = new WeakMap<object, [number, number][]>();
const NO_SPEED_DIE = {};
function stepDistribution(faces: readonly (number | string)[] | undefined): [number, number][] {
  const key = faces ?? NO_SPEED_DIE;
  let d = distCache.get(key);
  if (!d) {
    const fs = faces ?? [0];
    const acc = new Map<number, number>();
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (const f of fs) {
      const steps = a + b + (typeof f === 'number' ? f : 0);
      acc.set(steps, (acc.get(steps) ?? 0) + 1 / (36 * fs.length));
    }
    d = [...acc];
    distCache.set(key, d);
  }
  return d;
}

const NONE: TradeOffer[] = [];
const groupCache = new WeakMap<object, string[]>();
/** colour groups of the edition, listed once */
const streetGroups = (g: Game) => {
  let gs = groupCache.get(g.ed.groups);
  if (!gs) groupCache.set(g.ed.groups, (gs = Object.keys(g.ed.groups)));
  return gs;
};

/** expected landings of one opponent on one given square per round (about 1.2 landings per turn, spread over the board) */
const landRate = (g: Game) => 1.2 / g.n;
/** rounds of rent a trade valuation looks ahead */
const HORIZON = 25;

export function heuristicPolicy(profile: Profile): Policy {
  const reserveFor = (maxRent: number) => profile.reserveMode === 'max'
    ? Math.max(profile.reserveBase, profile.reserveRentShare * maxRent)
    : profile.reserveBase + profile.reserveRentShare * maxRent;
  const reserve = (g: Game, p: number) => reserveFor(g.maxRentAgainst(p));
  const cash = (g: Game, p: number) => g.s.players[p].cash;

  /** would this profile pay list price for space i? (focus and avoid lists) */
  const listPriceOk = (g: Game, p: number, i: number) => {
    const grp = g.groupOf[i]!;
    if (profile.avoid?.includes(grp)) return false;
    if (profile.focus && !profile.focus.includes(grp)) return grp !== 'station' && grp !== 'utility' && g.ownedIn(p, grp) + 1 >= g.threshold(grp);
    return true;
  };

  /** strategic weight: completing or blocking a building group is worth more than list price */
  const weight = (g: Game, p: number, i: number) => {
    const grp = g.groupOf[i]!;
    if (grp === 'station' || grp === 'utility') return 1.2;
    const len = g.members[grp].length;
    const mine = g.ownedIn(p, grp) + 1;
    if (mine >= g.threshold(grp)) return mine === len ? 2 : 1.7;
    for (let q = 0; q < g.s.players.length; q++) if (q !== p && g.active(q) && g.ownedIn(q, grp) + 1 >= g.threshold(grp)) return 1.5;
    return 1;
  };

  // ---- position values (used for bus rides, triples and bus tickets)
  // one context per decision: everything that does not depend on the square is computed once
  /** `scores`: spaceScore per square, filled on first use (the state does not change during one decision) */
  interface Ctx { reserve: number; cash: number; jail: number; cards: Map<number, number>; built: number[] | null; scores: Float64Array }
  let mortRev = -1, mortGame: Game | null = null, mortList: number[] = [], mortCheapest = Infinity;

  // one scratch context, reset per decision; decisions never nest, so reuse is safe
  let scratch: Ctx | null = null;
  const ctxOf = (g: Game, p: number): Ctx => {
    const maxRent = g.maxRentAgainst(p), c = cash(g, p);
    if (!scratch || scratch.scores.length !== g.n) scratch = { reserve: 0, cash: 0, jail: 0, cards: new Map(), built: null, scores: new Float64Array(g.n) };
    scratch.reserve = reserveFor(maxRent);
    scratch.cash = c;
    // going to jail is bad early and a shelter late, when the board is expensive
    scratch.jail = maxRent > 0.25 * c ? 30 : -50;
    scratch.cards.clear();
    scratch.built = null;
    scratch.scores.fill(NaN);
    return scratch;
  };

  /** value of ending a move on space i right now (negative = rent/tax owed); cards as their expected value */
  const spaceScore = (g: Game, p: number, i: number, c: Ctx, cards = true): number => {
    if (!cards) return rawScore(g, p, i, c, false);
    let v = c.scores[i];
    if (Number.isNaN(v)) c.scores[i] = v = rawScore(g, p, i, c, true);
    return v;
  };
  const rawScore = (g: Game, p: number, i: number, c: Ctx, cards: boolean): number => {
    const sp = g.sp(i), o = g.s.owner[i];
    if (g.isProperty(i)) {
      if (o < 0) return g.rules.buying && c.cash - sp.price! > c.reserve ? 0.2 * sp.price! * weight(g, p, i) : 0;
      if (o === p) {
        // standing on your own group is a chance to build under H4 / H10
        const grp = g.groupOf[i]!;
        const canBuild = g.rules.building && g.rules.build.timing === 'standing_on_group' && grp !== 'utility'
          && (grp === 'station' || g.meetsThreshold(p, grp) || g.rules.build.singleSiteOnLanding);
        return canBuild ? 40 : 10;
      }
      return -g.rentFor(p, i, 7);
    }
    switch (sp.type) {
      case 'tax': return g.rules.freeParkingPot ? -sp.amount! * 0.7 : -sp.amount!;
      case 'go_to_jail': return c.jail;
      case 'free_parking': return g.rules.freeParkingPot ? g.s.pot : 0;
      case 'go': return (g.rules.goLandTotal ?? g.rules.goSalary) - g.rules.goSalary;
      case 'birthday_gift': return sp.amount!;
      case 'chance': case 'community_chest': {
        if (!cards) return 0;
        let v = c.cards.get(i);
        if (v === undefined) { v = cardValue(g, p, sp.type, i, c); c.cards.set(i, v); }
        return v;
      }
      default: return 0;
    }
  };

  /** expected value of drawing from a deck, averaged over the cards still in it */
  const cardValue = (g: Game, p: number, deck: 'chance' | 'community_chest', pos: number, c: Ctx): number => {
    const idx = g.s.decks[deck];
    if (!idx.length) return 0;
    const others = g.activeCount() - 1;
    let sum = 0;
    for (const k of idx) {
      const e = g.ed.decks[deck][k].effect;
      switch (e.type) {
        case 'move_to': sum += spaceScore(g, p, e.target, c, false) + (e.target <= pos ? g.rules.goSalary : 0); break;
        case 'move_relative': sum += spaceScore(g, p, (pos + e.steps + g.n) % g.n, c, false); break;
        case 'move_nearest': {
          let t = pos;
          for (let d = 1; d <= g.n; d++) if (g.groupOf[(pos + d) % g.n] === e.kind) { t = (pos + d) % g.n; break; }
          const base = spaceScore(g, p, t, c, false);
          sum += base < 0 ? base * (e.rent_multiplier ?? 1) : base;
          break;
        }
        case 'collect': sum += e.amount; break;
        case 'pay': sum -= e.amount; break;
        case 'pay_each_player': sum -= e.amount * others; break;
        case 'collect_each_player': sum += e.amount * others; break;
        case 'repairs': {
          // [houses, hotels, skyscrapers, depots] owned by p, counted once per decision
          const b = (c.built ??= (() => {
            const n = [0, 0, 0, 0];
            for (let i = 0; i < g.n; i++) {
              if (g.s.owner[i] !== p) continue;
              const l = g.s.level[i];
              if (l === 6) n[2]++; else if (l === 5) n[1]++; else n[0] += l;
              if (g.s.depot[i]) n[3]++;
            }
            return n;
          })());
          sum -= b[0] * e.per_house + b[1] * e.per_hotel + b[2] * (e.per_skyscraper ?? e.per_hotel) + b[3] * (e.per_depot ?? 0);
          break;
        }
        case 'get_out_of_jail_free': sum += 50; break;
        case 'go_to_jail': sum += c.jail; break;
      }
    }
    return sum / idx.length;
  };

  /** expected value of the next roll from `from` (white dice + speed die; doubles and triples ignored) */
  const nextRollValue = (g: Game, p: number, from: number, c: Ctx) => {
    let sum = 0;
    for (const [steps, prob] of stepDistribution(g.rules.speedDie?.faces)) {
      sum += prob * (spaceScore(g, p, (from + steps) % g.n, c) + (from + steps >= g.n ? g.rules.goSalary : 0));
    }
    return sum;
  };

  /** now plus the roll after: this is what makes riding the bus past Cleo's oranges worth it */
  const positionValue = (g: Game, p: number, i: number, c: Ctx) => spaceScore(g, p, i, c) + nextRollValue(g, p, i, c);

  const nextCardSpace = (g: Game, from: number) => {
    let best = from, bestD = Infinity;
    for (const i of g.cardSpaces) {
      const d = (i - from + g.n) % g.n || g.n;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  const bid = (g: Game, p: number, i: number) => {
    const price = g.sp(i).price!;
    const want = price * profile.bidFactor * weight(g, p, i);
    return Math.max(0, Math.min(listPriceOk(g, p, i) ? want : Math.min(want, 0.8 * price), cash(g, p) - reserve(g, p) / 2));
  };
  const bestPick = (g: Game, p: number, cands: number[]) =>
    cands.reduce((a, b) => (g.sp(b).price! * weight(g, p, b) > g.sp(a).price! * weight(g, p, a) ? b : a));

  // ---- raising cash by choice: mortgage or sell outside of sets, cheapest rent lost per money first
  const fundOptions = (g: Game, p: number, reason: 'buy' | 'build', target: number, sells: boolean) => {
    const out: { a: FundAction; loss: number; cash: number }[] = [];
    const tg = g.groupOf[target];
    for (let j = 0; j < g.n; j++) {
      if (g.s.owner[j] !== p || g.groupOf[j] === tg) continue;
      const sp = g.sp(j), grp = g.groupOf[j]!;
      const m: FundAction = { kind: 'mortgage', space: j };
      // mortgaging a street of a set would stop building there
      if (!(sp.type === 'street' && g.meetsThreshold(p, grp)) && g.fundable(p, m, reason, target)) {
        out.push({ a: m, loss: g.rent(j, 7) / sp.mortgage!, cash: sp.mortgage! });
      }
      const sl: FundAction = { kind: 'sell', space: j };
      if (sells && g.fundable(p, sl, reason, target)) {
        const depot = g.s.depot[j];
        const money = (depot ? sp.depotCost! : sp.houseCost!) / 2;
        const loss = depot ? g.rent(j, 7) / 2 : sp.rent![g.s.level[j]] - sp.rent![g.s.level[j] - 1];
        out.push({ a: sl, loss: loss / money, cash: money });
      }
    }
    return out.sort((x, y) => x.loss - y.loss);
  };

  const fund = (g: Game, p: number, reason: 'buy' | 'build', i: number, cost: number): FundAction[] | null => {
    if (!profile.leverage) return null;
    const res = reserve(g, p);
    let need: number, maxLoss = Infinity;
    if (reason === 'buy') {
      // only for property that completes or blocks a set
      const w = weight(g, p, i);
      if (w < 1.5 || !listPriceOk(g, p, i)) return null;
      need = cost + res / w - cash(g, p);
    } else {
      const sp = g.sp(i), lvl = g.s.level[i];
      if (profile.buildTarget !== undefined && sp.type === 'street' && lvl >= profile.buildTarget) return null;
      const gain = sp.type === 'station' ? g.rent(i, 7) : sp.rent![lvl + 1] - sp.rent![lvl];
      // give up only income that earns clearly less per money than the new building
      maxLoss = gain / cost / 1.5;
      need = cost + res - cash(g, p);
    }
    if (need <= 0) return null;
    const plan: FundAction[] = [];
    let got = 0;
    for (const o of fundOptions(g, p, reason, i, reason === 'build')) {
      if (o.loss > maxLoss) break;
      plan.push(o.a);
      got += o.cash;
      if (got >= need) return plan;
    }
    return null;
  };

  // ---- trading: value holdings group by group, price offers so both sides gain (Nash split)
  /** money value of x's part of group `grp` if `own(i)` gives the owners, with `cashX` on hand */
  const groupWorth = (g: Game, x: number, grp: string, own: (i: number) => number, cashX: number) => {
    const mem = g.members[grp];
    let price = 0, c = 0, rent = 0, houseCost = 0;
    for (const i of mem) {
      if (own(i) !== x) continue;
      const sp = g.sp(i);
      c++;
      price += g.s.mortgaged[i] ? sp.price! - g.mortgagePayoff(i) : sp.price!;
      houseCost += sp.houseCost ?? 0;
      if (sp.type === 'street') rent += sp.rent![0];
    }
    if (!c) return 0;
    const landings = (g.activeCount() - 1) * landRate(g) * HORIZON;
    const first = g.sp(mem[0]);
    if (grp === 'station') return price + c * first.rent![c - 1] * landings;
    if (grp === 'utility') return price + c * 7 * first.utilityMultiplier![c - 1] * landings;
    if (c < g.threshold(grp)) return price + rent * landings;
    // a set: rent at three houses, discounted when there is no money to build
    let r3 = 0;
    for (const i of mem) if (own(i) === x) r3 += g.sp(i).rent![3];
    const build = 3 * houseCost;
    const afford = Math.min(1, Math.max(0.2, cashX / build));
    return price + afford * Math.max(0, r3 * landings - build / 2);
  };

  /** [gain of the proposer p, gain of the partner] for offer o, in money */
  const tradeGains = (g: Game, p: number, o: TradeOffer): [number, number] => {
    const q = o.to;
    const after = (i: number) => (o.give.includes(i) ? q : o.get.includes(i) ? p : g.s.owner[i]);
    const now = (i: number) => g.s.owner[i];
    const cp0 = cash(g, p), cq0 = cash(g, q);
    const cp = cp0 - o.cash - g.transferFees(o.get), cq = cq0 + o.cash - g.transferFees(o.give);
    let gp = cp - cp0, gq = cq - cq0;
    const seen: string[] = [];
    for (const list of [o.give, o.get]) for (const i of list) {
      const grp = g.groupOf[i]!;
      if (seen.includes(grp)) continue;
      seen.push(grp);
      gp += groupWorth(g, p, grp, after, cp) - groupWorth(g, p, grp, now, cp0);
      gq += groupWorth(g, q, grp, after, cq) - groupWorth(g, q, grp, now, cq0);
    }
    return [gp, gq];
  };

  /** a rival's gain counts against one's own, less so with more opponents */
  const rival = (g: Game) => profile.rivalWeight / Math.max(1, g.activeCount() - 1);

  /** cash for offer o so that both sides clear the margin, splitting the surplus in half; null if impossible */
  const priceOffer = (g: Game, p: number, o: TradeOffer): { o: TradeOffer; score: number } | null => {
    const lam = rival(g), m = profile.tradeMargin, q = o.to;
    const capP = cash(g, p) - g.transferFees(o.get) - reserve(g, p) / 2;
    const capQ = cash(g, q) - g.transferFees(o.give) - reserve(g, q) / 2;
    let c = 0;
    // twice: the first pass prices at zero cash, the second with the cash it found (affordability changes)
    for (let pass = 0; pass < 2; pass++) {
      const [gp, gq] = tradeGains(g, p, { ...o, cash: c });
      const dp = gp + c, dq = gq - c;
      const lo = Math.max(-capQ, (m - (dq - lam * dp)) / (1 + lam));
      const hi = Math.min(capP, ((dp - lam * dq) - m) / (1 + lam));
      if (lo > hi) return null;
      c = Math.min(Math.floor(hi), Math.max(Math.ceil(lo), Math.round((lo + hi) / 20) * 10));
    }
    const [gp, gq] = tradeGains(g, p, { ...o, cash: c });
    const score = gp - lam * gq;
    return score >= m && gq - lam * gp >= m ? { o: { ...o, cash: c }, score } : null;
  };

  /** (partner, group) pairs recently offered, with the round from which they may be offered again */
  const cooldown = new Map<string, number>();
  /** possible deals depend only on who owns what (tracked by g.rev), so they are listed once per revision */
  interface Deal { key: string; offers: TradeOffer[] }
  let dealRev = -1, dealGame: Game | null = null, deals: Deal[] = [];

  const listDeals = (g: Game, p: number): Deal[] => {
    if (dealRev === g.rev && dealGame === g) return deals;
    dealRev = g.rev;
    dealGame = g;
    deals = [];
    const groups = streetGroups(g);
    for (const grp of groups) {
      const mine = g.ownedIn(p, grp), need = g.threshold(grp) - mine;
      if (mine === 0 || need <= 0) continue;
      for (let q = 0; q < g.s.players.length; q++) {
        if (q === p || !g.active(q) || g.ownedIn(q, grp) < need) continue;
        const get = g.members[grp].filter((i) => g.s.owner[i] === q && g.tradeable(i)).slice(0, need);
        if (get.length < need) continue;
        // pay cash, or swap pieces that give the partner a set too
        const offers: TradeOffer[] = [{ to: q, give: [], get, cash: 0 }];
        for (const h of groups) {
          const needQ = g.threshold(h) - g.ownedIn(q, h);
          if (h === grp || needQ <= 0 || g.ownedIn(q, h) === 0) continue;
          const give = g.members[h].filter((i) => g.s.owner[i] === p && g.tradeable(i)).slice(0, needQ);
          if (give.length === needQ) offers.push({ to: q, give, get, cash: 0 });
        }
        deals.push({ key: `${q}:${grp}`, offers });
      }
    }
    return deals;
  };

  const proposeTrades = (g: Game, p: number): TradeOffer[] => {
    if (!profile.trades) return NONE;
    const list = listDeals(g, p);
    if (!list.length) return NONE;
    const found: { o: TradeOffer; score: number }[] = [];
    for (const d of list) {
      if ((cooldown.get(d.key) ?? 0) > g.s.round) continue;
      cooldown.set(d.key, g.s.round + 4);
      for (const o of d.offers) {
        const priced = priceOffer(g, p, o);
        if (priced) found.push(priced);
      }
    }
    return found.sort((a, b) => b.score - a.score).map((f) => f.o);
  };

  const acceptTrade = (g: Game, p: number, from: number, o: TradeOffer) => {
    if (!profile.trades) return false;
    const [gFrom, gMe] = tradeGains(g, from, o);
    return gMe - rival(g) * gFrom >= profile.tradeMargin;
  };

  return {
    buy: (g, p, i) => listPriceOk(g, p, i) && cash(g, p) - g.sp(i).price! >= reserve(g, p) / weight(g, p, i),

    bid,

    buildMore: (g, p, i, cost) => {
      const beyond = profile.buildTarget !== undefined && g.sp(i).type === 'street' && g.s.level[i] >= profile.buildTarget;
      return cash(g, p) - cost >= reserve(g, p) * (beyond ? 2 : 1);
    },

    // hooks the profile does not use stay undefined, so the engine can skip them entirely
    fund: profile.leverage ? fund : undefined,
    proposeTrades: profile.trades ? proposeTrades : undefined,
    acceptTrade: profile.trades ? acceptTrade : undefined,

    jail: (g, p) => {
      const pl = g.s.players[p];
      const leave = profile.jail === 'leave'
        || (profile.jail === 'smart' && g.maxRentAgainst(p) < 0.25 * pl.cash);
      if (!leave) return 'roll';
      if (pl.goojf.length) return 'card';
      return pl.cash - g.rules.jail.fine >= reserve(g, p) ? 'pay' : 'roll';
    },

    tripleTarget: (g, p) => {
      const c = ctxOf(g, p);
      const pos = g.s.players[p].pos;
      let best = pos, bestScore = -Infinity;
      for (let i = 0; i < g.n; i++) {
        const sc = positionValue(g, p, i, c) + (i <= pos ? g.rules.goSalary : 0);
        if (sc > bestScore) { bestScore = sc; best = i; }
      }
      return best;
    },

    rideInsteadOfStay: (g, p) => {
      const c = ctxOf(g, p);
      const pos = g.s.players[p].pos;
      const dest = nextCardSpace(g, pos);
      const passGo = dest < pos ? g.rules.goSalary : 0;
      return positionValue(g, p, dest, c) + passGo > positionValue(g, p, pos, c) + 5;
    },

    ticketOrRide: () => 'ticket',

    birthday: (g, p) => (cash(g, p) > reserve(g, p) ? 'ticket' : 'cash'),

    busTicketTarget: (g, p) => {
      const c = ctxOf(g, p);
      let best: number | null = null, bestScore = -Infinity;
      for (const t of g.ticketTargets(p)) {
        const sc = positionValue(g, p, t, c);
        if (sc > bestScore) { bestScore = sc; best = t; }
      }
      // compare with rolling: the value of where a roll lands, including the roll after that (approximated)
      const pos = g.s.players[p].pos;
      const roll = nextRollValue(g, p, pos, c) * 2;
      return bestScore > roll + 30 ? best : null;
    },

    auctionPick: (g, p, cands) => bestPick(g, p, cands),

    // only worth it for something the bot really wants: it must be ready to bid at least the list price
    startAuction: (g, p, cands) => {
      const pick = bestPick(g, p, cands);
      return bid(g, p, pick) >= g.sp(pick).price! ? pick : null;
    },

    unmortgage: (g, p) => {
      // the mortgaged list only changes with the game revision; this policy belongs to one player
      if (mortRev !== g.rev || mortGame !== g) {
        mortList = [];
        mortCheapest = Infinity;
        for (let i = 0; i < g.n; i++) {
          if (g.s.owner[i] !== p || !g.s.mortgaged[i]) continue;
          mortList.push(i);
          mortCheapest = Math.min(mortCheapest, g.mortgagePayoff(i));
        }
        mortRev = g.rev;
        mortGame = g;
      }
      const mine = [...mortList], cheapest = mortCheapest;
      if (!mine.length) return mine;
      // nothing affordable: the order below would not matter, so skip the sort
      if (cheapest > cash(g, p) - 1.5 * reserve(g, p)) return [];
      // groups that unlock building first, then by list price
      const key = (i: number) => {
        const grp = g.groupOf[i]!;
        return (grp !== 'station' && grp !== 'utility' && g.meetsThreshold(p, grp) ? 10_000 : 0) + g.sp(i).price!;
      };
      mine.sort((a, b) => key(b) - key(a));
      const out: number[] = [];
      let budget = cash(g, p) - 1.5 * reserve(g, p);
      for (const i of mine) {
        const cost = g.mortgagePayoff(i);
        if (cost > budget) break;
        budget -= cost;
        out.push(i);
      }
      return out;
    },

    // bail is cheap: buy out whenever the rent is clearly worth more; careful players want a bigger margin
    bailForRent: (g, p, rent) => {
      const fine = g.rules.jail.fine;
      const margin = profile.jail === 'stay' ? 3 : 1.5;
      return (g.s.players[p].goojf.length > 0 || cash(g, p) >= fine) && rent >= fine * margin;
    },

    // save jokers for rents that hurt: big in absolute terms or relative to cash
    useJoker: (g, p, _o, rent) => rent >= 400 || rent > 0.3 * cash(g, p),
  };
}

/** legal moves at random: a weak baseline and the fuzzing opponent that reaches corners heuristics never do */
export function randomPolicy(rng: Rng): Policy {
  const coin = (p = 0.5) => rng.next() < p;
  const pick = <T>(xs: T[]): T => xs[rng.int(xs.length)];
  return {
    buy: () => coin(0.7),
    bid: (g, _p, i) => (coin(0.3) ? 0 : rng.next() * 1.5 * g.sp(i).price!),
    buildMore: () => coin(0.6),
    jail: () => pick(['card', 'pay', 'roll'] as const),
    tripleTarget: (g) => rng.int(g.n),
    rideInsteadOfStay: () => coin(),
    ticketOrRide: () => (coin() ? 'ticket' : 'ride'),
    birthday: () => (coin() ? 'cash' : 'ticket'),
    busTicketTarget: (g, p) => (coin(0.3) ? pick(g.ticketTargets(p)) : null),
    auctionPick: (_g, _p, c) => pick(c),
    startAuction: (_g, _p, c) => (coin() ? pick(c) : null),
    unmortgage: (g, p) => {
      const mine: number[] = [];
      for (let i = 0; i < g.n; i++) if (g.s.owner[i] === p && g.s.mortgaged[i] && coin(0.3)) mine.push(i);
      return mine;
    },
    bailForRent: () => coin(),
    useJoker: () => coin(),
    proposeTrades: (g, p) => {
      if (!coin(0.15)) return [];
      const others = g.activePlayers().filter((q) => q !== p);
      if (!others.length) return [];
      const q = pick(others);
      const mine = (x: number) => { const out: number[] = []; for (let i = 0; i < g.n; i++) if (g.s.owner[i] === x && g.tradeable(i) && coin(0.25)) out.push(i); return out; };
      const give = mine(p), get = mine(q);
      if (!give.length && !get.length) return [];
      const span = g.s.players[p].cash + g.s.players[q].cash;
      const cash = Math.round((rng.next() * span - g.s.players[q].cash) * 0.5);
      return [{ to: q, give, get, cash }];
    },
    acceptTrade: () => coin(0.4),
    // one action at most: the second could become illegal after the first (selling evenly)
    fund: (g, p, reason, target) => {
      if (!coin(0.3)) return null;
      const opts: FundAction[] = [];
      for (let i = 0; i < g.n; i++) {
        for (const kind of ['mortgage', 'sell'] as const) if (g.fundable(p, { kind, space: i }, reason, target)) opts.push({ kind, space: i });
      }
      return opts.length ? [pick(opts)] : null;
    },
  };
}
