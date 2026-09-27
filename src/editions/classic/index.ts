// Classic board: 40 spaces, $1,500 start money, no speed die. Data in data/classic/.
// Also anchors the movement validation against Truman Collins' published long-run tables.
import board from '../../../data/classic/board.json';
import cards from '../../../data/classic/cards.json';
import { assertEdition, loadEdition } from '../../engine/edition';
import type { Edition, RuleConfig } from '../../engine/types';

export const classic: Edition = assertEdition(loadEdition(board, cards, { id: 'classic', maxLevel: 5 }));

export const classicRules: RuleConfig = {
  goSalary: 200,
  goLandTotal: null,
  speedDie: null,
  triplesAnySpace: false,
  build: {
    requirement: 'full_group',
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
  unimprovedMultiplier: { allButOne: 1, all: 2 },
  mortgageInterest: 0.1,
  roundCap: 500,
};
