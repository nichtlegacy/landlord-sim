# Validation

How we know the simulation plays the rules correctly, and how its results compare
with published numbers. Every number here comes with the command that reproduces
it. Runs are deterministic: the same command and seed give the same output.
Numbers were measured with Node 24.19.

| Check | Command | Result |
|---|---|---|
| Landing probabilities vs Collins | `npm test` | all 41 states within 0.12 pp |
| Friedman et al. 2009, games that never end | `npm run sim -- --validate friedman --games 20000` | 12.1 % (11.7–12.6 %) vs 12 % ± 1 % |
| Trading and games reaching the cap (Sammul 2018) | `npm run sim -- --validate seats --games 20000` | 63.3 % → 0.0 % at the cap |
| Seat advantage | `npm run sim -- --validate seats --games 20000` | first seat +4.2 pp with four players |
| Common random numbers | `npm run sim -- --validate crn --games 2000` | up to 2.6× fewer games |
| Rule audit | `npm run sim -- --audit 300` | 1,800 games, 0 violations |
| Fuzzing | `npm run sim -- --fuzz 20000 --seed 11` | 20,000 games, 0 violations |

## Landing probabilities against the Markov solution

`src/engine/validation.test.ts` plays 1.5 million rolls on the classic board with a
bot that always leaves jail at once, and counts where each roll ends, including
card moves and jail. The reference is Truman Collins' table of long-run landing
probabilities ("Probabilities in the Game of Monopoly", short-jail strategy).

**Result: every one of the 40 squares plus "in jail" is within 0.12 percentage
points** of the published value. This confirms dice, doubles, third doubles, jail,
Go to Jail, the card decks and card moves. The test runs with every `npm test`.

## Friedman et al. 2009: games that never end

Friedman, Henderson, Byuen and Gutiérrez Gallardo (Winter Simulation Conference
2009) simulate two players with a very simple strategy and find that **12 % ± 1 %
of games are still running after 10,000 rounds** (3,100 games).

The profile `friedman` rebuilds their bot: cash reserve max(200, highest rent it
could owe), otherwise buys everything, never bids, never trades, stays in jail
until the third miss; one roll per turn without doubles-again
(`doublesAgain: false`, as in the paper); classic board, two players.

`npm run sim -- --validate friedman --games 20000` (8 s):

| Rounds | Still running | 95 % interval |
|---:|---:|---|
| 50 | 97.1 % | 96.9–97.3 % |
| 100 | 59.2 % | 58.5–59.9 % |
| 200 | 18.2 % | 17.7–18.7 % |
| 500 | 12.8 % | 12.3–13.3 % |
| 1,000 | 12.4 % | 11.9–12.8 % |
| 5,000 | 12.2 % | 11.7–12.6 % |
| 10,000 | **12.1 %** | **11.7–12.6 %** |

With the paper's sample size (`npm run sim -- --validate friedman`, 3,100 games):
**11.5 % (10.4–12.7 %)** after 10,000 rounds. Both are inside the published
interval.

Differences from the original remain: their bot sells a Get Out of Jail Free card
to the bank for 50 at once, ours keeps it and never uses it; ours builds house by
house rather than row by row; our classic decks have the card effects of the UK
version of the published decks, theirs the US version.

## Trading and game length

Sammul (2018, University of Edinburgh) reports that without trading about 52 % of
games reach the turn limit, and with trading none do. With four `balanced` bots on
the classic board (`npm run sim -- --validate seats --games 20000`, last two
setups):

| Classic, 4 players | Games at the round cap (500) | Median length |
|---|---:|---:|
| Without trading | 63.3 % | 501 rounds |
| With trading | 0.0 % | 51 rounds |

The direction and size of the effect agree. The limits differ (500 rounds here,
a turn limit there), so the percentages are not directly comparable.

## Seat advantage

With identical bots and rotating starts (see
[methodology.md](methodology.md#seat-advantage-and-rotating-starts)), the seat in
turn order is the only difference between players.
`npm run sim -- --validate seats --games 20000`, profile `balanced`, 95 % intervals
about ±0.6 pp:

| Setup | Seat 1 | 2 | 3 | 4 | 5 | 6 | Fair |
|---|---:|---:|---:|---:|---:|---:|---:|
| Classic, 2 players | 50.7 % | 49.3 % | | | | | 50 % |
| Classic, 3 players | 36.2 % | 32.8 % | 31.0 % | | | | 33.3 % |
| Classic, 4 players | 29.2 % | 25.8 % | 23.7 % | 21.3 % | | | 25 % |
| Classic, 6 players | 21.0 % | 19.1 % | 17.2 % | 15.6 % | 14.2 % | 13.0 % | 16.7 % |
| Grand, 4 players | 29.9 % | 27.0 % | 23.1 % | 19.9 % | | | 25 % |
| Classic, 4 players, no trading | 28.4 % | 26.4 % | 23.7 % | 21.6 % | | | 25 % |

With four players the first player wins about 4 points more often than fair and
the last about 4 less. With two players the advantage is small (0.7 pp) but
outside the noise. A plausible reason: whoever moves earlier reaches unowned
property first. We did not find a published figure to compare with. The default
of the command, 100,000 games per setup, narrows the intervals to about ±0.3 pp.

## Common random numbers

All variants of a comparison play the same seeds, so the difference between two
rule sets is measured game by game (see
[methodology.md](methodology.md#paired-differences-between-variants)).
`npm run sim -- --validate crn --games 2000` compares the standard error of the
difference with paired seeds and with independent seeds, and reports how many
times fewer games pairing needs for the same precision ((SE independent /
SE paired)²):

| Comparison (trading on) | Per player |
|---|---|
| Classic, 4 players: official vs Free Parking pot | 2.3×, 2.4×, 1.3×, 2.3× |
| Example end game: house rules vs without H10 | 2.6×, 1.1×, 2.6× |
| Example end game: house rules vs no trading | 1.4×, no gain, 1.4× |

Trading weakens the pairing: trades react to small differences in cash, so paired
games drift apart sooner. The comparison "vs no trading" changes exactly that.

**Per-player streams.** Every player has his own dice stream and his own speed-die
stream, so a player's n-th roll is the same in both variants even when a rule
makes others roll more or less often. During development this was measured
against a single shared dice stream, with trading off and 4,000 games per run:

| Comparison | Shared stream | Stream per player |
|---|---:|---:|
| Official vs Free Parking pot | 5.1–5.6× | 4.9–5.7× |
| Official vs H6 jail rule | 2.4–2.6× | 2.6–3.0× |
| Doubles-again on vs off | 1.0–1.1× | 1.6–1.7× |
| Speed die on vs off | 1.0× | 1.0× |

The honest finding: per-player streams only help for rules that change the number
of rolls (jail, doubles). For the speed die no pairing helps, because every move has
a different length. Most of the gain comes from the shared seed itself. The shared
stream no longer exists in the code, so this table cannot be reproduced with the
current CLI.

## Rule audit

`src/engine/audit.ts` plays whole games, rotating through the three styles, and
checks invariants after **every roll**, **every turn**, **every building unit** and
**every trade**:

- Houses, hotels, skyscrapers and depots are conserved (board + supply = total)
  and the supply never goes negative.
- No buildings without an owner, on mortgaged property or on non-streets; depots
  only on stations; no level above the edition's maximum.
- Every build step is legal *at the moment it is placed*: threshold reached (or
  H10/H16 on the space the player stands on), no mortgage in the group, even
  building (each unit on a lowest street), skyscrapers only with the full group.
  Levels rise only through reported build steps.
- H3: at most 6 units per build action. H4: building only on the group the player
  stands on, and only in his own turn.
- Trades: no property with buildings in its group, no depot, no negative cash.
  Property never changes hands with buildings or to a bankrupt player. No trades
  when trading is off.
- Every Get Out of Jail Free card is either in its deck or in exactly one hand.
- No negative cash, jailed players stand on the jail space, bankrupt players own
  nothing, no negative bus tickets, no negative pot; without the Free Parking rule
  the pot never changes.
- Every game ends.

`npm run sim -- --audit 300` on the example end game (grand board), seed 1:

| Variant (300 games each) | Rolls | Build steps | Trades | Violations |
|---|---:|---:|---:|---:|
| Example house rules | 69,421 | 12,896 | 1,071 | 0 |
| … without trading | 73,447 | 12,525 | 0 | 0 |
| … without single-site building (H10) | 76,585 | 11,925 | 1,351 | 0 |
| Official rules | 18,664 | 11,016 | 1,187 | 0 |
| … house rules, no buying after the snapshot | 188,002 | 7,114 | 373 | 0 |
| … house rules, no buying or building | 221,327 | 0 | 432 | 0 |

`npm test` runs the audit on seven setups with 150 games each: the example end game
under several rule sets, new games with 4–5 players on the grand board, and a new
classic game.

## Fuzzing

`src/sim/fuzz.ts` draws everything at random per game: the edition, a random subset
of the house rules, GO and bail amounts, trading, doubles-again, buying and building
on or off, 2–6 players, and a random but consistent position (owners, even buildings
within the supply, mortgages, depots, cash, jail, Get Out of Jail Free cards, bus
tickets, jokers). 60 % of the players are random bots, the rest random profiles of
the heuristic. Random bots make choices the heuristic never would: random trades,
mortgages, sales, bus rides and bids. Every game runs through the rule audit; an
exception counts as a violation.

`npm run sim -- --fuzz 20000 --seed 11`: **20,000 games, 6.26 million rolls,
665,000 build steps, 162,000 trades, 0 violations**, 20.5 s. `npm test` plays 1,500
fuzz games (seed 7), CI plays 5,000 more. `fuzzCase(k, seed)` rebuilds the setup of
a single failing game.

## Targeted rule tests

`src/engine/game.test.ts` and `src/engine/trade.test.ts` check single rules:
rents at every level (skyscraper, houses, all-but-one doubled, stations with
depots, mortgaged property, utilities by dice), even building with H3/H4, H10 and
H16, the skyscraper block without the full group, GO amounts, bus ticket reach,
jail variants (official and H6), bail into the pot with H9, H8's choice before
paying, H11, H12, H14, H15, H17, H18, the continuation switches, agreements and
jokers, trade legality and pricing, mortgage interest on transfer, raising cash by
choice, per-player dice streams, rotating starts, cap wins, replay, and a readable
text for every event of whole games. `src/engine/edition.test.ts` checks the edition
validator.

## Bugs found by validation

Fixed during development, found by the checks above:

- **Supply at −1 when building on a mortgage.** The build step was chosen before
  the player raised money. Selling a hotel for that money takes four houses from
  the supply (the street goes back to four houses), and the step chosen before then
  built a house that was no longer there. Found by the fuzzer (classic board,
  H9/H10/H11/H16). The step is now chosen again after raising money, and the audit
  checks the supply for negative values.
- **Equal auction bids always went to the first player in the list.** With four
  identical bots on the grand board, player 1 won 32.6 % instead of 25 %. Bidding
  now goes round in turn order from the player on turn; with rotating starts the
  four seats then measured 25.7 / 24.6 / 25.6 / 24.1 %.
- A creditor who took over the mortgaged last street of a built group in a
  bankruptcy kept the mortgage. It is now lifted at once if affordable.
- H10 did not check mortgages on the other streets of the group.
- The measurement hook was missing after a move by bus ticket. Only the audit saw
  it; the rules themselves were right.
- The audit itself raised false alarms: under H4 and single-site building it
  checked the player's position at the end of the roll. Building on the group and
  then moving on by bus, bonus move or card looked like a violation. It now checks
  at the moment of building.
