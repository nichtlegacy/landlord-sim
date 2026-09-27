// Core types shared by engine, editions, policies, runner and UI.

export type SpaceType =
  | 'go' | 'street' | 'station' | 'utility' | 'tax' | 'chance' | 'community_chest'
  | 'jail' | 'go_to_jail' | 'free_parking' | 'auction' | 'birthday_gift' | 'bus_ticket';

export interface Space {
  index: number;
  name: string;
  type: SpaceType;
  group?: string;
  price?: number;
  /** street: [site, 1..4 houses, hotel, (skyscraper)]; station: rent by count owned */
  rent?: number[];
  /** one price for house, hotel and skyscraper (true for both built-in editions) */
  houseCost?: number;
  mortgage?: number;
  /** tax amount, birthday gift amount */
  amount?: number;
  depotCost?: number;
  /** utility: dice multiplier by count owned */
  utilityMultiplier?: number[];
}

export type CardEffect =
  | { type: 'move_to'; target: number; collect_go?: boolean }
  | { type: 'move_nearest'; kind: 'station' | 'utility'; rent_multiplier?: number; dice_multiplier?: number }
  | { type: 'move_relative'; steps: number }
  | { type: 'collect'; amount: number }
  | { type: 'pay'; amount: number }
  | { type: 'pay_each_player'; amount: number }
  | { type: 'collect_each_player'; amount: number }
  | { type: 'repairs'; per_house: number; per_hotel: number; per_skyscraper?: number; per_depot?: number }
  | { type: 'get_out_of_jail_free' }
  | { type: 'go_to_jail' };

export interface Card { id: string; text: string; effect: CardEffect }
export interface BusCard { id: string; text: string; expiresOthers: boolean }

export type Deck = 'chance' | 'community_chest';

export interface Supply { houses: number; hotels: number; skyscrapers: number; depots: number }

/** translations of an edition's printed texts; the edition itself carries the English ones */
export interface EditionLocale {
  name?: string;
  currency?: string;
  /** space index → name */
  spaces?: Record<number, string>;
  /** card texts by deck, index as in Edition.decks */
  cards?: { chance?: string[]; community_chest?: string[]; bus?: string[] };
}

export interface Edition {
  id: string;
  name: string;
  /** e.g. { de: {...} }; missing entries fall back to the English text */
  locales?: Record<string, EditionLocale>;
  currency: string;
  spaces: Space[];
  sideLength: number;
  groups: Record<string, number[]>;
  startMoney: number;
  jailIndex: number;
  /** highest building level on a street: 5 = hotel (classic), 6 = skyscraper (grand) */
  maxLevel: number;
  supply: Supply;
  decks: { chance: Card[]; community_chest: Card[]; bus: BusCard[] };
}

export type SpeedFace = 1 | 2 | 3 | 'bonus' | 'bus';

export interface RuleConfig {
  goSalary: number;
  /** total paid for landing exactly on GO (null = same as passing) */
  goLandTotal: number | null;
  speedDie: null | {
    faces: SpeedFace[];
    /** bonus face: move on to the next unowned property, else the next rent due (official) or no effect */
    bonusMove: 'official' | 'ignore';
    bus: {
      /** tickets left: official = take ticket or ride to next Chance/CC; house = take ticket */
      withTickets: 'ticket_or_ride' | 'ticket';
      /** no tickets left: official = must ride; house = choose to stay or ride */
      whenEmpty: 'ride' | 'choose';
      /** house rule: decide stay/ride before resolving the white-dice square */
      decideBeforeResolve: boolean;
    };
  };
  triplesAnySpace: boolean;
  build: {
    /** houses/hotels allowed with a full group or with all but one */
    requirement: 'full_group' | 'all_but_one';
    /** skyscraper needs full group and hotels on every street */
    skyscraperNeedsFullGroup: boolean;
    timing: 'any_turn' | 'standing_on_group';
    maxUnitsPerAction: number | null;
    /** custom H10: below the requirement, landing exactly on a street allows +1 house */
    singleSiteOnLanding: boolean;
    singleSiteMaxLevel: number;
  };
  jail: {
    fine: number;
    maxRollAttempts: number | null;
    /** after the last failed attempt: pay the fine and move with that roll (official) or leave free and roll next turn (house) */
    afterMaxAttempts: 'pay_and_move' | 'free_next_turn';
    /** doubles in jail: move with that roll and stop (official) or only get out and then play a normal turn (house) */
    onDoubles: 'move' | 'free_then_roll';
    /** owners in jail still collect rent (official) */
    rentWhileJailed: boolean;
    /** paying or using a card on your turn is followed by a roll (official); otherwise you sit this turn out */
    payThenRoll: boolean;
    /** a jailed owner may buy out at the moment rent is due, to collect it */
    bailForRent: boolean;
  };
  freeParkingPot: boolean;
  /** house rule: no limit on houses, hotels, skyscrapers and depots */
  unlimitedSupply: boolean;
  /** house rule: when short of cash, property can go back to the bank for this share of its price (mortgage netted) */
  bankReturn: number | null;
  /** continuation after an abort: free property can still be bought and auctioned (off = stays with the bank) */
  buying: boolean;
  /** continuation after an abort: houses, hotels, skyscrapers and depots can still be built */
  building: boolean;
  /** house rule: bankrupt over rent, the property goes to the bank and the creditor only gets the remaining cash */
  bankruptcyToBank: boolean;
  /** a property the player does not buy: auctioned to everyone (official) or it stays with the bank (house) */
  auctionOnDecline: boolean;
  /** Auction space with unowned property left: must auction (official) or the player may choose (house) */
  auctionSpaceOptional: boolean;
  /** bus ticket square without tickets left: nothing (official) or choose stay/ride (house) */
  busSquareWhenEmpty: 'nothing' | 'choose';
  /** players may trade property and cash with each other (official); off = no trading at all */
  trading: boolean;
  /** doubles give another roll (official); off = one roll per turn, as in Friedman et al. 2009 */
  doublesAgain: boolean;
  unimprovedMultiplier: { allButOne: number; all: number };
  mortgageInterest: number;
  roundCap: number;
}

export interface PlayerState {
  name: string;
  cash: number;
  pos: number;
  inJail: boolean;
  jailTurns: number;
  goojf: Deck[];
  busTickets: number;
  bankrupt: boolean;
  /** round in which the player went bankrupt, and to whom (-1 = bank) */
  outRound?: number;
  outTo?: number;
}

/** which of the owner's properties a rent agreement covers */
export type AgreementScope = 'all' | 'stations' | 'utilities' | { group: string } | { spaces: number[] };

/** individual deals between players, e.g. "Cleo pays at most M100 at Ben's stations" or jokers */
export type Agreement =
  | { kind: 'rent'; payer: number; owner: number; scope: AgreementScope; maxAmount?: number; percent?: number; note?: string }
  | { kind: 'joker'; payer: number; owner: number | null; uses: number; percent: number; note?: string };

export interface GameState {
  players: PlayerState[];
  /** per space: owner player index, -1 = bank */
  owner: number[];
  /** per street: 0 site, 1-4 houses, 5 hotel, 6 skyscraper */
  level: number[];
  depot: boolean[];
  mortgaged: boolean[];
  supply: Supply;
  /** card indices, draw from the front, return to the back */
  decks: { chance: number[]; community_chest: number[]; bus: number[] };
  pot: number;
  current: number;
  round: number;
  /** jokers count down, so the state owns a copy */
  agreements: Agreement[];
}

/** a trade between the player on turn (`from`) and `to`; cash > 0: from pays to, cash < 0: to pays from */
export interface TradeOffer { to: number; give: number[]; get: number[]; cash: number }

/** raising cash voluntarily before a purchase or a build step: mortgage a property or sell one building unit */
export interface FundAction { kind: 'mortgage' | 'sell'; space: number }

/** why money was raised: before buying, before building, or forced by a debt */
export type RaiseReason = 'buy' | 'build' | 'debt';

/** what happened in a game, as data; the UI turns it into text (src/ui/events.ts) */
export type EventBody =
  | { t: 'roll'; dice: [number, number]; face: SpeedFace | null }
  | { t: 'triple'; dice: [number, number]; face: SpeedFace; to: number }
  | { t: 'third_double' }
  | { t: 'jail_card'; sitOut: boolean }
  | { t: 'jail_pay'; amount: number; sitOut: boolean }
  | { t: 'jail_miss'; dice: [number, number] }
  | { t: 'jail_free_after_max'; dice: [number, number] }
  | { t: 'jail_doubles_free'; dice: [number, number] }
  | { t: 'jail_leave'; dice: [number, number] }
  | { t: 'bail_for_rent'; card: boolean; amount: number }
  | { t: 'go_to_jail' }
  | { t: 'bus_ride'; to: number }
  | { t: 'ticket_use'; to: number }
  | { t: 'ticket_take' }
  | { t: 'bonus_move'; to: number }
  | { t: 'tax'; space: number; amount: number }
  | { t: 'pot'; amount: number }
  | { t: 'card'; deck: Deck; card: number }
  | { t: 'buy'; space: number; price: number }
  | { t: 'decline'; space: number; auction: boolean }
  | { t: 'auction_won'; space: number; price: number }
  | { t: 'auction_none'; space: number }
  | { t: 'auction_space'; space: number | null; blocked: boolean }
  | { t: 'rent'; space: number; owner: number; amount: number; deal: boolean }
  | { t: 'no_rent_jailed'; space: number; owner: number }
  | { t: 'joker'; percent: number; left: number }
  | { t: 'build'; space: number; level: number; depot: boolean; single: boolean }
  | { t: 'unmortgage'; space: number }
  | { t: 'mortgage'; space: number; reason: RaiseReason }
  | { t: 'sell'; space: number; reason: RaiseReason; depot: boolean }
  | { t: 'bank_return'; space: number; value: number; payoff: number }
  | { t: 'trade'; to: number; give: number[]; get: number[]; cash: number }
  | { t: 'bankrupt'; to: number };

export type GameEvent = { round: number; player: number } & EventBody;
