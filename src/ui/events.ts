// Engine events as text (replay log, CLI). The engine itself only emits data.
import { cardText, spaceName } from '../engine/edition';
import type { Edition, GameEvent } from '../engine/types';
import { i18n, type Lang } from './i18n';

export interface EventCtx { names: string[]; ed: Edition; lang?: Lang }

export function eventText(e: GameEvent, { names, ed, lang = 'en' }: EventCtx): string {
  const { t, money, pct } = i18n(lang);
  const m = (n: number) => money(ed, n);
  const sp = (i: number) => spaceName(ed, i, lang);
  const list = (spaces: number[]) => spaces.map(sp).join(', ');
  const dice = ([a, b]: [number, number]) => `${a}+${b}`;
  const sit = (on: boolean) => (on ? t('event.sitOut') : '');
  const reason = { buy: t('event.reasonBuy'), build: t('event.reasonBuild'), debt: t('event.reasonDebt') };
  switch (e.t) {
    case 'roll': return t('event.roll', { dice: dice(e.dice), face: e.face === null ? '' : `+${e.face === 'bonus' ? 'Bonus' : e.face === 'bus' ? 'Bus' : e.face}` });
    case 'triple': return t('event.triple', { a: e.dice[0], b: e.dice[1], c: e.face, to: sp(e.to) });
    case 'third_double': return t('event.third_double');
    case 'jail_card': return t('event.jail_card', { sit: sit(e.sitOut) });
    case 'jail_pay': return t('event.jail_pay', { amount: m(e.amount), sit: sit(e.sitOut) });
    case 'jail_miss': return t('event.jail_miss', { dice: dice(e.dice) });
    case 'jail_free_after_max': return t('event.jail_free_after_max', { dice: dice(e.dice) });
    case 'jail_doubles_free': return t('event.jail_doubles_free', { dice: dice(e.dice) });
    case 'jail_leave': return t('event.jail_leave', { dice: dice(e.dice) });
    case 'bail_for_rent': return e.card ? t('event.bail_card') : t('event.bail_pay', { amount: m(e.amount) });
    case 'go_to_jail': return t('event.go_to_jail');
    case 'bus_ride': return t('event.bus_ride', { to: sp(e.to) });
    case 'ticket_use': return t('event.ticket_use', { to: sp(e.to) });
    case 'ticket_take': return t('event.ticket_take');
    case 'bonus_move': return t('event.bonus_move', { to: sp(e.to) });
    case 'tax': return t('event.tax', { space: sp(e.space), amount: m(e.amount) });
    case 'pot': return t('event.pot', { amount: m(e.amount) });
    case 'card': return t('event.card', { text: cardText(ed, e.deck, e.card, lang) });
    case 'buy': return t('event.buy', { space: sp(e.space), amount: m(e.price) });
    case 'decline': return t(e.auction ? 'event.declineAuction' : 'event.declineBank', { space: sp(e.space) });
    case 'auction_won': return t('event.auction_won', { space: sp(e.space), amount: m(e.price) });
    case 'auction_none': return t('event.auction_none', { space: sp(e.space) });
    case 'auction_space':
      return e.blocked ? t('event.auctionBlocked') : e.space === null ? t('event.auctionSkip') : t('event.auctionStart', { space: sp(e.space) });
    case 'rent': return t('event.rent', { space: sp(e.space), amount: m(e.amount), owner: names[e.owner], deal: e.deal ? t('event.deal') : '' });
    case 'no_rent_jailed': return t('event.no_rent_jailed', { space: sp(e.space), owner: names[e.owner] });
    case 'joker': return t('event.joker', { p: pct(e.percent / 100, 0), left: e.left });
    case 'build': return e.depot ? t('event.buildDepot', { space: sp(e.space) })
      : t('event.build', { space: sp(e.space), single: e.single ? t('event.single') : '', level: e.level });
    case 'unmortgage': return t('event.unmortgage', { space: sp(e.space) });
    case 'mortgage': return t('event.mortgage', { space: sp(e.space), reason: reason[e.reason] });
    case 'sell': return t(e.depot ? 'event.sellDepot' : 'event.sell', { space: sp(e.space), reason: reason[e.reason] });
    case 'bank_return':
      return t('event.bank_return', { space: sp(e.space), amount: m(e.value), payoff: e.payoff ? t('event.payoff', { amount: m(e.payoff) }) : '' });
    case 'trade': {
      const cash = e.cash > 0 ? t('event.tradeCash', { amount: m(e.cash), name: names[e.player] })
        : e.cash < 0 ? t('event.tradeCash', { amount: m(-e.cash), name: names[e.to] }) : '';
      const parts = [e.get.length && t('event.tradeGet', { list: list(e.get) }), e.give.length && t('event.tradeGive', { list: list(e.give) }), cash];
      return t('event.trade', { to: names[e.to], parts: parts.filter(Boolean).join(', ') });
    }
    case 'bankrupt': return t('event.bankrupt', { to: e.to >= 0 ? t('event.bankruptTo', { name: names[e.to] }) : '' });
  }
}
