// Schema check for edition data: shipped editions pass, broken copies are caught.
import { describe, expect, it } from 'vitest';
import { classic } from '../editions/classic';
import { grand } from '../editions/grand';
import { assertEdition, validateEdition } from './edition';
import type { Edition } from './types';

const broken = (ed: Edition, edit: (e: Edition) => void) => {
  const e = structuredClone(ed);
  edit(e);
  return validateEdition(e).join('\n');
};

describe('validateEdition', () => {
  it.each([grand, classic])('$id is valid', (ed) => {
    expect(validateEdition(ed)).toEqual([]);
  });

  it('catches a wrong space index', () => {
    expect(broken(classic, (e) => { e.spaces[5].index = 99; })).toContain('position 5 has index 99');
  });

  it('catches a street missing from its group', () => {
    expect(broken(classic, (e) => { e.groups.brown = [3]; })).toContain('space 1 (Tannery Lane): missing from group brown');
  });

  it('catches a short rent array', () => {
    expect(broken(grand, (e) => { e.spaces[1].rent!.pop(); })).toMatch(/space 1 .*rent has 6 entries, needs 7/);
  });

  it('catches two get out of jail free cards in one deck', () => {
    expect(broken(classic, (e) => { e.decks.chance.push({ ...e.decks.chance[8] }); })).toContain('chance: more than one get_out_of_jail_free');
  });

  it('catches a move_to target off the board', () => {
    expect(broken(classic, (e) => { e.decks.chance[0].effect = { type: 'move_to', target: 40 }; })).toContain('move_to target 40 out of range');
  });

  it('catches a wrong side length', () => {
    expect(broken(classic, (e) => { e.sideLength = 12; })).toContain('sideLength 12 needs 44');
  });

  it('loads German names and card texts', () => {
    expect(grand.locales?.de?.name).toBe('Groß');
    expect(Object.keys(classic.locales!.de.spaces!)).toHaveLength(40);
    expect(grand.locales?.de?.cards?.bus).toHaveLength(grand.decks.bus.length);
  });

  it('catches locale entries that do not fit the board', () => {
    expect(broken(classic, (e) => { e.locales!.de.spaces![40] = 'Nirgendwo'; })).toContain('locale de: space 40 does not exist');
    expect(broken(grand, (e) => { e.locales!.de.cards!.chance!.pop(); })).toContain('locale de: 15 chance texts for 16 cards');
  });

  it('assertEdition lists every problem', () => {
    const e = structuredClone(classic);
    e.jailIndex = 11;
    e.supply.houses = -1;
    expect(() => assertEdition(e)).toThrow(/jailIndex 11[\s\S]*supply\.houses -1/);
  });
});
