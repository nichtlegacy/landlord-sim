import { beforeAll, describe, expect, it } from 'vitest';
import { presetExample } from './model';
import { feedbackText, parseImport, reviewImport } from './AiImport';
import { setLang } from './i18n';

// the expected messages below are the German ones
beforeAll(() => setLang('de'));

describe('AI import', () => {
  const base = presetExample();
  it('reads the template format, by index or by street name', () => {
    const r = parseImport(`Hier ist der Stand:\n${JSON.stringify({
      current: 1, pot: 70,
      players: [{ name: 'A', cash: [1000, 1200], pos: 30 }, { name: 'B', cash: 2000, pos: 13, inJail: true, goojf: 1 }],
      properties: [{ space: 30, owner: 0, level: 6 }, { space: 'Lighthouse Point', owner: 1, mortgaged: true }, { space: 5, owner: 9 }],
    })}`, base);
    if (typeof r === 'string') throw new Error(r);
    expect(r.scenario.players[1]).toMatchObject({ cash: [2000, 2000], inJail: true, goojf: ['chance'] });
    expect(r.scenario.properties).toEqual([
      { space: 30, owner: 0, level: 6, depot: false, mortgaged: false },
      { space: 49, owner: 1, level: 0, depot: false, mortgaged: true },
    ]);
    expect(r.profiles).toHaveLength(2);
  });
  it('accepts an exported setup and rejects garbage', () => {
    expect(parseImport(JSON.stringify(base), base)).toEqual(base);
    expect(typeof parseImport('kein json', base)).toBe('string');
    expect(typeof parseImport('{"players":[{"name":"x"}]}', base)).toBe('string');
    expect(parseImport('{"players":[{},{}],"properties":[{"space":"Nirgendwo","owner":0}]}', base)).toBe('Unbekanntes Feld: Nirgendwo.');
  });
});

describe('import repair', () => {
  const base = presetExample();
  it('reads other spellings, reports every correction and what is still wrong', () => {
    const rv = reviewImport(JSON.stringify({
      current: 7,
      players: [
        { name: 'Ada', money: 1200, position: 30 },
        { name: 'Ben', cash: 2500, pos: 20, inJail: true, failedRolls: 1, getOutOfJailCards: 3 },
        { name: 'Ben', cash: 5000, pos: 30 },
      ],
      properties: [
        { field: 'clocktower-square', owner: 'Ada', buildings: 9 },
        { space: 'Lantern Street', owner: 0, level: 3 },
        { space: 5, owner: 1 },
        { space: 'Lantern Street', owner: 0, level: 3 },
      ],
    }), base);
    expect(rv.error).toBeUndefined();
    const sc = rv.setup!.scenario;
    expect(sc.players[0]).toMatchObject({ cash: [1200, 1200], pos: 30 });
    expect(sc.players[1]).toMatchObject({ pos: 13, jailTurns: 1, goojf: ['chance', 'community_chest'] });
    expect(sc.properties.map((p) => [p.space, p.owner, p.level])).toEqual([[27, 0, 3], [30, 0, 6]]);
    expect(sc.current).toBe(2);
    for (const bit of ['„money“', '„position“', 'Gefängnisfeld', '„failedRolls“', 'auf 2 begrenzt', 'Uhrturmplatz erkannt', 'Besitzer „Ada“', 'Stufe 9 auf 6', 'kein Grundstück', 'doppelt', 'Nächster Spieler 7'])
      expect(rv.fixes.join('\n')).toContain(bit);
    // duplicate names and Rot built 3/6/0/0 are left for the user or the assistant to decide
    expect(rv.problems.join('\n')).toContain('mehrfach');
    expect(feedbackText(rv)).toContain('- Problem: Der Name Ben kommt mehrfach vor.');
  });
  it('a clean answer has nothing to review', () => {
    const rv = reviewImport(JSON.stringify(base), base);
    expect([rv.fixes, rv.problems]).toEqual([[], []]);
  });
});

describe('import: agreements', () => {
  const base = presetExample();
  it('reads rent deals and jokers, with German group names', () => {
    const r = parseImport(JSON.stringify({
      players: [{ name: 'Ada' }, { name: 'Ben' }, { name: 'Cleo' }],
      agreements: [
        { kind: 'rent', payer: 2, owner: 1, scope: 'stations', maxAmount: 100 },
        { kind: 'rent', payer: 1, owner: 0, scope: 'Rot', percent: 50 },
        { kind: 'joker', payer: 1, owner: null, uses: 5, percent: 50 },
      ],
    }), base);
    if (typeof r === 'string') throw new Error(r);
    expect(r.scenario.agreements).toEqual([
      { kind: 'rent', payer: 2, owner: 1, scope: 'stations', maxAmount: 100, note: undefined },
      { kind: 'rent', payer: 1, owner: 0, scope: { group: 'red' }, percent: 50, note: undefined },
      { kind: 'joker', payer: 1, owner: null, uses: 5, percent: 50, note: undefined },
    ]);
    expect(parseImport(JSON.stringify({ players: [{}, {}], agreements: [{ kind: 'rent', payer: 0, owner: 1, scope: 'all' }] }), base))
      .toBe('Mietdeal braucht maxAmount oder percent.');
  });
});
