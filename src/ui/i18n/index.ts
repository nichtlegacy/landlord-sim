// UI language: English (default) or German. One module-level language, so plain functions
// (validation, warnings, event texts) and components read the same; useI18n re-renders on change.
import { useSyncExternalStore } from 'react';
import { editionCurrency } from '../../engine/edition';
import type { Edition } from '../../engine/types';
import { de } from './de';
import { en, type Dict, type Key } from './en';

export type Lang = 'en' | 'de';
export type { Key };
export const LANGS: Lang[] = ['en', 'de'];
export const DICTS: Record<Lang, Dict> = { en, de };
const KEY = 'landlord:lang';

/** keys with .one / .other variants, without the suffix */
export type PluralKey = { [K in Key]: K extends `${infer B}.one` ? B : never }[Key];
type Vars = Record<string, string | number>;

export interface I18n {
  lang: Lang;
  t: (key: Key, vars?: Vars) => string;
  /** plural: picks key.one / key.other by n; {n} is filled with the formatted n */
  tp: (key: PluralKey, n: number, vars?: Vars) => string;
  num: (n: number, digits?: number) => string;
  pct: (x: number, digits?: number) => string;
  /** amount in the edition's currency, symbol in front: $1,500 / $1.500 */
  money: (ed: Edition, n: number) => string;
  currency: (ed: Edition) => string;
}

const made = new Map<Lang, I18n>();

export function i18n(lang: Lang = current): I18n {
  let x = made.get(lang);
  if (x) return x;
  const dict = DICTS[lang], locale = lang === 'de' ? 'de-DE' : 'en-US';
  const nf = new Map<string, Intl.NumberFormat>();
  const fmt = (key: string, opts: Intl.NumberFormatOptions) => {
    if (!nf.has(key)) nf.set(key, new Intl.NumberFormat(locale, opts));
    return nf.get(key)!;
  };
  const plural = new Intl.PluralRules(locale);
  const t = (key: Key, vars?: Vars) => {
    const s = dict[key] ?? en[key] ?? key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
  };
  const num = (n: number, digits?: number) =>
    digits === undefined ? fmt('n', {}).format(n) : fmt(`n${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  x = {
    lang, t, num,
    tp: (key, n, vars) => t(`${key}.${plural.select(n) === 'one' ? 'one' : 'other'}` as Key, { n: num(n), ...vars }),
    pct: (v, digits = 1) => fmt(`p${digits}`, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v),
    money: (ed, n) => `${editionCurrency(ed, lang)}${num(Math.round(n))}`,
    currency: (ed) => editionCurrency(ed, lang),
  };
  made.set(lang, x);
  return x;
}

/** index.html already picked the language before the first paint (saved choice, else the browser's) */
let current: Lang = typeof document !== 'undefined' && document.documentElement.lang === 'de' ? 'de' : 'en';
const listeners = new Set<() => void>();
if (typeof document !== 'undefined') document.title = i18n(current).t('app.title');

export const getLang = () => current;

export function setLang(lang: Lang) {
  current = lang;
  try { localStorage.setItem(KEY, lang); } catch { /* private mode */ }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.title = i18n(lang).t('app.title');
  }
  listeners.forEach((f) => f());
}

const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

export function useI18n(): I18n & { setLang: (l: Lang) => void } {
  const lang = useSyncExternalStore(subscribe, getLang, getLang);
  return { ...i18n(lang), setLang };
}

// ------------------------------------------------------------------ names looked up by id

type T = I18n['t'];
const isKey = (k: string): k is Key => Object.hasOwn(en, k);
/** translated text for a dynamic key, or the fallback when the dictionary has none */
const byId = (t: T, key: string, fallback: string) => (isKey(key) ? t(key) : fallback);

export const profileName = (t: T, id: string, fallback = id) => byId(t, `profile.${id}`, fallback);
export const groupName = (t: T, g: string) => byId(t, `group.${g}`, g);
export const levelName = (t: T, level: number) => byId(t, `level.${level}`, String(level));
export const tokenName = (t: T, id: string) => byId(t, `token.${id}`, id);
export const ruleText = (t: T, id: string, part: 'label' | 'ours' | 'official') => byId(t, `houseRules.${id}.${part}`, id);
/** built-in scenarios by id; anything else keeps its own label */
export const scenarioLabel = (t: T, sc: { id: string; label: string }) =>
  sc.id === 'new' ? t('scenario.new') : sc.id === 'import' ? t('scenario.import') : sc.id === 'example-endgame' ? t('scenario.example') : sc.label;
