import { describe, expect, it } from 'vitest';
import { classic } from '../../editions/classic';
import { grand } from '../../editions/grand';
import { PROFILES } from '../../engine/policy';
import type { EventBody, GameEvent } from '../../engine/types';
import { HOUSE_RULES } from '../../house-rules';
import { TOKENS } from '../art';
import { eventText } from '../events';
import { DICTS, i18n, LANGS } from '.';

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionaries', () => {
  const { en, de } = DICTS;
  it('have the same keys, no empty texts and the same placeholders', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const lang of LANGS) for (const [k, v] of Object.entries(DICTS[lang])) expect(v.trim(), `${lang} ${k}`).not.toBe('');
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(vars(de[k]), k).toEqual(vars(en[k]));
  });
  it('name every house rule, profile, colour group and token', () => {
    const keys = [
      ...HOUSE_RULES.flatMap((h) => ['label', 'ours', 'official'].map((p) => `houseRules.${h.id}.${p}`)),
      ...Object.keys(PROFILES).map((id) => `profile.${id}`),
      ...[...Object.keys(classic.groups), ...Object.keys(grand.groups)].map((g) => `group.${g}`),
      ...TOKENS.map((t) => `token.${t.id}`),
    ];
    for (const k of keys) expect(Object.hasOwn(en, k), k).toBe(true);
  });
  it('format money with the edition currency in front', () => {
    expect(i18n('en').money(classic, 1500)).toBe(`${classic.currency}1,500`);
    expect(i18n('de').money(classic, 1500)).toBe(`${classic.locales?.de?.currency ?? classic.currency}1.500`);
    expect(i18n('en').tp('app.houseRules', 1)).toBe('1 house rule');
    expect(i18n('de').tp('app.houseRules', 3)).toBe('3 Hausregeln');
  });
});

describe('event texts', () => {
  // one example of every event type; a new type in EventBody fails to compile here
  const one: { [K in EventBody['t']]: Extract<EventBody, { t: K }> } = {
    roll: { t: 'roll', dice: [3, 4], face: 'bonus' },
    triple: { t: 'triple', dice: [2, 2], face: 2, to: 5 },
    third_double: { t: 'third_double' },
    jail_card: { t: 'jail_card', sitOut: true },
    jail_pay: { t: 'jail_pay', amount: 50, sitOut: false },
    jail_miss: { t: 'jail_miss', dice: [1, 2] },
    jail_free_after_max: { t: 'jail_free_after_max', dice: [1, 2] },
    jail_doubles_free: { t: 'jail_doubles_free', dice: [4, 4] },
    jail_leave: { t: 'jail_leave', dice: [5, 5] },
    bail_for_rent: { t: 'bail_for_rent', card: false, amount: 50 },
    go_to_jail: { t: 'go_to_jail' },
    bus_ride: { t: 'bus_ride', to: 7 },
    ticket_use: { t: 'ticket_use', to: 9 },
    ticket_take: { t: 'ticket_take' },
    bonus_move: { t: 'bonus_move', to: 11 },
    tax: { t: 'tax', space: 4, amount: 200 },
    pot: { t: 'pot', amount: 350 },
    card: { t: 'card', deck: 'chance', card: 0 },
    buy: { t: 'buy', space: 1, price: 60 },
    decline: { t: 'decline', space: 1, auction: true },
    auction_won: { t: 'auction_won', space: 3, price: 40 },
    auction_none: { t: 'auction_none', space: 3 },
    auction_space: { t: 'auction_space', space: 6, blocked: false },
    rent: { t: 'rent', space: 1, owner: 1, amount: 10, deal: true },
    no_rent_jailed: { t: 'no_rent_jailed', space: 1, owner: 1 },
    joker: { t: 'joker', percent: 50, left: 2 },
    build: { t: 'build', space: 1, level: 3, depot: false, single: true },
    unmortgage: { t: 'unmortgage', space: 1 },
    mortgage: { t: 'mortgage', space: 1, reason: 'debt' },
    sell: { t: 'sell', space: 1, reason: 'build', depot: false },
    bank_return: { t: 'bank_return', space: 1, value: 45, payoff: 33 },
    trade: { t: 'trade', to: 1, give: [1], get: [3], cash: -20 },
    bankrupt: { t: 'bankrupt', to: 1 },
  };
  it('renders every event type in both languages', () => {
    for (const lang of LANGS) for (const body of Object.values(one)) {
      const text = eventText({ round: 1, player: 0, ...body } as GameEvent, { names: ['Ada', 'Ben'], ed: grand, lang });
      expect(text, `${lang} ${body.t}`).not.toMatch(/undefined|NaN|\[object|\{\w+\}/);
      expect(text.length).toBeGreaterThan(2);
    }
  });
});
