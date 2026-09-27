# Rules the engine models

The engine implements the rules of the well-known property-trading game family:
the published rules of the classic game (40 spaces) and of its 52-space variant
with speed die, bus tickets, skyscrapers and depots. The bundled editions are
`classic` and `grand` ([editions.md](editions.md)). Everything that differs
between the two, and every house rule, is a field of `RuleConfig`
([architecture.md](architecture.md#ruleconfig-the-single-switchboard)). This page
describes the official behaviour; the house rules are in
[house-rules.md](house-rules.md).

Code references are to `src/engine/game.ts` unless stated otherwise.

## Turn structure

1. The player on turn may propose trades (see [Trading](#trading)).
2. A jailed player takes a jail turn (see [Jail](#jail)).
3. Rolling: two white dice (2d6), plus the speed die on the grand board. A player
   holding a bus ticket may use it instead of any roll, including the extra roll
   after doubles.
4. **Doubles** (the two white dice equal; the speed die never counts) give another
   roll. The **third doubles** in a row send the player straight to jail without
   moving. With `doublesAgain: false` every turn is one roll and there is no third
   doubles rule.
5. After the rolls: building, then lifting mortgages.

**GO:** passing or landing pays `goSalary` (200). This applies to dice, cards that
move forward, triples, bus tickets, bus rides and the bonus move. Going to jail
never pays. "Step back three spaces" never passes GO. Landing exactly on GO pays
`goLandTotal` if it is set (a house rule amount).

The **speed die** is used from the first turn. It is not rolled in jail.

## Landing on a space

| Space | Rule |
|---|---|
| Unowned property | Buy at list price, or decline. A declined property is auctioned to all players ([Auctions](#auctions)). |
| Own property | Nothing (unless a building house rule applies). |
| Opponent's property | Pay rent to the owner. Mortgaged: nothing. Owners in jail still collect. |
| Chance, Community Fund | Draw the top card and carry it out. |
| Tax | Pay the printed amount to the bank. |
| Go to Jail | Go to jail. |
| Jail (just visiting), GO, Free Parking | Nothing. |
| Auction (grand) | See [Auction space](#auction-space). |
| Birthday Gift (grand) | Take the gift (100) or a bus ticket; the gift if no tickets are left. |
| Bus Ticket (grand) | Take a bus ticket; nothing if none are left. |

Rent is always collected automatically; nobody forgets to ask for it.

## Rent

| Property | Rent |
|---|---|
| Street without buildings | Site rent. With the whole group: × `unimprovedMultiplier.all` (classic 2, grand 3). With all but one street of the group: × `unimprovedMultiplier.allButOne` (classic 1, grand 2). Mortgaged streets count as owned. |
| Street with buildings | The printed rent for 1–4 houses, hotel or skyscraper. No multiplier. |
| Station | 25 / 50 / 100 / 200 for 1–4 stations owned (mortgaged ones count). × 2 with a depot. × 2 again from the "nearest station" card. |
| Utility | The white dice × 4 / 10 (classic) or × 4 / 10 / 20 (grand) for 1 / 2 / 3 utilities owned. The dice are the roll that brought the player there. Arriving by card, bus ticket, triple, bus ride or bonus move, the player rolls the white dice for the rent. The "nearest utility" card uses 10 × dice, but never less than the deed (so 20 × with three utilities on the grand board). |

Rent agreements and jokers (see [Agreements](#agreements-between-players)) are
applied on top.

## Building

- **Threshold:** houses and hotels need the whole colour group (classic,
  `requirement: 'full_group'`) or all but one street of it (grand,
  `'all_but_one'`: 2 of 3 or 3 of 4). No street of the group the player owns may
  be mortgaged.
- **Levels:** 1–4 houses, 5 = hotel, 6 = skyscraper (grand only; `maxLevel` of the
  edition). A hotel returns four houses to the supply; a skyscraper returns the
  hotel. House, hotel and skyscraper cost the same (`house_cost`).
- **Skyscraper:** needs the complete group with a hotel on every street
  (`skyscraperNeedsFullGroup`).
- **Even building:** each unit goes on a street of the group with the lowest
  level. Selling works the same way from the top.
- **Supply:** classic 32 houses and 12 hotels; grand 32 houses, 12 hotels,
  8 skyscrapers and 4 depots. A step that needs a piece the bank does not have is
  not possible.
- **Depots (grand):** one per station, 100 each, no other requirement than owning
  the (unmortgaged) station. Doubles the station rent.
- **When:** at the end of the player's own turn, on every group, one unit at a time
  while the bot wants to (`buildMore`). Official rules allow building any time
  during one's own turn; the engine does it once per turn, after the rolls.
- **Selling** gives half the price back. When a hotel is sold and the bank has
  fewer than four houses, the hotel is taken down to a bare site (all five units
  sold); a skyscraper goes down to a hotel, or four houses, or a bare site,
  whichever the supply allows.

## Mortgages

- Only properties without buildings in their group can be mortgaged. The player
  receives the printed mortgage value.
- Lifting a mortgage costs the value plus 10 % interest, rounded up to a whole
  unit (`mortgagePayoff`).
- Whoever receives a mortgaged property in a trade or a bankruptcy pays the 10 %
  interest at once. Lifting it later costs value plus 10 % again.
- Mortgaged property earns no rent but counts towards group ownership.

## Raising money and bankruptcy

A player who owes more cash than he has raises money automatically
(`liquidate`), cheapest rent lost per unit of money first: selling depots,
selling building units (evenly), mortgaging properties of unbuilt groups. If that
is not enough, the player is bankrupt.

- **Bankrupt to a player:** remaining buildings are sold to the bank at half
  price, then cash, all properties, Get Out of Jail Free cards and bus tickets go to
  the creditor. Depots are sold to the bank and the creditor gets the half price.
  The creditor pays the 10 % interest on mortgaged properties if he can. A
  mortgaged street that joins a group the creditor has built on is lifted at once
  (for its mortgage value) if affordable.
- **Bankrupt to the bank** (taxes, cards, bail): Get Out of Jail Free cards go back
  to their decks, properties go back to the bank unowned, depots back to the
  supply.
- The bankrupt player leaves the game. The last player left wins.

Bots may also raise money by choice before buying or building
([bots.md](bots.md#raising-cash-by-choice)).

## Jail

**In:** the Go to Jail space, a "go to jail" card, third doubles. The piece goes
directly to the jail space without passing GO, and the turn ends.

**Out**, per jail turn (official):

1. Before rolling, the player may play a Get Out of Jail Free card or pay the fine
   (50). He then rolls normally (`payThenRoll`).
2. Otherwise he rolls the two white dice. Doubles: he leaves and moves by that
   roll, without another roll.
3. After the third failed attempt he pays the fine and moves by that roll.

Jailed owners still collect rent (`rentWhileJailed`). A used Get Out of Jail Free
card goes to the bottom of its deck.

## Auctions

A declined property is auctioned among all active players, including the one who
declined (`auction`). The model is a sealed-bid second-price auction: every player
states the most he would pay (capped at his cash); the highest bidder wins and pays
one more than the second-highest bid (at least 1, at most his own bid). This gives
the result of an open auction in steps of 1 with bidders who stop at their limit.

Ties go to the bidder who comes first in turn order, starting from the player on
turn. (An earlier version gave ties to the first player in the list, which
favoured one seat; see [validation.md](validation.md#bugs-found-by-validation).)
If nobody bids, the property stays with the bank.

## Trading

Official rules allow trading unbuilt property, Get Out of Jail Free cards and bus
tickets at any price; lending money is not allowed. The engine models:

- Only the player on turn proposes, before rolling, at most three offers per turn,
  each to one other player (`tradePhase`). After a successful trade the bot is
  asked again, within the same limit of three.
- An offer is property one way, property the other way, and cash
  (`TradeOffer`). The engine rejects offers with property that has buildings in its
  colour group, with a depot, or not owned by the right player.
- Both sides must be able to pay the cash and the 10 % interest on mortgaged
  property they receive.
- The other player accepts or declines (`acceptTrade`). Without that hook every
  offer is declined.

How the bots choose and price offers is in [bots.md](bots.md#trading).

## End of the game and the round cap

Official rules end the game only when one player is left. Some games never end
(Friedman et al. 2009, [validation.md](validation.md#friedman-et-al-2009-games-that-never-end)),
so the engine stops after `roundCap` rounds (500). The winner is then the player
with the highest net worth: cash, plus list price per property (the mortgage value
if mortgaged), plus the building cost of every level and depot. Ties go to the
earlier player in the list. The runner counts these games and these wins
separately ([methodology.md](methodology.md)). The round cap is a simulation
convention, not an official rule.

## The grand board

### Speed die

Faces **1, 2, 3, bonus, bonus, bus**. The speed die is thrown with the white dice
on every normal roll.

- **1–3:** added to the white dice.
- **Bonus:** move by the white dice and resolve the space. Then, if the player is
  still in the game and not in jail, move forward to the next unowned property and
  resolve it (buy or auction). If nothing is unowned, move forward to the next
  property where rent is due to an opponent (owned by someone else, not
  mortgaged) and pay it. If there is none, stay.
- **Bus:** move by the white dice and resolve the space. Then, if not in jail: with
  tickets left, take a bus ticket **or** ride forward to the nearest Chance or
  Community Fund space and draw there. With no tickets left, the player must ride.

### Triples

All three dice show the same number (1-1-1, 2-2-2, 3-3-3; probability 1/72): the
player moves forward to any space he chooses, resolves it and the turn ends. GO is
paid when the target lies past it. Triples do not count as doubles, so they cannot
be a third doubles.

### Bus tickets

- Held openly; 16 in the stack: 13 normal ones and 3 "all other tickets expire".
  Drawing an expiry ticket sets every player's tickets, including the drawer's,
  to zero; the drawer then keeps this one.
- Used instead of a roll, at the start of a turn or instead of the roll after
  doubles. The player moves forward to any space on the current side of the board,
  up to and including the next corner (`ticketTargets`), and resolves it. A used
  ticket leaves the game.

### Auction space

If unowned property is left, the player picks one and the bank auctions it. If
none is left, the player moves forward to the property with the highest rent he
would pay (ties: the nearer one) and pays it. If there is no such property, he
stays.

### Birthday Gift

The player takes 100 from the bank or a bus ticket. With no tickets left, the 100.

## Agreements between players

Players at a real table make deals. A scenario may carry them
(`Agreement` in `types.ts`, edited in the web app):

- **Rent deal:** payer X pays owner Y at most a fixed amount and/or a percentage of
  the rent, on all of Y's property, on stations, utilities, one group or a list of
  spaces.
- **Joker:** payer X may have a percentage (50 or 100) of one rent waived, a given
  number of times, against one owner or anyone. The bot plays a joker for rents of
  400 or more, or over 30 % of its cash.

## Assumptions and simplifications

| Topic | Engine behaviour |
|---|---|
| Dice | Two six-sided dice, plus the speed die where the rules have one. |
| Building levels | 4 houses, hotel, and on the grand board a skyscraper. Editions must use `maxLevel` 5 or 6. |
| Depots | Only on stations. |
| Timing of building | Once per turn, after the rolls, and only in one's own turn. |
| Building shortage | No auction for scarce houses or hotels; a step that needs a missing piece is not possible. |
| Trading | Property and cash only. Get Out of Jail Free cards and bus tickets are not tradable. Only the player on turn proposes. |
| Bankruptcy to the bank | Properties go back unowned; they are not auctioned. |
| Buying the last street of a built group | Only on bankruptcy transfers is a mortgaged street lifted at once; otherwise no forced build-up. |
| Mortgaged property received | Interest paid at once; lifting later costs value plus interest again. The official option to lift it immediately for the value alone is not offered. |
| Raising cash for a debt | Automatic, by least rent lost; the player does not choose the order. |
| Rent | Always collected. |
| Card effects | `collect_go` on cards is not read: every forward move that passes GO pays. |
| Bank | Has unlimited money. |
| Bonus move | Targets the next property with rent due; under house rule H11 that rent may still be waived if the owner is in jail. |
| Round cap | 500 rounds, winner by net worth. |
