// Deals between players: rent caps / discounts on some of an owner's property, and jokers.
import { useState } from 'react';
import type { Agreement, AgreementScope, Edition } from '../engine/types';
import { setAgreements } from './edit';
import { Icon } from './icons';
import { spaceName } from '../engine/edition';
import { groupName, i18n, useI18n, type I18n } from './i18n';
import { EDITIONS, playerColor, type Setup } from './model';

function scopeText(scope: AgreementScope, ed: Edition, { t, lang }: I18n) {
  if (scope === 'all') return t('deal.scopeAll');
  if (scope === 'stations') return t('deal.scopeStations');
  if (scope === 'utilities') return t('deal.scopeUtilities');
  if ('group' in scope) return t('deal.scopeGroup', { group: groupName(t, scope.group) });
  return scope.spaces.map((i) => (ed.spaces[i] ? spaceName(ed, i, lang) : i)).join(', ');
}

/** one line per agreement, in the given (default: current) UI language */
export function agreementText(a: Agreement, names: string[], ed: Edition, tr: I18n = i18n()) {
  const { t, money, pct } = tr;
  if (a.kind === 'joker') {
    const at = a.owner === null ? t('deal.atAll') : t('deal.at', { name: names[a.owner] });
    return t('deal.textJoker', { payer: names[a.payer], uses: a.uses, effect: a.percent === 100 ? t('deal.payNothing') : `−${pct(a.percent / 100, 0)}`, at });
  }
  const what = [a.maxAmount !== undefined ? t('deal.max', { amount: money(ed, a.maxAmount) }) : '', a.percent !== undefined ? t('deal.percent', { p: pct(a.percent / 100, 0) }) : ''].filter(Boolean).join(', ');
  return t('deal.textRent', { payer: names[a.payer], owner: names[a.owner], scope: scopeText(a.scope, ed, tr), what });
}

type Kind = 'rent' | 'joker';
type ScopeKey = 'all' | 'stations' | 'utilities' | `group:${string}`;

export function AgreementsCard({ setup, onChange }: { setup: Setup; onChange: (s: Setup) => void }) {
  const ed = EDITIONS[setup.editionId].edition;
  const names = setup.scenario.players.map((p) => p.name);
  const list = setup.scenario.agreements ?? [];
  const tr = useI18n();
  const { t, money, currency } = tr;
  const [kind, setKind] = useState<Kind>('rent');
  const [payer, setPayer] = useState(Math.min(2, names.length - 1));
  const [owner, setOwner] = useState(Math.min(1, names.length - 1));
  const [scope, setScope] = useState<ScopeKey>('stations');
  const [mode, setMode] = useState<'max' | 'percent'>('max');
  const [value, setValue] = useState(100);
  const [uses, setUses] = useState(5);
  const [jokerPct, setJokerPct] = useState(50);
  const [jokerOwner, setJokerOwner] = useState<number | null>(null);

  const add = () => {
    let a: Agreement;
    if (kind === 'joker') {
      a = { kind: 'joker', payer, owner: jokerOwner, uses: Math.max(1, uses), percent: jokerPct };
    } else {
      const sc: AgreementScope = scope.startsWith('group:') ? { group: scope.slice(6) } : (scope as 'all' | 'stations' | 'utilities');
      a = mode === 'max'
        ? { kind: 'rent', payer, owner, scope: sc, maxAmount: Math.max(0, value) }
        : { kind: 'rent', payer, owner, scope: sc, percent: Math.min(100, Math.max(0, value)) };
    }
    onChange(setAgreements(setup, [...list, a]));
  };
  const remove = (k: number) => onChange(setAgreements(setup, list.filter((_, j) => j !== k)));
  const playerSelect = (v: number, set: (n: number) => void, label: string, exclude?: number) => (
    <select className="select select-sm" aria-label={label} value={v} onChange={(e) => set(Number(e.target.value))}>
      {names.map((n, i) => i !== exclude && <option key={i} value={i}>{n}</option>)}
    </select>
  );
  const invalid = kind === 'rent' ? payer === owner : jokerOwner === payer;

  return (
    <section className="card section">
      <div className="card-head">
        <div>
          <h2 className="h16">{t('deal.title')}</h2>
          <p className="caption">{t('deal.intro')}</p>
        </div>
      </div>

      {list.length ? (
        <ul className="deal-list">
          {list.map((a, k) => (
            <li key={k}>
              <span className="swatch" style={{ background: playerColor(a.payer), borderRadius: 5 }} aria-hidden />
              <span>{agreementText(a, names, ed, tr)}</span>
              <button className="btn btn-ghost btn-sm btn-icon" aria-label={t('deal.remove')} onClick={() => remove(k)}><Icon name="close" size={14} /></button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="caption">{t('deal.none', { amount: money(ed, 100) })}</p>
      )}

      <details className="disclosure">
        <summary>{t('deal.add')}</summary>
        <div className="deal-form">
          <div className="segmented" role="group" aria-label={t('deal.kind')}>
            <button aria-pressed={kind === 'rent'} onClick={() => setKind('rent')}>{t('deal.rentDeal')}</button>
            <button aria-pressed={kind === 'joker'} onClick={() => setKind('joker')}>{t('deal.joker')}</button>
          </div>
          {kind === 'rent' ? (
            <p className="deal-sentence">
              {playerSelect(payer, setPayer, t('deal.payer'))} {t('deal.formPays')} {playerSelect(owner, setOwner, t('deal.owner'), payer)} {t('deal.formOn')}
              <select className="select select-sm" aria-label={t('deal.scope')} value={scope} onChange={(e) => setScope(e.target.value as ScopeKey)}>
                <option value="all">{t('deal.scopeAll')}</option>
                <option value="stations">{t('deal.scopeStations')}</option>
                <option value="utilities">{t('deal.scopeUtilities')}</option>
                {Object.keys(ed.groups).map((g) => <option key={g} value={`group:${g}`}>{groupName(t, g)}</option>)}
              </select>
              <select className="select select-sm" aria-label={t('deal.limit')} value={mode} onChange={(e) => setMode(e.target.value as 'max' | 'percent')}>
                <option value="max">{t('deal.optMax', { cur: currency(ed) })}</option>
                <option value="percent">{t('deal.optPercent')}</option>
              </select>
              <input className="input input-xs" type="number" min={0} value={value} aria-label={mode === 'max' ? t('deal.maxAmount') : t('deal.percentLabel')} onChange={(e) => setValue(Number(e.target.value))} />
              {mode === 'percent' ? '%' : ''}
            </p>
          ) : (
            <p className="deal-sentence">
              {playerSelect(payer, setPayer, t('deal.player'))} {t('deal.formHas')}
              <input className="input input-xs" type="number" min={1} max={50} value={uses} aria-label={t('deal.uses')} onChange={(e) => setUses(Number(e.target.value))} />
              {t('deal.formJokers')}
              <select className="select select-sm" aria-label={t('deal.effect')} value={jokerPct} onChange={(e) => setJokerPct(Number(e.target.value))}>
                <option value={50}>−{tr.pct(0.5, 0)}</option>
                <option value={100}>{t('deal.payNothing')}</option>
              </select>
              {t('deal.formWith')}
              <select className="select select-sm" aria-label={t('deal.counterpart')} value={jokerOwner ?? ''} onChange={(e) => setJokerOwner(e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">{t('deal.formEveryone')}</option>
                {names.map((n, i) => i !== payer && <option key={i} value={i}>{n}</option>)}
              </select>
            </p>
          )}
          <div className="button-row">
            <button className="btn btn-sm btn-primary" onClick={add} disabled={invalid}>{t('common.add')}</button>
            {kind === 'joker' && <span className="caption">{t('deal.botNote', { amount: money(ed, 400) })}</span>}
          </div>
        </div>
      </details>
    </section>
  );
}
