import { describe, expect, it } from 'vitest';
import { presetNewGame, presetExample, setupKey, type Setup } from './model';
import { decodeSetup, encodeSetup, parseSetup } from './share';

const withScenario = (s: Setup, patch: object) => ({ ...s, scenario: { ...s.scenario, ...patch } });

describe('share links', () => {
  it('round-trips presets unchanged, key order included', async () => {
    for (const s of [presetExample(), presetNewGame('classic')]) {
      const back = await decodeSetup(await encodeSetup(s));
      expect(back).toEqual(s);
      expect(setupKey(back)).toBe(setupKey(s));
    }
  });

  it('rejects oversized and broken params', async () => {
    await expect(decodeSetup('A'.repeat(70_000))).rejects.toThrow(/too long/);
    await expect(decodeSetup('not+base64!')).rejects.toThrow(/damaged/);
    await expect(decodeSetup('AAAA')).rejects.toThrow();
  });

  it('stops inflating past 512 KB', async () => {
    const big = new Blob([JSON.stringify({ x: 'x'.repeat(600_000) })]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const param = Buffer.from(await new Response(big).arrayBuffer()).toString('base64url');
    expect(param.length).toBeLessThan(64 * 1024);
    await expect(decodeSetup(param)).rejects.toThrow(/too large/);
  });
});

describe('parseSetup', () => {
  const base = presetExample();
  const bad = (x: unknown, msg: RegExp) => expect(() => parseSetup(x)).toThrow(msg);

  it('rejects invalid setups', () => {
    bad({ ...base, editionId: 'monaco' }, /edition/);
    bad({ ...base, editionId: 'constructor' }, /edition/);
    bad(withScenario(base, { players: base.scenario.players.slice(0, 1) }), /2 to 6/);
    bad(withScenario(base, { properties: [{ space: 1, owner: 3 }] }), /Owner/);
    bad(withScenario(base, { properties: [{ space: 6, owner: 0, level: 1 }] }), /only exist on streets/);
    bad(withScenario(base, { properties: [{ space: 1, owner: 0, level: 7 }] }), /Level/);
    bad(withScenario(base, { properties: [{ space: 1, owner: 0 }, { space: 1, owner: 1 }] }), /twice/);
    bad(withScenario(base, { properties: [{ space: 0, owner: 0 }] }), /not a property/);
    bad({ ...base, houseRules: ['H99'] }, /house rule/);
    bad({ ...base, profiles: ['balanced', 'toString', 'balanced'] }, /play style/);
    bad({ ...base, profiles: ['balanced'] }, /play styles/);
    bad({ ...base, games: 50 }, /games/);
    bad(withScenario(base, { agreements: [{ kind: 'rent', payer: 0, owner: 1, scope: { group: 'purple' } }] }), /scope/);
    bad(withScenario(base, { agreements: [{ kind: 'joker', payer: 0, owner: null, uses: 0, percent: 50 }] }), /Count/);
  });

  it('accepts new boolean switches and swaps a reversed cash range', () => {
    const s = parseSetup({ ...withScenario(base, { players: [{ ...base.scenario.players[0], cash: [900, 100] }, ...base.scenario.players.slice(1)] }),
      continuation: { buy: true, build: false, trade: true }, rotateStart: true });
    expect(s.scenario.players[0].cash).toEqual([100, 900]);
    expect(s.continuation).toEqual({ buy: true, build: false, trade: true });
    expect((s as { rotateStart?: boolean }).rotateStart).toBe(true);
  });

  it('does not leak __proto__', () => {
    const text = JSON.stringify(base)
      .replace(/^\{/, '{"__proto__":{"polluted":1},')
      .replace('"scenario":{', '"scenario":{"__proto__":{"polluted":2},');
    const s = parseSetup(JSON.parse(text)) as unknown as Record<string, unknown>;
    expect(Object.getPrototypeOf(s)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(s.scenario)).toBe(Object.prototype);
    expect(s.polluted).toBeUndefined();
    expect((s.scenario as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
