import { expect, test } from 'vitest';
import { applyTrade } from './edit';
import { presetNewGame, type Setup } from './model';

// classic board: 1 Tannery Lane, 3 Brickworks Road (brown, mortgage 30), 5 Old Town Station, 6 Weavers Lane
const base = (): Setup => {
  const s = presetNewGame('classic', ['A', 'B']);
  s.scenario.players[0].cash = [100, 300];
  s.scenario.players[1].cash = [500, 500];
  s.scenario.properties = [
    { space: 1, owner: 0 },
    { space: 3, owner: 1, mortgaged: true },
    { space: 5, owner: 1 },
    { space: 6, owner: 0, level: 1 },
  ];
  return s;
};
const owner = (s: Setup, space: number) => s.scenario.properties.find((p) => p.space === space)?.owner;

test('moves owners and shifts cash ranges, receiver pays mortgage interest', () => {
  const t = applyTrade(base(), 0, 1, [1], [3], 50);
  expect(owner(t, 1)).toBe(1);
  expect(owner(t, 3)).toBe(0);
  expect(t.scenario.players[0].cash).toEqual([100 - 50 - 3, 300 - 50 - 3]);
  expect(t.scenario.players[1].cash).toEqual([550, 550]);
});

test('negative cash: b pays a', () => {
  const t = applyTrade(base(), 0, 1, [], [5], -20);
  expect(owner(t, 5)).toBe(0);
  expect(t.scenario.players[0].cash).toEqual([120, 320]);
  expect(t.scenario.players[1].cash).toEqual([480, 480]);
});

test('rejects built groups, foreign property and overdrawn cash', () => {
  expect(() => applyTrade(base(), 0, 1, [6], [], 0)).toThrow(/cannot be traded/);
  expect(() => applyTrade(base(), 0, 1, [5], [], 0)).toThrow(/does not belong/);
  expect(() => applyTrade(base(), 0, 1, [1], [], 101)).toThrow(/not have enough cash/);
  expect(() => applyTrade(base(), 0, 1, [], [], 10)).toThrow();
});
