import { describe, expect, it } from 'vitest';
import { fuzz } from './fuzz';

describe('fuzzing with random legal bots', () => {
  it('random editions, rules, positions and bots never break a rule invariant', () => {
    const r = fuzz(1500, 7);
    expect(r.violations).toEqual([]);
    expect(r.games).toBe(1500);
    expect(r.trades).toBeGreaterThan(1000);
  });
});
