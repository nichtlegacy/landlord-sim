// Grand board: 52 spaces, speed die, bus tickets, skyscrapers and depots. Data in data/grand/.
import board from '../../../data/grand/board.json';
import cards from '../../../data/grand/cards.json';
import { assertEdition, loadEdition } from '../../engine/edition';
import type { Edition, RuleConfig } from '../../engine/types';

export const grand: Edition = assertEdition(
  loadEdition(board, cards, { id: 'grand', maxLevel: 6 }),
);

/** Standard rules for the grand board. */
export const grandRules: RuleConfig = {
  goSalary: 200,
  goLandTotal: null,
  speedDie: {
    faces: [1, 2, 3, 'bonus', 'bonus', 'bus'],
    bonusMove: 'official',
    bus: { withTickets: 'ticket_or_ride', whenEmpty: 'ride', decideBeforeResolve: false },
  },
  triplesAnySpace: true,
  build: {
    requirement: 'all_but_one',
    skyscraperNeedsFullGroup: true,
    timing: 'any_turn',
    maxUnitsPerAction: null,
    singleSiteOnLanding: false,
    singleSiteMaxLevel: 4,
  },
  jail: { fine: 50, maxRollAttempts: 3, afterMaxAttempts: 'pay_and_move', onDoubles: 'move', rentWhileJailed: true, payThenRoll: true, bailForRent: false },
  freeParkingPot: false,
  unlimitedSupply: false,
  bankReturn: null,
  buying: true,
  building: true,
  bankruptcyToBank: false,
  auctionOnDecline: true,
  auctionSpaceOptional: false,
  busSquareWhenEmpty: 'nothing',
  trading: true,
  doublesAgain: true,
  unimprovedMultiplier: { allButOne: 2, all: 3 },
  mortgageInterest: 0.1,
  roundCap: 500,
};
