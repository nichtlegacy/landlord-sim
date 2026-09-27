# Editions

An edition is the physical game: board, prices, rents, building supply and card
decks. The rules are separate (`RuleConfig`); each edition module exports its
official rules next to the edition.

| Id | Spaces | Start money | Supply | Decks | Official rules |
|---|---:|---:|---|---|---|
| `classic` | 40 | 1,500 | 32 houses, 12 hotels | 16 Chance, 16 Community Fund | `classicRules` |
| `grand` | 52 | 2,500 | 32 houses, 12 hotels, 8 skyscrapers, 4 depots | 16 Chance, 16 Community Fund, 16 bus tickets | `grandRules` |

Both use invented street names (Tannery Lane … Lighthouse Point; the grand board
adds e.g. Belfry Lane and Cliff Terrace) and invented card texts with the effects
of the published decks. Both carry a German translation.

## Where editions live

```
data/<id>/board.json         board, prices, rents, supply, groups, translations
data/<id>/cards.json         decks, translations
src/editions/<id>/index.ts   loadEdition + assertEdition, official RuleConfig
```

`src/editions/grand/index.ts` in full, minus the rules object:

```ts
import board from '../../../data/grand/board.json';
import cards from '../../../data/grand/cards.json';
import { assertEdition, loadEdition } from '../../engine/edition';

export const grand = assertEdition(loadEdition(board, cards, { id: 'grand', maxLevel: 6 }));
```

`loadEdition` (`src/engine/edition.ts`) maps the snake_case JSON to the `Edition`
type. `assertEdition` runs `validateEdition` and throws with a list of every
problem, so broken data fails at import, not in the middle of a simulation.

## board.json

| Field | Maps to | Meaning |
|---|---|---|
| `name` | `name` | Edition name (English). |
| `currency` | `currency` | Currency sign. |
| `side_length` | `sideLength` | Spaces per side, both corners counted (11 classic, 14 grand). |
| `start_money` | `startMoney` | Cash per player in a new game. |
| `jail_index` | `jailIndex` | Position of the jail space. |
| `supply` | `supply` | `houses`, `hotels`, and optionally `skyscrapers`, `depots` (missing = 0). |
| `groups` | `groups` | Colour group → space indices. `station` and `utility` entries are allowed but dropped; the engine derives those groups from the space types. |
| `spaces[]` | `spaces` | One entry per space, in board order. |
| `locales` | `locales` | Translations, see [below](#translations-of-an-edition). |

Fields per space:

| Field | Maps to | For |
|---|---|---|
| `index` | `index` | Position; must equal the array index. |
| `name` | `name` | English name. |
| `type` | `type` | `go`, `street`, `station`, `utility`, `tax`, `chance`, `community_chest`, `jail`, `go_to_jail`, `free_parking`, `auction`, `birthday_gift`, `bus_ticket`. |
| `group` | `group` | Colour group of a street. |
| `price`, `mortgage` | same | Streets, stations, utilities. |
| `rent` | `rent` | Street: `[site, 1, 2, 3, 4 houses, hotel, (skyscraper)]`. Station: rent by number of stations owned. |
| `house_cost` | `houseCost` | Price of one house; hotels and skyscrapers cost the same. |
| `depot_cost` | `depotCost` | Stations, when the supply has depots. Sold back at half. |
| `rent_multiplier` | `utilityMultiplier` | Utility: dice multiplier by number of utilities owned. |
| `amount` | `amount` | Tax amount; Birthday Gift amount. |

Any other field is ignored. The bundled files carry informational fields such as
`num_spaces`, `go_salary`, `jail_fine`, `unimproved_multiplier`, `hotel_cost` or
`depot_multiplier`; the engine takes those values from `RuleConfig` or derives
them, never from the data.

## cards.json

```json
{
  "chance": [
    { "id": "CH05", "text": "Hop on at the nearest station. ...", "count": 1,
      "effect": { "type": "move_nearest", "kind": "station", "rent_multiplier": 2 } }
  ],
  "community_chest": [ ... ],
  "bus_ticket": [
    { "id": "BT_MOVE", "text": "Ride forward to any space on this side of the board, corners included.", "count": 13,
      "effect": { "type": "bus_move_side" } },
    { "id": "BT_EXPIRE", "text": "Every other bus ticket expires now. ...", "count": 3,
      "effect": { "type": "bus_move_side", "on_draw": "expire_all_other_tickets" } }
  ],
  "locales": { "de": { "chance": [ ... ], "community_chest": [ ... ], "bus_ticket": [ ... ] } }
}
```

- `count` puts that many copies in the deck (default 1). The grand bus deck is
  2 entries expanded to 16 cards.
- `bus_ticket` is optional. A bus card's only effect is `on_draw:
  'expire_all_other_tickets'`; what a ticket does when used is a rule.

Card effects (`CardEffect` in `src/engine/types.ts`):

| `type` | Fields | Effect |
|---|---|---|
| `move_to` | `target` | Move forward to the space (GO paid when passed) and resolve it. |
| `move_nearest` | `kind` (`station` / `utility`), `rent_multiplier`, `dice_multiplier` | Move forward to the nearest one; rent × `rent_multiplier` (station) or dice × `dice_multiplier` (utility, never less than the deed). |
| `move_relative` | `steps` | Move by `steps` (negative = back), no GO salary. |
| `collect`, `pay` | `amount` | From / to the bank (or the pot with H9). |
| `collect_each_player`, `pay_each_player` | `amount` | From / to every other active player. |
| `repairs` | `per_house`, `per_hotel`, `per_skyscraper`, `per_depot` | Pay per building owned; skyscraper defaults to the hotel price. |
| `get_out_of_jail_free` | | Kept until used, then returned to the bottom of its deck. |
| `go_to_jail` | | Go to jail. |

## What validateEdition checks

`validateEdition(ed)` returns a list of problems; empty means the engine can use
the edition.

- **Board shape:** `spaces.length === 4 × (sideLength − 1)`; every `index` equals
  its position; exactly one `go`, at 0; `jailIndex` points to a `jail`; only known
  space types.
- **Properties:** streets, stations and utilities have `price` and `mortgage` > 0.
- **Streets:** the group exists in `groups` and lists the street; `rent` has at
  least `maxLevel + 1` entries; `houseCost` > 0.
- **Groups:** every member is a street of that group; no space is in two groups.
- **Stations and utilities:** `rent` has one entry per station on the board,
  `utilityMultiplier` one per utility; with depots in the supply every station has
  a `depotCost`.
- **Tax, Birthday Gift:** `amount` > 0.
- **Supply:** non-negative integers. `maxLevel` is 5 (hotel) or 6 (skyscraper);
  skyscrapers are in the supply exactly when `maxLevel` is 6.
- **Decks:** at most one Get Out of Jail Free card per deck (the engine finds it by
  effect type to return it); known effect types; `move_to` targets on the board;
  `move_nearest` only to a space type that exists; a deck is non-empty exactly when
  the board has spaces of that kind; a bus deck needs a `bus_ticket` or
  `birthday_gift` space.
- **Translations:** every translated space exists; a translated deck has one text
  per card (after `count` expansion) and no empty text.

## Adding an edition

1. Create `data/<id>/board.json` and `data/<id>/cards.json` in the format above.
   Invent names and card texts, or use material you have the rights to.
2. Create `src/editions/<id>/index.ts` that exports the edition
   (`assertEdition(loadEdition(board, cards, { id, maxLevel }))`) and its official
   `RuleConfig`. Start from `classicRules` or `grandRules` and change what differs.
3. Register it in `EDITIONS` in `src/ui/model.ts`. The editor, share links and
   AI import pick it up from there.
4. New colour group keys need a colour in `GROUP_COLORS` (`src/ui/model.ts`) and a
   name under `group.<key>` in every dictionary in `src/ui/i18n/`.
5. Add it to `EDITIONS` in `src/sim/fuzz.ts` so the fuzzer covers it, and to the
   `it.each` list in `src/engine/edition.test.ts`.
6. Run `npm test` and `npm run sim -- --fuzz 20000`.

Limits: the board must be square (four equal sides), because bus tickets and the
board drawing assume it; building levels stop at 6; depots only go on stations. A
new space type or card effect needs engine code (see
[architecture.md](architecture.md#where-to-extend)).

## Translations of an edition

The English texts in `spaces[].name` and `text` are the fallback. A `locales`
block adds other languages; missing entries fall back to English.

In `board.json`:

```json
"locales": {
  "de": {
    "name": "Klassisch",
    "currency": "€",
    "spaces": { "0": "Los", "1": "...", "2": "..." }
  }
}
```

`spaces` is keyed by space index (as a string), so a translation can cover some
spaces only. `currency` is optional.

In `cards.json`, one array per deck, with one text per *raw* entry, i.e. before
`count` expansion; the loader repeats each text like the card itself:

```json
"locales": {
  "de": { "chance": ["...", "..."], "community_chest": ["..."], "bus_ticket": ["...", "..."] }
}
```

Code reads localized texts through `editionName`, `editionCurrency`, `spaceName`
and `cardText` in `src/engine/edition.ts`. To add a language to an edition, add the
language key to both files and run `npm test`; `validateEdition` reports spaces
that do not exist and decks with the wrong number of texts.
