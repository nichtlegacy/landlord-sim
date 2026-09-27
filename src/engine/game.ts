// Rule engine. Knows nothing about UI; every player decision goes through a Policy.
import type { Agreement, AgreementScope, Edition, EventBody, FundAction, GameEvent, GameState, PlayerState, RaiseReason, RuleConfig, Space, SpeedFace, Deck, TradeOffer } from './types';
import type { Policy } from './policy';
import { derive, type Rng } from './rng';

type Creditor = number | 'bank' | 'pot';
interface LandCtx { dice: number | null; stationMult?: number; utilityDiceMult?: number }
const NO_CTX: Partial<LandCtx> = Object.freeze({});
/** trade offers per turn (Sammul 2018 uses 3; without a cap, bots could haggle forever) */
const MAX_OFFERS = 3;

export interface GameResult {
  winner: number;
  rounds: number;
  timeout: boolean;
  /** per player: round of bankruptcy and creditor (-1 bank), or undefined if still in */
  out: ({ round: number; to: number } | null)[];
  netWorth: number[];
  /** trades made in this game */
  trades: number;
}

export class Game {
  readonly n: number;
  /** group key per space ('station' / 'utility' / colour), undefined for non-properties */
  readonly groupOf: (string | undefined)[];
  readonly members: Record<string, number[]>;
  readonly cardSpaces: number[];
  log: GameEvent[] | null;
  /** measurement hooks (validation, trajectories, replays) */
  onRollEnd: ((p: number) => void) | null = null;
  onRound: ((g: Game) => void) | null = null;
  onTrade: ((p: number, o: TradeOffer) => void) | null = null;
  /** every building unit, with the build action it belongs to (one action = one call of the build loop) */
  onBuild: ((p: number, i: number, action: number, single: boolean) => void) | null = null;
  private buildActions = 0;
  /** trades made so far */
  trades = 0;
  /**
   * Bumped by every change to ownership, buildings, mortgages or bankruptcy; caches of values
   * derived from those (maxRentAgainst) are valid for one revision. Code that edits `s` directly
   * after the game has started must call `changed()`.
   */
  rev = 0;
  private readonly mraRev: number[];
  private readonly mraVal: number[];
  /** colour groups and stations, in the order building is offered each turn */
  private readonly buildGroups: string[];
  private readonly buildIdx: Record<string, number> = {};
  /** nextBuild per player and group; depends only on rev-tracked state, so valid for one revision */
  private readonly nbRev: Int32Array;
  private readonly nbVal: ({ i: number; cost: number } | null)[];
  /** cheapest build step per player over all groups, valid for one revision (Infinity = none) */
  private readonly cheapRev: Int32Array;
  private readonly cheapCost: Float64Array;
  /**
   * One dice stream per player (common random numbers): a player's n-th roll is the same in two
   * games with the same seed, even when a rule change makes other players roll more or less often.
   */
  private readonly dice: Rng[];
  /** the speed die has its own streams, so switching it off leaves the white dice unchanged */
  private readonly speed: Rng[];
  /** properties owned per player and group (index into groupNames), valid for one revision */
  readonly groupNames: string[];
  private readonly groupIdx: Record<string, number> = {};
  private readonly groupOfIdx: Int32Array;
  private cntRev = -1;
  private readonly cnt: Int16Array;

  constructor(
    readonly ed: Edition,
    readonly rules: RuleConfig,
    readonly s: GameState,
    readonly policies: Policy[],
    readonly rng: Rng,
    opts: { log?: boolean } = {},
  ) {
    this.n = ed.spaces.length;
    this.members = { ...ed.groups, station: [], utility: [] };
    this.groupOf = ed.spaces.map((sp) => {
      if (sp.type === 'station' || sp.type === 'utility') {
        this.members[sp.type].push(sp.index);
        return sp.type;
      }
      return sp.type === 'street' ? sp.group : undefined;
    });
    this.cardSpaces = ed.spaces.filter((sp) => sp.type === 'chance' || sp.type === 'community_chest').map((sp) => sp.index);
    this.log = opts.log ? [] : null;
    this.mraRev = s.players.map(() => -1);
    this.mraVal = s.players.map(() => 0);
    this.buildGroups = Object.keys(this.members).filter((g) => g !== 'utility');
    this.buildGroups.forEach((g, k) => { this.buildIdx[g] = k; });
    this.nbRev = new Int32Array(s.players.length * this.buildGroups.length).fill(-1);
    this.nbVal = new Array(this.nbRev.length).fill(null);
    this.cheapRev = new Int32Array(s.players.length).fill(-1);
    this.cheapCost = new Float64Array(s.players.length);
    this.dice = s.players.map(() => derive(rng));
    this.speed = s.players.map(() => derive(rng));
    this.groupNames = Object.keys(this.members);
    this.groupNames.forEach((g, k) => { this.groupIdx[g] = k; });
    this.groupOfIdx = Int32Array.from(this.groupOf, (g) => (g === undefined ? -1 : this.groupIdx[g]));
    this.cnt = new Int16Array(s.players.length * this.groupNames.length);
  }

  changed() { this.rev++; }

  // ---------------------------------------------------------------- queries

  sp(i: number): Space { return this.ed.spaces[i]; }
  isProperty(i: number) { return this.groupOf[i] !== undefined; }
  active(p: number) { return !this.s.players[p].bankrupt; }
  activePlayers() { return this.s.players.map((_, i) => i).filter((i) => this.active(i)); }
  activeCount() {
    let c = 0;
    for (const pl of this.s.players) if (!pl.bankrupt) c++;
    return c;
  }

  ownedIn(p: number, group: string) {
    if (this.cntRev !== this.rev) {
      this.cnt.fill(0);
      const G = this.groupNames.length;
      for (let i = 0; i < this.n; i++) {
        const o = this.s.owner[i], k = this.groupOfIdx[i];
        if (o >= 0 && k >= 0) this.cnt[o * G + k]++;
      }
      this.cntRev = this.rev;
    }
    return this.cnt[p * this.groupNames.length + this.groupIdx[group]];
  }

  /** streets needed in a colour group before houses/hotels are allowed */
  threshold(group: string) {
    const len = this.members[group].length;
    return this.rules.build.requirement === 'full_group' ? len : len - 1;
  }

  /**
   * interest on a mortgage (10 %), rounded up to whole M. Rounded to cents first, because
   * 30 * 0.1 is 3.0000000000000004 in floating point and would otherwise round up to 4.
   */
  mortgageInterest(i: number) {
    return Math.ceil(Math.round(this.sp(i).mortgage! * this.rules.mortgageInterest * 100) / 100);
  }

  /** what lifting the mortgage on space i costs: loan plus interest */
  mortgagePayoff(i: number) {
    return this.sp(i).mortgage! + this.mortgageInterest(i);
  }

  meetsThreshold(p: number, group: string) {
    return this.ownedIn(p, group) >= this.threshold(group);
  }

  rent(i: number, dice: number, ctx: Partial<LandCtx> = NO_CTX): number {
    const sp = this.sp(i), o = this.s.owner[i];
    if (o < 0 || this.s.mortgaged[i]) return 0;
    const g = this.groupOf[i]!;
    if (sp.type === 'station') {
      const c = this.ownedIn(o, g);
      return sp.rent![c - 1] * (this.s.depot[i] ? 2 : 1) * (ctx.stationMult ?? 1);
    }
    if (sp.type === 'utility') {
      const deed = sp.utilityMultiplier![this.ownedIn(o, g) - 1];
      // "nearest utility" card: 10x dice, but never less than the deed (grand has 20x for three)
      const mult = ctx.utilityDiceMult ? Math.max(ctx.utilityDiceMult, deed) : deed;
      return dice * mult;
    }
    const lvl = this.s.level[i];
    if (lvl > 0) return sp.rent![lvl];
    const owned = this.ownedIn(o, g), len = this.members[g].length;
    const m = owned === len ? this.rules.unimprovedMultiplier.all
      : owned === len - 1 ? this.rules.unimprovedMultiplier.allButOne : 1;
    return sp.rent![0] * m;
  }

  /** highest single rent p could owe right now (utilities at dice 7, rent deals applied) */
  maxRentAgainst(p: number) {
    if (this.mraRev[p] === this.rev) return this.mraVal[p];
    let max = 0;
    for (let i = 0; i < this.n; i++) {
      const o = this.s.owner[i];
      if (o >= 0 && o !== p && this.active(o)) max = Math.max(max, this.rentFor(p, i, 7));
    }
    this.mraRev[p] = this.rev;
    this.mraVal[p] = max;
    return max;
  }

  private inScope(scope: AgreementScope, i: number) {
    if (scope === 'all') return true;
    if (scope === 'stations') return this.sp(i).type === 'station';
    if (scope === 'utilities') return this.sp(i).type === 'utility';
    if ('group' in scope) return this.groupOf[i] === scope.group;
    return scope.spaces.includes(i);
  }

  /** rent p owes on space i after standing rent deals (jokers not included) */
  rentFor(p: number, i: number, dice: number, ctx: Partial<LandCtx> = NO_CTX) {
    let r = this.rent(i, dice, ctx);
    const o = this.s.owner[i];
    for (const a of this.s.agreements) {
      if (a.kind !== 'rent' || a.payer !== p || a.owner !== o || !this.inScope(a.scope, i)) continue;
      if (a.percent !== undefined) r = Math.round((r * a.percent) / 100);
      if (a.maxAmount !== undefined) r = Math.min(r, a.maxAmount);
    }
    return r;
  }

  /** jokers p could play against owner o right now */
  jokersFor(p: number, o: number): Extract<Agreement, { kind: 'joker' }>[] {
    return this.s.agreements.filter((a): a is Extract<Agreement, { kind: 'joker' }> =>
      a.kind === 'joker' && a.payer === p && a.uses > 0 && (a.owner === null || a.owner === o));
  }

  netWorth(p: number) {
    const pl = this.s.players[p];
    if (pl.bankrupt) return 0;
    let w = pl.cash;
    for (let i = 0; i < this.n; i++) {
      if (this.s.owner[i] !== p) continue;
      const sp = this.sp(i);
      w += this.s.mortgaged[i] ? sp.mortgage! : sp.price!;
      w += this.s.level[i] * (sp.houseCost ?? 0) + (this.s.depot[i] ? sp.depotCost ?? 0 : 0);
    }
    return w;
  }

  /** callers guard with `this.log &&`, so no event is built while simulating */
  private ev(p: number, body: EventBody) {
    this.log!.push({ round: this.s.round, player: p, ...body });
  }

  // ---------------------------------------------------------------- game loop

  run(): GameResult {
    while (this.activeCount() > 1 && this.s.round <= this.rules.roundCap) this.playTurn();
    const alive = this.activePlayers();
    const netWorth = this.s.players.map((_, i) => this.netWorth(i));
    const timeout = alive.length > 1;
    const winner = timeout ? alive.reduce((a, b) => (netWorth[b] > netWorth[a] ? b : a)) : alive[0];
    return {
      winner, timeout, netWorth,
      rounds: this.s.round,
      trades: this.trades,
      out: this.s.players.map((pl) => (pl.bankrupt ? { round: pl.outRound!, to: pl.outTo! } : null)),
    };
  }

  playTurn() {
    const p = this.s.current;
    const pl = this.s.players[p];
    let freeToRoll = true;
    if (this.rules.trading) this.tradePhase(p);
    if (pl.inJail) freeToRoll = this.jailTurn(p);
    if (freeToRoll && this.active(p)) this.rollLoop(p);
    if (this.active(p)) this.freeActions(p);
    this.nextPlayer();
  }

  private nextPlayer() {
    const count = this.s.players.length;
    let i = this.s.current;
    do {
      i = (i + 1) % count;
      if (i === 0) { this.s.round++; this.onRound?.(this); }
    } while (!this.active(i) && i !== this.s.current);
    this.s.current = i;
  }

  private d6(p: number) { return this.dice[p].int(6) + 1; }

  private rollLoop(p: number) {
    const pl = this.s.players[p];
    const pol = this.policies[p];
    let doubles = 0;
    for (;;) {
      if (pl.busTickets > 0) {
        const t = pol.busTicketTarget(this, p);
        if (t !== null) { this.useTicket(p, t); this.onRollEnd?.(p); return; }
      }
      const w1 = this.d6(p), w2 = this.d6(p);
      const sd = this.rules.speedDie;
      const face: SpeedFace | null = sd ? sd.faces[this.speed[p].int(sd.faces.length)] : null;

      if (this.rules.triplesAnySpace && face !== null && w1 === w2 && face === w1) {
        const t = pol.tripleTarget(this, p);
        this.assertSpace(t);
        this.log && this.ev(p, { t: 'triple', dice: [w1, w2], face, to: t });
        this.moveForwardTo(p, t);
        this.resolve(p, { dice: null });
        this.onRollEnd?.(p);
        return;
      }
      if (w1 === w2 && ++doubles === 3 && this.rules.doublesAgain) {
        this.log && this.ev(p, { t: 'third_double' });
        this.sendToJail(p);
        this.onRollEnd?.(p);
        return;
      }
      const white = w1 + w2;
      const steps = white + (typeof face === 'number' ? face : 0);
      this.log && this.ev(p, { t: 'roll', dice: [w1, w2], face });

      if (face === 'bus' && sd!.bus.decideBeforeResolve && this.s.decks.bus.length === 0 && sd!.bus.whenEmpty === 'choose') {
        this.advance(p, white);
        if (pol.rideInsteadOfStay(this, p)) this.rideToNextCard(p);
        else this.resolve(p, { dice: white });
      } else {
        this.advance(p, steps);
        this.resolve(p, { dice: white });
        if (this.active(p) && !pl.inJail && face === 'bonus' && sd!.bonusMove === 'official') this.bonusMove(p);
        if (this.active(p) && !pl.inJail && face === 'bus') this.busFace(p);
      }
      this.onRollEnd?.(p);
      if (!this.active(p) || pl.inJail || w1 !== w2 || !this.rules.doublesAgain) return;
    }
  }

  /** returns true if the player leaves jail before rolling and plays a normal turn */
  private jailTurn(p: number): boolean {
    const pl = this.s.players[p];
    const choice = this.policies[p].jail(this, p);
    const rollAfter = this.rules.jail.payThenRoll;
    if (choice === 'card' && pl.goojf.length) {
      const deck = pl.goojf.pop()!;
      this.returnGoojf(deck);
      pl.inJail = false;
      this.log && this.ev(p, { t: 'jail_card', sitOut: !rollAfter });
      return rollAfter;
    }
    if (choice === 'pay' && this.pay(p, this.rules.jail.fine, this.penaltyTarget())) {
      pl.inJail = false;
      this.log && this.ev(p, { t: 'jail_pay', amount: this.rules.jail.fine, sitOut: !rollAfter });
      return rollAfter;
    }
    if (!this.active(p)) return false;
    const w1 = this.d6(p), w2 = this.d6(p);
    if (w1 !== w2) {
      pl.jailTurns++;
      const max = this.rules.jail.maxRollAttempts;
      if (max === null || pl.jailTurns < max) {
        this.log && this.ev(p, { t: 'jail_miss', dice: [w1, w2] });
        this.onRollEnd?.(p);
        return false;
      }
      if (this.rules.jail.afterMaxAttempts === 'free_next_turn') {
        // H6: out without paying, but this turn is over; the next one is rolled normally
        pl.inJail = false;
        pl.jailTurns = 0;
        this.log && this.ev(p, { t: 'jail_free_after_max', dice: [w1, w2] });
        this.onRollEnd?.(p);
        return false;
      }
      if (!this.pay(p, this.rules.jail.fine, this.penaltyTarget())) return false;
    } else if (this.rules.jail.onDoubles === 'free_then_roll') {
      // H6: doubles only open the door; the turn is then rolled normally (speed die included)
      pl.inJail = false;
      pl.jailTurns = 0;
      this.log && this.ev(p, { t: 'jail_doubles_free', dice: [w1, w2] });
      this.onRollEnd?.(p);
      return true;
    }
    pl.inJail = false;
    this.log && this.ev(p, { t: 'jail_leave', dice: [w1, w2] });
    this.advance(p, w1 + w2);
    this.resolve(p, { dice: w1 + w2 });
    this.onRollEnd?.(p);
    return false;
  }

  private freeActions(p: number) {
    const pol = this.policies[p];
    if (this.rules.building && this.rules.build.timing === 'any_turn') {
      // buildOnGroup stops before asking the policy when cash is below the step's cost, so with
      // less cash than the cheapest step anywhere the whole round can be skipped
      if (this.cheapRev[p] !== this.rev) {
        let min = Infinity;
        for (const g of this.buildGroups) { const st = this.nextBuild(p, g); if (st && st.cost < min) min = st.cost; }
        this.cheapRev[p] = this.rev;
        this.cheapCost[p] = min;
      }
      // a policy that may mortgage to build is asked even when short of cash
      if (pol.fund || this.s.players[p].cash >= this.cheapCost[p]) for (const g of this.buildGroups) this.buildOnGroup(p, g);
    }
    for (const i of pol.unmortgage(this, p)) {
      if (this.s.owner[i] !== p || !this.s.mortgaged[i]) throw new Error(`invalid unmortgage ${i}`);
      const cost = this.mortgagePayoff(i);
      if (this.s.players[p].cash < cost) break;
      this.s.players[p].cash -= cost;
      this.s.mortgaged[i] = false;
      this.changed();
      this.log && this.ev(p, { t: 'unmortgage', space: i });
    }
  }

  // ---------------------------------------------------------------- movement

  private assertSpace(i: number) {
    if (!Number.isInteger(i) || i < 0 || i >= this.n) throw new Error(`invalid space ${i}`);
  }

  private collectGo(p: number, exact: boolean) {
    const r = this.rules;
    const amount = exact && r.goLandTotal !== null ? r.goLandTotal : r.goSalary;
    this.s.players[p].cash += amount;
  }

  private advance(p: number, steps: number) {
    const pl = this.s.players[p];
    const to = pl.pos + steps;
    if (to >= this.n) this.collectGo(p, to % this.n === 0);
    pl.pos = to % this.n;
  }

  private moveForwardTo(p: number, target: number) {
    const pos = this.s.players[p].pos;
    this.advance(p, (target - pos + this.n) % this.n);
  }

  private sendToJail(p: number) {
    const pl = this.s.players[p];
    pl.pos = this.ed.jailIndex;
    pl.inJail = true;
    pl.jailTurns = 0;
  }

  private rideToNextCard(p: number) {
    const pos = this.s.players[p].pos;
    let best = -1, bestD = Infinity;
    for (const c of this.cardSpaces) {
      const d = (c - pos + this.n) % this.n || this.n;
      if (d < bestD) { bestD = d; best = c; }
    }
    this.log && this.ev(p, { t: 'bus_ride', to: best });
    this.moveForwardTo(p, best);
    this.resolve(p, { dice: null });
  }

  /** allowed bus ticket targets: forward on the current side, up to and including the next corner */
  ticketTargets(p: number): number[] {
    const pos = this.s.players[p].pos, side = this.n / 4;
    const end = (Math.floor(pos / side) + 1) * side;
    const out: number[] = [];
    for (let i = pos + 1; i <= end; i++) out.push(i % this.n);
    return out;
  }

  private useTicket(p: number, target: number) {
    if (!this.ticketTargets(p).includes(target)) throw new Error(`invalid bus ticket target ${target}`);
    this.s.players[p].busTickets--;
    this.log && this.ev(p, { t: 'ticket_use', to: target });
    this.moveForwardTo(p, target);
    this.resolve(p, { dice: null });
  }

  private takeTicket(p: number) {
    const idx = this.s.decks.bus.shift();
    if (idx === undefined) return;
    if (this.ed.decks.bus[idx].expiresOthers) for (const pl of this.s.players) pl.busTickets = 0;
    this.s.players[p].busTickets++;
    this.log && this.ev(p, { t: 'ticket_take' });
  }

  private busFace(p: number) {
    const bus = this.rules.speedDie!.bus;
    if (this.s.decks.bus.length > 0) {
      if (bus.withTickets === 'ticket' || this.policies[p].ticketOrRide(this, p) === 'ticket') this.takeTicket(p);
      else this.rideToNextCard(p);
    } else if (bus.whenEmpty === 'ride' || this.policies[p].rideInsteadOfStay(this, p)) {
      this.rideToNextCard(p);
    }
  }

  private bonusMove(p: number) {
    const pos = this.s.players[p].pos;
    for (let d = 1; d < this.n; d++) {
      const i = (pos + d) % this.n;
      if (this.isProperty(i) && this.s.owner[i] < 0) {
        this.log && this.ev(p, { t: 'bonus_move', to: i });
        this.moveForwardTo(p, i);
        this.resolve(p, { dice: null });
        return;
      }
    }
    for (let d = 1; d < this.n; d++) {
      const i = (pos + d) % this.n, o = this.s.owner[i];
      if (o >= 0 && o !== p && !this.s.mortgaged[i]) {
        this.log && this.ev(p, { t: 'bonus_move', to: i });
        this.moveForwardTo(p, i);
        this.resolve(p, { dice: null });
        return;
      }
    }
  }

  // ---------------------------------------------------------------- landing

  private penaltyTarget(): Creditor { return this.rules.freeParkingPot ? 'pot' : 'bank'; }

  private resolve(p: number, ctx: LandCtx) {
    const pl = this.s.players[p];
    const i = pl.pos, sp = this.sp(i);
    switch (sp.type) {
      case 'street': case 'station': case 'utility':
        this.landProperty(p, i, ctx);
        break;
      case 'tax':
        this.log && this.ev(p, { t: 'tax', space: i, amount: sp.amount! });
        this.pay(p, sp.amount!, this.penaltyTarget());
        break;
      case 'chance': case 'community_chest':
        this.drawCard(p, sp.type);
        break;
      case 'go_to_jail':
        this.log && this.ev(p, { t: 'go_to_jail' });
        this.sendToJail(p);
        break;
      case 'free_parking':
        if (this.rules.freeParkingPot && this.s.pot > 0) {
          this.log && this.ev(p, { t: 'pot', amount: this.s.pot });
          pl.cash += this.s.pot;
          this.s.pot = 0;
        }
        break;
      case 'auction':
        this.auctionSpace(p);
        break;
      case 'birthday_gift':
        if (this.s.decks.bus.length > 0 && this.policies[p].birthday(this, p) === 'ticket') this.takeTicket(p);
        else pl.cash += sp.amount!;
        break;
      case 'bus_ticket':
        if (this.s.decks.bus.length > 0) this.takeTicket(p);
        else if (this.rules.busSquareWhenEmpty === 'choose' && this.policies[p].rideInsteadOfStay(this, p)) this.rideToNextCard(p);
        break;
      default:
        break; // go, jail (just visiting)
    }
  }

  private whiteDice(p: number, ctx: LandCtx) { return ctx.dice ?? this.d6(p) + this.d6(p); }

  private landProperty(p: number, i: number, ctx: LandCtx) {
    const o = this.s.owner[i];
    if (o < 0) {
      if (!this.rules.buying) return; // continuation without purchases: free property stays with the bank
      const price = this.sp(i).price!;
      const pol = this.policies[p];
      // short of cash (or of the cash the player wants to keep), the policy may mortgage or sell elsewhere first
      if (pol.fund && (this.s.players[p].cash < price || !pol.buy(this, p, i))) this.fund(p, 'buy', i, price, pol.fund(this, p, 'buy', i, price));
      if (this.s.players[p].cash >= price && pol.buy(this, p, i)) {
        this.s.players[p].cash -= price;
        this.s.owner[i] = p;
        this.changed();
        this.log && this.ev(p, { t: 'buy', space: i, price });
      } else {
        this.log && this.ev(p, { t: 'decline', space: i, auction: this.rules.auctionOnDecline });
        if (this.rules.auctionOnDecline) this.auction(i);
      }
      return;
    }
    if (o === p) { this.onOwnLanding(p, i); return; }
    if (this.s.mortgaged[i]) return;
    const ownerPl = this.s.players[o];
    if (ownerPl.inJail && !this.rules.jail.rentWhileJailed) {
      // H11: no rent from jail, unless the owner buys out right now
      const due = this.rentFor(p, i, this.sp(i).type === 'utility' ? this.whiteDice(p, ctx) : 7, ctx);
      if (!this.rules.jail.bailForRent || !this.policies[o].bailForRent(this, o, due) || !this.bailOut(o)) {
        this.log && this.ev(p, { t: 'no_rent_jailed', space: i, owner: o });
        return;
      }
    }
    let r = this.rentFor(p, i, this.sp(i).type === 'utility' ? this.whiteDice(p, ctx) : 7, ctx);
    const full = this.rent(i, 7, ctx);
    // strongest joker first; the policy decides whether this rent is worth one
    let j: Extract<Agreement, { kind: 'joker' }> | null = null;
    for (const a of this.s.agreements) {
      if (a.kind === 'joker' && a.payer === p && a.uses > 0 && (a.owner === null || a.owner === o) && (!j || a.percent > j.percent)) j = a;
    }
    if (j && r > 0 && this.policies[p].useJoker(this, p, o, r, j.percent)) {
      j.uses--;
      r = Math.round((r * (100 - j.percent)) / 100);
      this.log && this.ev(p, { t: 'joker', percent: j.percent, left: j.uses });
    }
    this.log && this.ev(p, { t: 'rent', space: i, owner: o, amount: r, deal: r < full && this.sp(i).type !== 'utility' });
    this.pay(p, r, o, true);
  }

  private onOwnLanding(p: number, i: number) {
    if (!this.rules.building) return;
    const g = this.groupOf[i]!;
    const b = this.rules.build;
    const before = this.s.level[i];
    if (b.timing === 'standing_on_group' && g !== 'utility') this.buildOnGroup(p, g);
    // one step per exact landing: houses, then (H16) hotel and skyscraper. Below the building
    // threshold always; at the threshold only for the skyscraper the full-group rule would block,
    // and only on a street that already was a hotel and got nothing from the regular build above
    const skyscraperGap = b.skyscraperNeedsFullGroup && before === 5 && this.s.level[i] === 5
      && this.ownedIn(p, g) < this.members[g].length;
    if (b.singleSiteOnLanding && this.sp(i).type === 'street' && (!this.meetsThreshold(p, g) || skyscraperGap)) {
      const lvl = this.s.level[i], cost = this.sp(i).houseCost!, sup = this.s.supply;
      const anyMortgaged = this.members[g].some((j) => this.s.owner[j] === p && this.s.mortgaged[j]);
      const inStock = lvl < 4 ? sup.houses > 0 : lvl === 4 ? sup.hotels > 0 : sup.skyscrapers > 0;
      if (lvl < Math.min(b.singleSiteMaxLevel, this.ed.maxLevel) && inStock && !anyMortgaged
        && this.s.players[p].cash >= cost && this.policies[p].buildMore(this, p, i, cost)) {
        this.s.players[p].cash -= cost;
        this.s.level[i]++;
        this.changed();
        this.onBuild?.(p, i, ++this.buildActions, true);
        if (lvl < 4) sup.houses--;
        else if (lvl === 4) { sup.hotels--; sup.houses += 4; }
        else { sup.skyscrapers--; sup.hotels++; }
        this.log && this.ev(p, { t: 'build', space: i, level: lvl + 1, depot: false, single: true });
      }
    }
  }

  /** leave jail outside of your own turn (card first, then bail); false if not possible */
  private bailOut(p: number): boolean {
    const pl = this.s.players[p];
    if (pl.goojf.length) {
      this.returnGoojf(pl.goojf.pop()!);
      this.log && this.ev(p, { t: 'bail_for_rent', card: true, amount: 0 });
    } else if (pl.cash >= this.rules.jail.fine) {
      pl.cash -= this.rules.jail.fine;
      if (this.rules.freeParkingPot) this.s.pot += this.rules.jail.fine;
      this.log && this.ev(p, { t: 'bail_for_rent', card: false, amount: this.rules.jail.fine });
    } else return false;
    pl.inJail = false;
    pl.jailTurns = 0;
    return true;
  }

  private auction(i: number) {
    let best = -1, bestBid = 0, second = 0;
    // bidding goes round in turn order from the player on turn: equal bids go to whoever bid first
    const count = this.s.players.length;
    for (let k = 0; k < count; k++) {
      const q = (this.s.current + k) % count;
      if (!this.active(q)) continue;
      const bid = Math.min(Math.floor(this.policies[q].bid(this, q, i)), this.s.players[q].cash);
      if (bid > bestBid) { second = bestBid; bestBid = bid; best = q; }
      else if (bid > second) second = bid;
    }
    if (best < 0) { this.log && this.ev(this.s.current, { t: 'auction_none', space: i }); return; }
    const price = Math.max(1, Math.min(bestBid, second + 1));
    this.s.players[best].cash -= price;
    this.s.owner[i] = best;
    this.changed();
    this.log && this.ev(best, { t: 'auction_won', space: i, price });
  }

  private auctionSpace(p: number) {
    const free: number[] = [];
    for (let i = 0; i < this.n; i++) if (this.isProperty(i) && this.s.owner[i] < 0) free.push(i);
    if (free.length) {
      if (!this.rules.buying) { this.log && this.ev(p, { t: 'auction_space', space: null, blocked: true }); return; }
      // H18: the player may decline to start an auction
      const pick = this.rules.auctionSpaceOptional ? this.policies[p].startAuction(this, p, free) : this.policies[p].auctionPick(this, p, free);
      if (pick === null) { this.log && this.ev(p, { t: 'auction_space', space: null, blocked: false }); return; }
      if (!free.includes(pick)) throw new Error(`invalid auction pick ${pick}`);
      this.log && this.ev(p, { t: 'auction_space', space: pick, blocked: false });
      this.auction(pick);
      return;
    }
    // no unowned property: move forward to the highest rent p would pay (ties: nearest)
    const pos = this.s.players[p].pos;
    let target = -1, best = 0;
    for (let d = 1; d < this.n; d++) {
      const i = (pos + d) % this.n, o = this.s.owner[i];
      if (o < 0 || o === p) continue;
      const r = this.rent(i, 7);
      if (r > best) { best = r; target = i; }
    }
    if (target < 0) return;
    this.moveForwardTo(p, target);
    this.resolve(p, { dice: null });
  }

  // ---------------------------------------------------------------- cards

  private returnGoojf(deck: Deck) {
    const idx = this.ed.decks[deck].findIndex((c) => c.effect.type === 'get_out_of_jail_free');
    this.s.decks[deck].push(idx);
  }

  private drawCard(p: number, deck: Deck) {
    const idx = this.s.decks[deck].shift();
    if (idx === undefined) return;
    const card = this.ed.decks[deck][idx];
    const e = card.effect;
    const pl = this.s.players[p];
    this.log && this.ev(p, { t: 'card', deck, card: idx });
    if (e.type === 'get_out_of_jail_free') { pl.goojf.push(deck); return; }
    this.s.decks[deck].push(idx);
    switch (e.type) {
      case 'move_to':
        this.moveForwardTo(p, e.target);
        this.resolve(p, { dice: null });
        break;
      case 'move_nearest': {
        const targets = this.members[e.kind];
        let t = targets[0], bestD = Infinity;
        for (const c of targets) {
          const d = (c - pl.pos + this.n) % this.n || this.n;
          if (d < bestD) { bestD = d; t = c; }
        }
        this.moveForwardTo(p, t);
        this.resolve(p, { dice: null, stationMult: e.rent_multiplier, utilityDiceMult: e.dice_multiplier });
        break;
      }
      case 'move_relative':
        pl.pos = (pl.pos + e.steps + this.n) % this.n;
        this.resolve(p, { dice: null });
        break;
      case 'collect': pl.cash += e.amount; break;
      case 'pay': this.pay(p, e.amount, this.penaltyTarget()); break;
      case 'pay_each_player':
        for (const q of this.activePlayers()) if (q !== p && this.active(p)) this.pay(p, e.amount, q);
        break;
      case 'collect_each_player':
        for (const q of this.activePlayers()) if (q !== p) this.pay(q, e.amount, p);
        break;
      case 'repairs': {
        let total = 0;
        for (let i = 0; i < this.n; i++) {
          if (this.s.owner[i] !== p) continue;
          const l = this.s.level[i];
          total += l === 6 ? e.per_skyscraper ?? e.per_hotel : l === 5 ? e.per_hotel : l * e.per_house;
          if (this.s.depot[i]) total += e.per_depot ?? 0;
        }
        this.pay(p, total, this.penaltyTarget());
        break;
      }
      case 'go_to_jail': this.sendToJail(p); break;
    }
  }

  // ---------------------------------------------------------------- building

  /** next legal build step in a group for p, or null */
  private nextBuild(p: number, g: string): { i: number; cost: number } | null {
    const k = p * this.buildGroups.length + this.buildIdx[g];
    if (this.nbRev[k] === this.rev) return this.nbVal[k];
    const step = this.findBuild(p, g);
    this.nbRev[k] = this.rev;
    this.nbVal[k] = step;
    return step;
  }

  private findBuild(p: number, g: string): { i: number; cost: number } | null {
    const s = this.s;
    if (g === 'station') {
      for (const i of this.members.station) {
        if (s.owner[i] === p && !s.depot[i] && !s.mortgaged[i] && s.supply.depots > 0) return { i, cost: this.sp(i).depotCost! };
      }
      return null;
    }
    if (!this.meetsThreshold(p, g)) return null;
    const members = this.members[g];
    let mine = 0, min = Infinity, pick = -1;
    for (const i of members) {
      if (s.owner[i] !== p) continue;
      if (s.mortgaged[i]) return null;
      mine++;
      if (s.level[i] < min) { min = s.level[i]; pick = i; }
    }
    const full = mine === members.length;
    if (min >= this.ed.maxLevel) return null;
    if (min < 4 && s.supply.houses < 1) return null;
    if (min === 4 && s.supply.hotels < 1) return null;
    if (min === 5 && (s.supply.skyscrapers < 1 || (this.rules.build.skyscraperNeedsFullGroup && !full))) return null;
    return { i: pick, cost: this.sp(pick).houseCost! };
  }

  private buildOnGroup(p: number, g: string) {
    if (!this.rules.building) return;
    const max = this.rules.build.maxUnitsPerAction ?? Infinity;
    const pl = this.s.players[p];
    const pol = this.policies[p];
    const action = ++this.buildActions;
    for (let n = 0; n < max; n++) {
      let step = this.nextBuild(p, g);
      if (!step) return;
      if (pol.fund && (pl.cash < step.cost || !pol.buildMore(this, p, step.i, step.cost))) {
        this.fund(p, 'build', step.i, step.cost, pol.fund(this, p, 'build', step.i, step.cost));
        // selling elsewhere changes the supply (a hotel takes four houses back), so look again
        step = this.nextBuild(p, g);
        if (!step) return;
      }
      if (pl.cash < step.cost || !pol.buildMore(this, p, step.i, step.cost)) return;
      pl.cash -= step.cost;
      this.changed();
      const s = this.s;
      if (g === 'station') { s.depot[step.i] = true; s.supply.depots--; }
      else {
        const l = s.level[step.i]++;
        if (l < 4) s.supply.houses--;
        else if (l === 4) { s.supply.hotels--; s.supply.houses += 4; }
        else { s.supply.skyscrapers--; s.supply.hotels++; }
      }
      this.onBuild?.(p, step.i, action, false);
      this.log && this.ev(p, { t: 'build', space: step.i, level: s.level[step.i], depot: g === 'station', single: false });
    }
  }

  /** sell one building unit at half price; keeps the group even (sells from the highest level) */
  private sellUnit(i: number) {
    const s = this.s, sp = this.sp(i), p = s.owner[i];
    const half = Math.floor(sp.houseCost! / 2);
    const l = s.level[i];
    this.changed();
    let units = 1;
    if (l === 6) {
      if (s.supply.hotels > 0) { s.supply.hotels--; s.supply.skyscrapers++; s.level[i] = 5; }
      else if (s.supply.houses >= 4) { s.supply.houses -= 4; s.supply.skyscrapers++; s.level[i] = 4; units = 2; }
      else { s.supply.skyscrapers++; s.level[i] = 0; units = 6; }
    } else if (l === 5) {
      if (s.supply.houses >= 4) { s.supply.houses -= 4; s.supply.hotels++; s.level[i] = 4; }
      else { s.supply.hotels++; s.level[i] = 0; units = 5; }
    } else {
      s.supply.houses++; s.level[i] = l - 1;
    }
    s.players[p].cash += half * units;
  }

  // ---------------------------------------------------------------- trading and funding

  /** can space i change hands? Official: buildings in its colour group must be sold first; depots too */
  tradeable(i: number) {
    if (!this.isProperty(i) || this.s.owner[i] < 0 || this.s.depot[i]) return false;
    if (this.sp(i).type !== 'street') return true;
    for (const j of this.members[this.groupOf[i]!]) if (this.s.level[j] > 0) return false;
    return true;
  }

  /** interest the receiver of mortgaged property pays at once (official 10 %) */
  transferFees(spaces: number[]) {
    let fee = 0;
    for (const i of spaces) if (this.s.mortgaged[i]) fee += this.mortgageInterest(i);
    return fee;
  }

  /** the player on turn may propose a few trades before rolling; each goes to one other player */
  private tradePhase(p: number) {
    const pol = this.policies[p];
    if (!pol.proposeTrades) return;
    let tries = 0;
    // after a trade the other offers may no longer fit, so the policy is asked again
    while (tries < MAX_OFFERS) {
      const offers = pol.proposeTrades(this, p);
      let done = false;
      for (const o of offers) {
        if (++tries > MAX_OFFERS) return;
        if (this.trade(p, o)) { done = true; break; }
      }
      if (!done) return;
    }
  }

  /** validates and, if the other side agrees, carries out a trade; false if declined or unaffordable */
  trade(p: number, o: TradeOffer): boolean {
    const q = o.to, s = this.s;
    if (!Number.isInteger(q) || q < 0 || q >= s.players.length || q === p || !this.active(q) || !this.active(p)) throw new Error(`invalid trade partner ${q}`);
    if (!Number.isInteger(o.cash)) throw new Error(`invalid trade cash ${o.cash}`);
    const all = [...o.give, ...o.get];
    if (new Set(all).size !== all.length) throw new Error('trade lists a space twice');
    for (const i of o.give) if (!Number.isInteger(i) || s.owner[i] !== p || !this.tradeable(i)) throw new Error(`cannot give space ${i}`);
    for (const i of o.get) if (!Number.isInteger(i) || s.owner[i] !== q || !this.tradeable(i)) throw new Error(`cannot get space ${i}`);
    if (!all.length) throw new Error('trade without property');
    const cp = s.players[p].cash - o.cash - this.transferFees(o.get);
    const cq = s.players[q].cash + o.cash - this.transferFees(o.give);
    if (cp < 0 || cq < 0) return false;
    const accept = this.policies[q].acceptTrade;
    if (!accept || !accept(this, q, p, o)) return false;
    s.players[p].cash = cp;
    s.players[q].cash = cq;
    for (const i of o.give) s.owner[i] = q;
    for (const i of o.get) s.owner[i] = p;
    this.changed();
    this.trades++;
    this.log && this.ev(p, { t: 'trade', to: q, give: [...o.give], get: [...o.get], cash: o.cash });
    this.onTrade?.(p, o);
    return true;
  }

  /** a mortgage or building sale the player may make by choice (not in the group of `target` when building) */
  fundable(p: number, a: FundAction, reason: RaiseReason, target: number) {
    const s = this.s, i = a.space;
    if (!Number.isInteger(i) || i < 0 || i >= this.n || s.owner[i] !== p) return false;
    const g = this.groupOf[i]!;
    const sameGroup = reason === 'build' && this.groupOf[target] === g;
    if (a.kind === 'mortgage') {
      if (s.mortgaged[i] || s.depot[i] || sameGroup) return false;
      if (this.sp(i).type === 'street') for (const j of this.members[g]) if (s.owner[j] === p && s.level[j] > 0) return false;
      return true;
    }
    if (s.depot[i]) return !sameGroup;
    if (this.sp(i).type !== 'street' || s.level[i] === 0 || sameGroup) return false;
    for (const j of this.members[g]) if (s.owner[j] === p && s.level[j] > s.level[i]) return false; // sell evenly
    return true;
  }

  private fund(p: number, reason: RaiseReason, target: number, _cost: number, actions: FundAction[] | null) {
    if (!actions) return;
    const s = this.s, pl = s.players[p];
    for (const a of actions) {
      if (!this.fundable(p, a, reason, target)) throw new Error(`invalid ${a.kind} of space ${a.space}`);
      const i = a.space, sp = this.sp(i), depot = s.depot[i];
      if (a.kind === 'mortgage') { s.mortgaged[i] = true; pl.cash += sp.mortgage!; }
      else if (depot) { s.depot[i] = false; s.supply.depots++; pl.cash += sp.depotCost! / 2; }
      else this.sellUnit(i);
      this.changed();
      this.log && this.ev(p, a.kind === 'mortgage' ? { t: 'mortgage', space: i, reason } : { t: 'sell', space: i, reason, depot });
    }
  }

  // ---------------------------------------------------------------- money

  /** raise cash by the cheapest rent loss per M gained: mortgages and building sales */
  private liquidate(p: number, need: number) {
    const s = this.s, pl = s.players[p];
    while (pl.cash < need) {
      // cheapest option by rent lost per M raised: 1 sell a depot, 2 sell a building unit, 3 mortgage
      let kind = 0, pick = -1, bestRatio = Infinity;
      for (let i = 0; i < this.n; i++) {
        if (s.owner[i] !== p) continue;
        const sp = this.sp(i), g = this.groupOf[i]!;
        if (s.depot[i]) {
          const ratio = this.rent(i, 7) / 2 / (sp.depotCost! / 2);
          if (ratio < bestRatio) { bestRatio = ratio; kind = 1; pick = i; }
          continue;
        }
        if (sp.type === 'street' && s.level[i] > 0) {
          let top = 0;
          for (const j of this.members[g]) if (s.owner[j] === p && s.level[j] > top) top = s.level[j];
          if (s.level[i] < top) continue; // sell evenly
          const loss = sp.rent![s.level[i]] - sp.rent![s.level[i] - 1];
          const ratio = loss / (sp.houseCost! / 2);
          if (ratio < bestRatio) { bestRatio = ratio; kind = 2; pick = i; }
          continue;
        }
        if (s.mortgaged[i]) continue;
        if (sp.type === 'street') {
          let built = false;
          for (const j of this.members[g]) if (s.owner[j] === p && s.level[j] > 0) { built = true; break; }
          if (built) continue;
        }
        const ratio = this.rent(i, 7) / sp.mortgage!;
        if (ratio < bestRatio) { bestRatio = ratio; kind = 3; pick = i; }
      }
      if (pick < 0) break;
      const sp = this.sp(pick);
      if (kind === 1) { s.depot[pick] = false; s.supply.depots++; pl.cash += sp.depotCost! / 2; }
      else if (kind === 2) this.sellUnit(pick);
      else { s.mortgaged[pick] = true; pl.cash += sp.mortgage!; }
      this.changed();
      this.log && this.ev(p, kind === 3 ? { t: 'mortgage', space: pick, reason: 'debt' } : { t: 'sell', space: pick, reason: 'debt', depot: kind === 1 });
    }
    // house rule: give property back to the bank, least useful first. The loop above has sold every
    // building by now, so no street goes back while its group is still built up
    const share = this.rules.bankReturn;
    while (share !== null && pl.cash < need) {
      let pick = -1, bestRatio = Infinity;
      for (let i = 0; i < this.n; i++) {
        if (s.owner[i] !== p || s.level[i] > 0 || s.depot[i]) continue;
        const ratio = this.rent(i, 7) / this.sp(i).price!;
        if (ratio < bestRatio) { bestRatio = ratio; pick = i; }
      }
      if (pick < 0) return;
      const sp = this.sp(pick);
      // a mortgage is settled like lifting it: loan plus interest
      const payoff = s.mortgaged[pick] ? this.mortgagePayoff(pick) : 0;
      const value = Math.max(0, Math.floor(share * sp.price!) - payoff);
      s.owner[pick] = -1;
      s.mortgaged[pick] = false;
      this.changed();
      pl.cash += value;
      this.log && this.ev(p, { t: 'bank_return', space: pick, value, payoff });
    }
  }

  /** returns false if p went bankrupt; rent debts count for H15 */
  pay(p: number, amount: number, to: Creditor, rent = false): boolean {
    if (amount <= 0) return true;
    const pl = this.s.players[p];
    if (pl.cash < amount) this.liquidate(p, amount);
    if (pl.cash < amount) {
      this.bankrupt(p, to, rent);
      return false;
    }
    pl.cash -= amount;
    if (to === 'pot') this.s.pot += amount;
    else if (typeof to === 'number') this.s.players[to].cash += amount;
    return true;
  }

  private bankrupt(p: number, to: Creditor, rent: boolean) {
    const s = this.s, pl = s.players[p];
    const creditor = typeof to === 'number' ? to : -1;
    // H15 covers rent only; other debts to a player (cards) transfer everything as usual
    const toBank = rent && this.rules.bankruptcyToBank;
    this.log && this.ev(p, { t: 'bankrupt', to: creditor });
    // liquidate already sold everything it could; remaining buildings can only exist without buyers
    for (let i = 0; i < this.n; i++) if (s.owner[i] === p) while (s.level[i] > 0) this.sellUnit(i);
    if (creditor >= 0 && toBank) {
      // house rule: no property transfer for rent; the creditor keeps what cash there was
      s.players[creditor].cash += pl.cash;
      pl.cash = 0;
    }
    if (creditor >= 0 && !toBank) {
      const c = s.players[creditor];
      c.cash += pl.cash;
      c.goojf.push(...pl.goojf);
      c.busTickets += pl.busTickets;
      for (let i = 0; i < this.n; i++) {
        if (s.owner[i] !== p) continue;
        s.owner[i] = creditor;
        if (s.depot[i]) { s.depot[i] = false; s.supply.depots++; c.cash += this.sp(i).depotCost! / 2; }
        // ponytail: creditor pays 10% interest on mortgaged property only if he can
        if (s.mortgaged[i]) {
          const fee = this.mortgageInterest(i);
          if (c.cash >= fee) c.cash -= fee;
        }
      }
      // §8.4: a mortgaged street joining a built-up group is lifted at once if affordable
      for (let i = 0; i < this.n; i++) {
        if (s.owner[i] !== creditor || !s.mortgaged[i] || this.sp(i).type !== 'street') continue;
        const built = this.members[this.groupOf[i]!].some((j) => s.owner[j] === creditor && s.level[j] > 0);
        if (built && c.cash >= this.sp(i).mortgage!) { c.cash -= this.sp(i).mortgage!; s.mortgaged[i] = false; }
      }
    } else {
      if (to === 'pot') s.pot += pl.cash;
      for (const d of pl.goojf) this.returnGoojf(d);
      // ponytail: official rules auction these off; we return them to the bank unowned
      for (let i = 0; i < this.n; i++) {
        if (s.owner[i] !== p) continue;
        s.owner[i] = -1; s.mortgaged[i] = false;
        if (s.depot[i]) { s.depot[i] = false; s.supply.depots++; }
      }
    }
    pl.cash = 0; pl.goojf = []; pl.busTickets = 0;
    pl.bankrupt = true; pl.inJail = false;
    pl.outRound = s.round; pl.outTo = creditor;
    this.changed();
  }
}

export function createPlayer(name: string, cash: number, pos = 0): PlayerState {
  return { name, cash, pos, inJail: false, jailTurns: 0, goojf: [], busTickets: 0, bankrupt: false };
}
