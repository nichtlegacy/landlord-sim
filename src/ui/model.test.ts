import { expect, test } from 'vitest';
import { tokenOf } from './model';
test('default tokens avoid explicit picks', () => {
  const sc = (tokens: (string | undefined)[]) => ({ scenario: { players: tokens.map((token) => ({ token })) } }) as any;
  const s = sc(['hat', undefined, undefined, 'car']);
  const all = [0, 1, 2, 3].map((i) => tokenOf(s, i));
  expect(all).toEqual(['hat', 'boat', 'cat', 'car']);
  expect(new Set(all).size).toBe(4);
});
