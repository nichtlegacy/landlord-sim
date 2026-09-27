# House rules

Every house rule is an entry in `HOUSE_RULES` (`src/house-rules/index.ts`): an id
and an `apply` function that returns a changed `RuleConfig`, plus `needsSpeedDie`
and `requires` where they apply. Rules can be combined freely. The texts (label,
what the rule does, what the official rule says) live in the UI dictionaries under
`houseRules.<id>.label`, `.ours` and `.official` (`src/ui/i18n/`). The web app shows
each rule as a switch with the official rule next to it.

Two numbers are skipped on purpose: **H2** (triples move to any space) is an
official rule of the grand board, and **H5** (GO amounts) became the
[amounts](#amounts) below.

## The rules

| Id | House rule | Official rule | `RuleConfig` change | Grand only |
|---|---|---|---|:-:|
| H1 | The bonus face of the speed die has no effect; it counts 0. | Bonus move to the next unowned property, else to the next rent due. | `speedDie.bonusMove: 'ignore'` | yes |
| H3 | At most 6 building units per build action, built evenly. | No limit other than cash, supply and even building. | `build.maxUnitsPerAction: 6` | |
| H4 | Build only when standing on one's own street of the group, then on the whole group. | Build any time in one's own turn, wherever one stands. | `build.timing: 'standing_on_group'` | |
| H6 | Jail: one attempt at doubles per turn. Doubles only open the door; the player then rolls a normal turn. After the third miss the player leaves without paying but sits out this turn. | Doubles move by that roll, no further roll. After the third miss: pay the fine and move by that roll. | `jail.maxRollAttempts: 3`, `afterMaxAttempts: 'free_next_turn'`, `onDoubles: 'free_then_roll'` | |
| H7 | Bus face with tickets left: always take a ticket. | Take a ticket or ride to the nearest Chance/Community Fund space. | `speedDie.bus.withTickets: 'ticket'` | yes |
| H8 | Bus face with no tickets left: move by the white dice, then choose to stay or ride to the nearest card space. The choice comes before the white-dice space is resolved. The Bus Ticket space with no tickets left offers the same choice. | Must ride. The Bus Ticket space does nothing when the stack is empty. | `speedDie.bus.whenEmpty: 'choose'`, `decideBeforeResolve: true`, `busSquareWhenEmpty: 'choose'` | yes |
| H9 | Free Parking pot: taxes, "pay" cards, repairs and bail go to the middle; landing on Free Parking takes it all. | All penalties go to the bank; Free Parking does nothing. | `freeParkingPot: true` | |
| H10 | Single-site building: below the building threshold, each exact landing on one's own street adds one house (up to 4). | Houses only from the threshold (full group, or all but one). | `build.singleSiteOnLanding: true` | |
| H11 | Jailed owners collect no rent. Buying out on one's own turn restores rent at once but the player sits the turn out. When someone lands on a jailed owner's property, the owner may buy out at that moment and collect. | Jailed owners collect rent. Paying or using a card is followed by a roll. | `jail.rentWhileJailed: false`, `payThenRoll: false`, `bailForRent: true` | |
| H12 | No building limit. | Limited supply (classic 32/12; grand 32/12/8 skyscrapers/4 depots). | `unlimitedSupply: true` | |
| H13 | Speed die off: two white dice only, no bus, no bonus move, no triples. | Speed die from the first turn. | `speedDie: null`, `triplesAnySpace: false` | yes |
| H14 | Short of cash after selling buildings and mortgaging, property goes back to the bank for 75 % of its price; a mortgage is netted like lifting it (loan plus 10 %). Least useful first; never a street of a group that is still built. | Only building sales and mortgages. | `bankReturn: 0.75` | |
| H15 | Bankrupt over rent: property goes to the bank, the landlord gets only the remaining cash. Other debts to players (cards) transfer everything as usual. | The creditor takes cash, property and cards. | `bankruptcyToBank: true` | |
| H16 | With H10: a lone street keeps growing on exact landings, hotel after four houses, then skyscraper, one level per landing. At the threshold it also allows the skyscraper that the full-group rule would block. | Skyscrapers only with the full group and hotels on every street. | `build.singleSiteMaxLevel: 6` | |
| H17 | A property the player does not buy stays with the bank; no auction. | Declined property is auctioned. | `auctionOnDecline: false` | |
| H18 | Auction space: the player decides whether to auction an unowned property. With none left, the move to the highest rent still happens. Bots start an auction only if they would bid at least list price. | Must auction. | `auctionSpaceOptional: true` | yes |

"Grand only" rules (`needsSpeedDie: true`) are ignored on editions without a speed
die: `rulesFor()` in `src/ui/model.ts` filters them, and the fuzzer never picks
them there.

### Dependencies

H16 has `requires: 'H10'`. `applyHouseRules` applies a rule only if the rule it
requires is on too, so H16 alone does nothing. `toggleRule` keeps the list
consistent: switching H16 on also switches H10 on; switching H10 off also switches
H16 off. The UI shows H16 nested under H10.

### Speed die modes

H1 and H13 are shown as one control with three modes (`speedModeOf`,
`withSpeedMode`): off (H13), official, bonus face without effect (H1).

## Amounts

Tables often differ in money amounts. These are numbers, not
switches (`Amounts`, `applyAmounts`):

| Amount | Field | Official |
|---|---|---|
| GO when passing | `goSalary` | 200 |
| GO when landing exactly | `goLandTotal` | same as passing |
| Bail | `jail.fine` | 50 |

Setting an amount to 0 switches that payment off. A common house rule is double
pay for landing on GO: `goLand: 400`.

## Presets

| Preset | House rules | Amounts |
|---|---|---|
| Official | none | official |
| Popular | H9 (Free Parking pot), H11 (no rent from jail), H17 (no auctions) (`POPULAR_HOUSE_RULES`) | GO landing = 2 × salary (`popularAmounts`) |

The example end game (`src/scenarios/example.ts`) uses every house rule except H13,
with GO 200 / 400 and bail 100 (`EXAMPLE_HOUSE_RULES`, `EXAMPLE_AMOUNTS`). It is an
illustration, not a recommendation.

## Continuation switches

A position taken from an unfinished game can be played on in three ways that are
not house rules but a statement about how the game would have continued. They are
`RuleConfig` fields, set from the "continuation" block in the web app
(`Continuation` in `src/ui/model.ts`):

| Switch | Field | Off means |
|---|---|---|
| Buying | `buying` | Unowned property stays with the bank: no purchases, no auctions, also not on the Auction space. |
| Building | `building` | No new houses, hotels, skyscrapers or depots. Mortgages can still be lifted. |
| Trading | `trading` | Nobody trades; property changes hands only by purchase, auction and bankruptcy. |

## Adding a house rule

1. **Add a field** to `RuleConfig` in `src/engine/types.ts` (or a new value of an
   existing field), with a one-line comment that says what the official value is.
2. **Set the official value** in `classicRules` (`src/editions/classic/index.ts`)
   and `grandRules` (`src/editions/grand/index.ts`).
3. **Read it** in `src/engine/game.ts` exactly where the rule applies. If a player
   has to decide something new, add a method to `Policy` and implement it in both
   bots (`heuristicPolicy`, `randomPolicy`).
4. **Register it** in `HOUSE_RULES` with the next free id and `apply`, plus
   `needsSpeedDie` / `requires` if they apply. The list is sorted by number, and the
   UI picks it up automatically.
5. **Describe it** with the keys `houseRules.<id>.label`, `.ours` and `.official`
   in every dictionary in `src/ui/i18n/`.
6. **Check it:** a targeted test in `src/engine/game.test.ts`; an invariant in
   `src/engine/audit.ts` if the rule can be violated in a way the audit does not
   see yet. The fuzzer (`src/sim/fuzz.ts`) switches every house rule on at random,
   so `npm test` and `npm run sim -- --fuzz 20000` exercise it in combination with
   all others.
7. **Bump `ENGINE_VERSION`** in `src/ui/cache.ts` if existing setups now play
   differently, so cached results are not reused.
