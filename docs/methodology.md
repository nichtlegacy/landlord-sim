# Methodology

Landlord answers "who wins from here, and how likely?" by playing the position to
the end many times with bots and counting. This page describes what varies
between games, what is measured, and how precise the numbers are.

## Setup of a run

A run (`RunConfig` in `src/sim/runner.ts`) is: an edition, a `RuleConfig`, a
scenario (the position), one bot profile per player, a number of games, a seed,
and optionally rotating starts. Game `k` uses the seed `gameSeed(seed, k)`; the
same run always gives the same results, whether it runs in one process or split
over browser workers.

Every game starts from the scenario and plays until one player is left or the
round cap (500 rounds by default) is passed. Nothing is decided by a formula; rent,
building, trades and bankruptcies all happen in the game.

## Uncertain inputs

A position read off a real table is never exact. The scenario format expresses
this, and every game draws its own concrete values (`buildState` in
`src/engine/state.ts`):

| Input | How it varies |
|---|---|
| Cash per player | A range `[min, max]`; each game draws a whole number uniformly from it. Equal bounds = counted exactly. |
| Order of the Chance and Community Fund decks | Unknown, so shuffled per game. Get Out of Jail Free cards held by players are taken out of their deck first. |
| Bus tickets left in the stack | A count (`busTicketsLeft`). Each game takes that many cards from a shuffled full stack, so it is unknown how many of the "expire" tickets remain. |
| Dice | One stream per player, from the game seed. |

Everything else (owners, buildings, mortgages, depots, positions, jail state,
cards and tickets held, the Free Parking pot, agreements) is part of the scenario
and fixed.

The bots are the largest modelling choice. Results are always "with these bots";
the web app therefore shows how much the result moves when the players' styles
change (all combinations of the three styles, `balanced`, `aggressive`,
`cautious`; `npm run sim -- --sensitivity` in the terminal).

## What is reported

| Statistic | Definition | Where |
|---|---|---|
| Win share per player | wins / games, with a 95 % Wilson interval (`wilson`) | `RunStats.wins`, `ci` |
| Wins by bankruptcy vs at the cap | a game that reaches the round cap is won by net worth; those wins are counted separately | `capWins`, `timeouts` |
| Game length | rounds until the end, per game: median, histogram | `rounds` |
| Survival curve | share of games still running after n rounds, with Wilson intervals | from `rounds` |
| Who bankrupts whom | matrix victim × creditor, the bank as an extra column | `bankruptBy` |
| Net worth over time | every 25th game, per round up to round 150: median and percentile bands | `trajectories` |
| Convergence | win share after the first n games, to see that the run has settled | from `samples` |
| Seat advantage | wins by position in turn order, with rotating starts | `seatWins` |
| Trades per game | total trades / games | `trades` |

### Seat advantage and rotating starts

With `rotateStart`, game `k` starts with player `(current + k) mod n`. With
identical bots, the seat in turn order is then the only difference between
players, and `seatWins` measures what moving first is worth. For a new game this
option removes the seat advantage from the players' win shares. For a mid-game
position it should be off, because the player on turn is part of the position.
Measured values are in [validation.md](validation.md#seat-advantage).

### Paired differences between variants

The web app compares rule variants (official rules, popular house rules, the
current selection, and the current selection without speed die, without trading,
without auctions; 5,000 games each) and trades ("what does this trade bring?",
2,000 / 5,000 / 10,000 games). All variants of a comparison use the same seeds, so
game `k` has the same cash draws, deck orders and per-player dice in each
([architecture.md](architecture.md#per-player-dice-streams-common-random-numbers)).

The difference in player i's win share is then measured game by game
(`pairedDelta` in `src/ui/ResultsView.tsx`):

```
d_k = [variant A game k won by i] − [variant B game k won by i]
Δ = mean(d_k),   95 % half-width = 1.96 × sd(d_k) / √n
```

When the two variants mostly produce the same winner, `d_k` is mostly 0 and the
interval of Δ is much narrower than the intervals of the two win shares.

The trade check plays the position once without and once with the trade, with
the same seeds, and reports Δ for every player. The trade itself is applied with
the engine's rules: only tradeable property, and the receiver of mortgaged
property pays the 10 % interest at once.

## How many games you need

The standard error of a win share p from n games is √(p(1 − p) / n). The 95 %
half-width at p = 50 % (the widest case):

| Games | ± at p = 50 % | ± at p = 10 % |
|---:|---:|---:|
| 1,000 | 3.1 pp | 1.9 pp |
| 5,000 | 1.4 pp | 0.8 pp |
| 10,000 | 1.0 pp | 0.6 pp |
| 20,000 | 0.7 pp | 0.4 pp |
| 100,000 | 0.3 pp | 0.2 pp |

- 10,000–20,000 games are enough for a single position (the web app defaults to
  10,000 for a new game and 20,000 for the example end game). At about 2,000–3,000
  games per second and core ([architecture.md](architecture.md#performance)),
  that is a few seconds.
- Differences between variants need fewer games than the table suggests when they
  are paired. [validation.md](validation.md#common-random-numbers) measures by how
  much.
- Seat advantages of 1–4 percentage points need 20,000 or more games per setup.
- The Wilson interval covers only the sampling error, not the choice of bots or
  of the round cap, and the bots can matter more. In the example end game, Ada's
  win share ranges from 67.1 % to 81.3 % over the 27 combinations of the three
  styles, against a sampling error of about ±2.8 pp per combination
  (`npm run sim -- --sensitivity --games 1000`).
