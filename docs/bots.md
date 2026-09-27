# Bots

Every decision a player makes goes through a `Policy` (`src/engine/policy.ts`).
Policies only read the game; the engine validates what they return and throws on
an illegal choice. There are two bot implementations, registered in `BOTS`:

- `heuristic`: one parametric heuristic, configured by a profile.
- `random`: random legal moves. A weak baseline and the fuzzing opponent
  ([validation.md](validation.md#fuzzing)).

Which bot a player uses is chosen by profile id (`PROFILES`), per player.

## Profiles

Styles are the everyday choice and the only ones the style sensitivity analysis
combines (`STYLE_IDS`). Literature presets rebuild bots from published work.

| Id | Kind | Reserve | Bid factor | Jail | Leverage | Trades | Trade margin | Rival weight | Other |
|---|---|---|---:|---|:-:|:-:|---:|---:|---|
| `balanced` | style | 200 + 0.5 × max rent | 1.1 | smart | yes | yes | 50 | 0.5 | |
| `aggressive` | style | 50 + 0.15 × max rent | 1.5 | leave | yes | yes | 0 | 0.3 | |
| `cautious` | style | 400 + 1.0 × max rent | 0.8 | stay | no | yes | 150 | 0.8 | |
| `friedman` | literature | max(200, max rent) | 0 (never bids) | stay | no | no | – | – | Friedman et al. 2009 |
| `fp_a` | literature | 200 | 1.0 | leave | no | yes | 0 | 0.5 | Bonjour et al., fixed policy A |
| `fp_b` | literature | 200 | 1.0 | leave | no | yes | 0 | 0.5 | focus: stations, dark blue |
| `fp_c` | literature | 200 | 1.0 | leave | no | yes | 0 | 0.5 | focus: stations, orange, light blue |
| `darling` | literature | 200 + 0.5 × max rent | 1.1 | smart | yes | yes | 0 | 0.5 | avoids utilities, build target 3 houses (after Tim Darling) |
| `random` | test | – | – | – | – | – | – | – | random legal moves |

Parameters (`Profile`):

| Parameter | Meaning |
|---|---|
| `reserveBase`, `reserveRentShare`, `reserveMode` | Cash the bot keeps back: base + share × the highest single rent an opponent can charge it right now (`sum`), or the larger of the two (`max`). |
| `bidFactor` | Auction limit as a multiple of list price (before the strategic weight). 0 = never bids. |
| `jail` | `leave`: always leave when possible; `stay`: always roll; `smart`: leave while the highest rent against it is below 25 % of its cash. |
| `leverage` | May mortgage or sell elsewhere to buy a property that completes or blocks a set, and to build. |
| `trades` | Proposes and accepts trades. |
| `tradeMargin` | Smallest gain (in money) that makes a trade worth it, for both sides. |
| `rivalWeight` | How much the other side's gain counts against the bot's own, divided by the number of opponents. |
| `focus` | Only these groups are bought freely; streets of other groups only when the purchase reaches the building threshold. Stations and utilities outside the focus are never bought at list price. |
| `avoid` | Groups never bought at list price (the bot still bids below it). |
| `buildTarget` | Building past this level needs twice the reserve, and the bot does not borrow for it. |

## The heuristic's decisions

**Reserve.** Almost every decision compares cash with a reserve:
`reserveBase + reserveRentShare × maxRentAgainst(p)` (or the max of the two).
`maxRentAgainst` is the highest rent p could owe on one landing now, with utilities
at a dice total of 7 and rent deals applied.

**Strategic weight** of a property for player p (`weight`):

| Situation | Weight |
|---|---:|
| Station or utility | 1.2 |
| Completes the whole group | 2.0 |
| Reaches the building threshold (all but one) | 1.7 |
| Stops an opponent from reaching the threshold | 1.5 |
| Otherwise | 1.0 |

| Decision | Rule |
|---|---|
| Buy | Allowed by `focus`/`avoid`, and cash − price ≥ reserve / weight. |
| Auction bid | price × `bidFactor` × weight (at most 0.8 × price for groups it would not buy), capped at cash − reserve / 2. |
| Build one more unit | cash − cost ≥ reserve (× 2 past `buildTarget`). |
| Jail | Leave if the profile says so (see `jail`): card first, else pay if cash − fine ≥ reserve, else roll. |
| Triple target | The space with the highest position value, plus the GO salary if the move passes GO. |
| Bus ticket | Use it for the best target on this side if that beats twice the value of an ordinary roll by more than 30; else roll. |
| Bus face, tickets left | Always take a ticket. |
| Stay or ride (H8) | Ride if the position value at the nearest card space (plus GO salary if passed) beats staying by more than 5. |
| Birthday Gift | A bus ticket if cash > reserve, else the cash. |
| Auction space | Auction the unowned property with the highest price × weight. Under H18 only if it would bid at least list price. |
| Unmortgage | With a budget of cash − 1.5 × reserve: first groups that meet the building threshold, then by list price. |
| Bail for rent (H11) | Buy out when the rent is at least 1.5 × the fine (3 × for the `stay` jail style). |
| Joker | Play it for rents of 400 or more, or above 30 % of cash. |

**Position value** (`positionValue`) = value of ending on a space now + expected
value of the next roll from there. The roll uses the distribution of the white
dice plus the speed die's number faces (bonus and bus count 0; doubles and triples
ignored). The value of a space:

| Space | Value |
|---|---|
| Unowned property it could afford | 0.2 × price × weight |
| Own property | 40 if it could build on landing (H4, H10), else 10 |
| Opponent's property | − rent |
| Tax | − amount (× 0.7 with a Free Parking pot) |
| Go to Jail | + 30 late in the game (the highest rent against it is over 25 % of its cash), − 50 otherwise |
| Free Parking | the pot, with H9 |
| GO | the landing bonus over the salary |
| Birthday Gift | the gift amount |
| Chance / Community Fund | the average value of the cards still in the deck, for this player |

This is what makes a bot ride the bus past an opponent's expensive street: staying
means the next roll lands on it often.

## Trading

The bot on turn lists candidate deals, prices each one so that both sides gain,
and offers them best first. The engine tries at most three offers per turn.

**Candidates** (`listDeals`). For every colour group where the bot owns at least
one street but is below the building threshold, and every opponent who owns
enough tradeable streets of that group to close the gap:

- a cash offer: the missing streets for money;
- swap offers: the same streets for streets of another group that bring the
  partner to *its* threshold there.

Stations and utilities are never asked for. The list depends only on ownership and
is recomputed once per game revision.

**Value of a group** for player x (`groupWorth`), with
`landings = opponents × (1.2 / spaces) × 25 rounds`:

| Holding | Worth |
|---|---|
| Stations | price + count × rent at that count × landings |
| Utilities | price + count × 7 × multiplier × landings |
| Streets below the threshold | price + site rents × landings |
| Streets at the threshold (a set) | price + affordability × max(0, rent at 3 houses × landings − building cost / 2) |

"Price" is list price, or list price minus the payoff for mortgaged streets.
Building cost is three houses on every street held. Affordability is x's cash
after the trade divided by that cost, clamped to 0.2–1: a set is worth less to a
player who cannot build on it.

**Gain** of an offer (`tradeGains`) for each side: change in cash (including the
10 % interest on mortgaged property received) plus the change in group worth of
every group involved.

**Pricing** (`priceOffer`). With λ = rival weight / number of opponents, the
proposer's score is `gain_p − λ × gain_q` and the partner's is
`gain_q − λ × gain_p`. The cash payment is chosen so that both scores clear the
margin, in the middle of the feasible range (a Nash split of the surplus), rounded
to 10 and capped by each side's cash minus half its reserve. The price is computed
twice, because the payment changes affordability. If no payment works, there is no
offer.

**Acceptance** (`acceptTrade`): the partner recomputes the gains with its own
profile and accepts if `gain_self − λ × gain_proposer ≥ its margin`.

**Cooldown:** each (partner, group) pair is considered at most once every four
rounds, so bots do not repeat a refused offer every turn.

## Raising cash by choice

Profiles with `leverage` implement `fund`: before a purchase or a build step the
engine asks whether to mortgage or sell something first.

- **Buying:** only for a property with weight ≥ 1.5 (it completes or blocks a set)
  and allowed by `focus`/`avoid`. The bot raises cost + reserve / weight − cash.
- **Building:** it raises cost + reserve − cash, and gives up only income that
  earns clearly less per unit of money than the new building: rent lost per money
  < (rent gained per money) / 1.5. Not past `buildTarget`.
- **Options**, cheapest rent lost per money first: mortgaging properties outside
  the target's group (never a street of a group at the building threshold) and, when
  building, selling building units or depots elsewhere.
- The plan is returned only if it covers the whole amount; otherwise nothing is
  mortgaged.

The engine checks every action with `Game.fundable` and looks for the next build
step again afterwards, because selling a hotel changes the house supply.

Forced liquidation for a debt is not a policy decision; see
[rules.md](rules.md#raising-money-and-bankruptcy).

## The random bot

`randomPolicy` buys with probability 0.7, bids a random amount up to 1.5 × price
(or nothing), builds each unit with probability 0.6, picks jail options, triple
targets, bus choices and auction picks uniformly, proposes a random trade in 15 %
of turns (random properties from both sides, random cash) and accepts 40 % of
offers. It uses its own random stream, so the dice stay paired across runs.

## The Policy interface

Abridged (types omitted; see `src/engine/policy.ts`):

```ts
interface Policy {
  buy(g, p, i): boolean;
  bid(g, p, i): number;                       // maximum it would pay
  buildMore(g, p, i, cost): boolean;          // asked before every unit
  jail(g, p): 'card' | 'pay' | 'roll';
  tripleTarget(g, p): number;
  rideInsteadOfStay(g, p): boolean;           // bus without tickets (H8)
  ticketOrRide(g, p): 'ticket' | 'ride';
  birthday(g, p): 'cash' | 'ticket';
  busTicketTarget(g, p): number | null;       // null = roll
  auctionPick(g, p, candidates): number;
  startAuction(g, p, candidates): number | null;  // H18
  unmortgage(g, p): number[];
  bailForRent(g, p, rent): boolean;           // H11
  useJoker(g, p, owner, rent, percent): boolean;
  proposeTrades?(g, p): TradeOffer[];         // optional
  acceptTrade?(g, p, from, offer): boolean;   // optional; missing = decline all
  fund?(g, p, reason, i, cost): FundAction[] | null;  // optional
}
```

`g` is the `Game`; useful read-only helpers are `g.s` (the state), `g.rent`,
`g.rentFor`, `g.maxRentAgainst`, `g.ownedIn`, `g.threshold`, `g.meetsThreshold`,
`g.tradeable`, `g.fundable`, `g.ticketTargets`, `g.netWorth`. Leave optional hooks
undefined when a bot does not use them; the engine then skips those phases.

## Adding a bot

1. Write a function that returns a `Policy`, e.g. `myPolicy(profile, rng)`. Use
   only the `rng` passed in for random choices, never `Math.random`, so games stay
   reproducible.
2. Add its name to the `bot` union in `Profile` and an entry to `BOTS`:
   `mine: (profile, rng) => myPolicy(profile, rng)`.
3. Add one or more entries to `PROFILES` with `bot: 'mine'` and a `kind`
   (`style` joins the sensitivity analysis; `literature` should name its `source`).
   The UI shows the name under `profile.<id>` from the dictionaries in
   `src/ui/i18n/`, falling back to the profile's `label`.
4. `src/engine/trade.test.ts` checks that every profile builds a policy; add a
   test for the behaviour you care about. The fuzzer picks every profile at random,
   so `npm test` plays it against the others.

A new *profile* of the heuristic is only step 3. Changing an existing profile or
the heuristic changes results: bump `ENGINE_VERSION` in `src/ui/cache.ts` and
expect new `npm run bench` fingerprints.
