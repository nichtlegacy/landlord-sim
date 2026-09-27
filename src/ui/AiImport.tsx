// Capture a position with an AI assistant: copy a prompt + JSON template, paste the answer back.
import { useRef, useState } from 'react';
import type { Scenario, ScenarioPlayer, ScenarioProperty } from '../engine/state';
import type { Agreement, AgreementScope, Edition } from '../engine/types';
import { previewGame, warnings } from './edit';
import { Icon } from './icons';
import { editionName, spaceName } from '../engine/edition';
import { DICTS, i18n, levelName, LANGS, useI18n } from './i18n';
import { EDITIONS, type Setup } from './model';
import { parseSetup } from './share';

function template(setup: Setup) {
  const ed = EDITIONS[setup.editionId].edition;
  const { t, lang, money } = i18n();
  const props = ed.spaces.filter((s) => s.type === 'street' || s.type === 'station' || s.type === 'utility');
  const example = {
    current: 0,
    pot: 0,
    busTicketsLeft: ed.decks.bus.length ? 16 : null,
    players: setup.scenario.players.map((p) => ({ name: p.name, cash: [p.cash[0], p.cash[1]], pos: p.pos, inJail: !!p.inJail, jailTurns: p.jailTurns ?? 0, goojf: p.goojf?.length ?? 0, busTickets: p.busTickets ?? 0 })),
    properties: [{ space: props[0].index, owner: 0, level: 0, depot: false, mortgaged: false }],
    agreements: [
      { kind: 'rent', payer: 2, owner: 1, scope: 'stations', maxAmount: 100, note: t('ai.exampleRent', { amount: money(ed, 100) }) },
      { kind: 'joker', payer: 1, owner: null, uses: 5, percent: 50, note: t('ai.exampleJoker') },
    ],
  };
  return t('ai.prompt', {
    edition: editionName(ed, lang), n: ed.spaces.length, json: JSON.stringify(example, null, 2),
    levels: Array.from({ length: ed.maxLevel + 1 }, (_, i) => `${i} = ${levelName(t, i)}`).join(', '),
    groups: Object.keys(ed.groups).join('" | "'),
    spaces: props.map((s) => `${s.index}: ${spaceName(ed, s.index, lang)}`).join('\n'),
  });
}

type Loose = Omit<Partial<Scenario>, 'players' | 'properties'> & { players?: (Partial<ScenarioPlayer> & { goojf?: unknown })[]; properties?: (Partial<Omit<ScenarioProperty, 'space'>> & { space?: number | string })[] };

const slug = (x: string) => x.toLowerCase().replace(/&/g, 'and').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** a space's names in every UI language (the edition's own English one first) */
const namesOf = (ed: Edition, i: number) => [...new Set(LANGS.map((l) => spaceName(ed, i, l)))];

/** field id of another app ("old-kent-road", "pentonville-road") to our index */
function spaceById(ed: Edition, id: string): number | undefined {
  const t = slug(id);
  const exact = ed.spaces.find((s) => namesOf(ed, s.index).some((n) => slug(n) === t));
  if (exact) return exact.index;
  return ed.spaces.find((s) => namesOf(ed, s.index).some((n) => t.startsWith(slug(n)) || slug(n).startsWith(t)))?.index;
}

function parseScope(raw: unknown, ed: Edition): AgreementScope | { error: string } {
  if (raw === 'all' || raw === 'stations' || raw === 'utilities') return raw;
  // colour groups by id or by their name in any UI language ("red", "Rot")
  const byLabel = Object.fromEntries(Object.keys(ed.groups).flatMap((g) => LANGS.map((l) => [(DICTS[l][`group.${g}` as keyof typeof DICTS.en] ?? g).toLowerCase(), g])));
  const { t } = i18n();
  if (typeof raw === 'string') {
    const g = ed.groups[raw] ? raw : byLabel[raw.toLowerCase()];
    return g ? { group: g } : { error: t('ai.scopeUnknown', { raw }) };
  }
  const o = raw as { group?: string; spaces?: (number | string)[] } | null;
  if (o?.group) return parseScope(o.group, ed);
  if (Array.isArray(o?.spaces)) {
    const spaces = o.spaces.map((x) => (typeof x === 'number' ? x : spaceById(ed, x)));
    if (spaces.some((x) => x === undefined || !ed.spaces[x])) return { error: t('ai.dealSpace') };
    return { spaces: spaces as number[] };
  }
  return { error: t('ai.dealScope') };
}

function parseAgreements(raw: unknown, players: number, ed: Edition): Agreement[] | string {
  const { t } = i18n();
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return t('ai.dealList');
  const out: Agreement[] = [];
  for (const a of raw as Record<string, unknown>[]) {
    const payer = Number(a.payer);
    if (!(payer >= 0 && payer < players)) return t('ai.dealPayer');
    const note = typeof a.note === 'string' ? a.note : undefined;
    if (a.kind === 'joker') {
      const owner = a.owner === null || a.owner === undefined ? null : Number(a.owner);
      if (owner !== null && !(owner >= 0 && owner < players)) return t('ai.jokerOwner');
      out.push({ kind: 'joker', payer, owner, uses: Math.max(1, Number(a.uses ?? 1)), percent: Math.min(100, Math.max(1, Number(a.percent ?? 50))), note });
    } else {
      const owner = Number(a.owner);
      if (!(owner >= 0 && owner < players) || owner === payer) return t('ai.dealOwner');
      const scope = parseScope(a.scope ?? 'all', ed);
      if (typeof scope === 'object' && 'error' in scope) return scope.error;
      const deal: Agreement = { kind: 'rent', payer, owner, scope, note };
      if (a.maxAmount !== undefined) deal.maxAmount = Math.max(0, Number(a.maxAmount));
      if (a.percent !== undefined) deal.percent = Math.min(100, Math.max(0, Number(a.percent)));
      if (deal.maxAmount === undefined && deal.percent === undefined) return t('ai.dealNeeds');
      out.push(deal);
    }
  }
  return out;
}

/** first of several spellings an assistant might use; renamed keys are reported in fixes */
function pick(o: Record<string, unknown>, keys: string[], fixes: string[], what: string): unknown {
  for (const k of keys) {
    if (o[k] === undefined) continue;
    if (k !== keys[0]) fixes.push(i18n().t('ai.renamed', { what, from: k, to: keys[0] }));
    return o[k];
  }
  return undefined;
}

/**
 * accepts the template format, a full exported Setup or a Scenario.
 * Everything that had to be guessed or corrected on the way is appended to fixes.
 */
export function parseImport(text: string, setup: Setup, fixes: string[] = []): Setup | string {
  const { t, lang } = i18n();
  let raw: unknown;
  try {
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    raw = JSON.parse(json);
  } catch {
    return t('ai.noJson');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.scenario && obj.editionId) {
    try { return parseSetup(obj); } catch (e) { return e instanceof Error ? e.message : String(e); }
  }
  const sc = obj as Loose;
  const ed = EDITIONS[setup.editionId].edition;
  const nm = (i: number) => spaceName(ed, i, lang);
  if (!Array.isArray(sc.players) || sc.players.length < 2) return t('ai.twoPlayers');
  const players: ScenarioPlayer[] = sc.players.map((raw, i) => {
    const p = raw as Record<string, unknown>;
    const name = String(p.name ?? t('player.default', { n: i + 1 }));
    const rawCash = pick(p, ['cash', 'money'], fixes, name);
    const cash = Array.isArray(rawCash) ? rawCash : [Number(rawCash ?? ed.startMoney), Number(rawCash ?? ed.startMoney)];
    const rawGoojf = pick(p, ['goojf', 'getOutOfJailCards'], fixes, name);
    const goojfCount = Array.isArray(rawGoojf) ? rawGoojf.length : Number(rawGoojf ?? 0);
    if (goojfCount > 2) fixes.push(t('ai.goojfCap', { name, n: goojfCount }));
    const rawPos = Number(pick(p, ['pos', 'position'], fixes, name) ?? 0);
    const pos = Math.min(ed.spaces.length - 1, Math.max(0, rawPos || 0));
    if (pos !== rawPos) fixes.push(t('ai.posBad', { name, raw: String(rawPos), pos }));
    const inJail = !!p.inJail;
    if (inJail && pos !== ed.jailIndex) fixes.push(t('ai.jailPos', { name }));
    return {
      name,
      cash: [Math.max(0, Number(cash[0]) || 0), Math.max(0, Number(cash[1] ?? cash[0]) || 0)],
      pos: inJail ? ed.jailIndex : pos,
      inJail,
      jailTurns: Number(pick(p, ['jailTurns', 'failedRolls'], fixes, name) ?? 0),
      goojf: (['chance', 'community_chest'] as const).slice(0, Math.min(2, goojfCount)),
      busTickets: Number(p.busTickets ?? 0),
    };
  });
  const byName = new Map(ed.spaces.flatMap((s) => namesOf(ed, s.index).map((n) => [n.toLowerCase(), s.index] as const)));
  const playerByName = new Map(players.map((p, i) => [p.name.toLowerCase(), i]));
  const bySpace = new Map<number, ScenarioProperty>();
  for (const raw of sc.properties ?? []) {
    const pr = raw as Record<string, unknown>;
    const rawSpace = pick(pr, ['space', 'field', 'name'], fixes, t('ai.property'));
    let space = typeof rawSpace === 'string' ? byName.get(rawSpace.toLowerCase()) : (rawSpace as number | undefined);
    if (space === undefined && typeof rawSpace === 'string') {
      space = spaceById(ed, rawSpace);
      if (space !== undefined) fixes.push(t('ai.recognized', { raw: rawSpace, space: nm(space) }));
    }
    if (space === undefined || !ed.spaces[space]) return t('ai.unknownSpace', { raw: String(rawSpace) });
    const sp = ed.spaces[space], spName = nm(space);
    if (sp.type !== 'street' && sp.type !== 'station' && sp.type !== 'utility') { fixes.push(t('ai.notProperty', { i: space, name: spName })); continue; }
    const rawOwner = pr.owner;
    let owner = Number(rawOwner);
    if (typeof rawOwner === 'string' && Number.isNaN(owner)) {
      owner = playerByName.get(rawOwner.toLowerCase()) ?? -1;
      if (owner >= 0) fixes.push(t('ai.ownerRead', { space: spName, raw: rawOwner, i: owner }));
    }
    if (!(owner >= 0 && owner < players.length)) { fixes.push(t('ai.ownerUnknown', { space: spName, raw: String(rawOwner) })); continue; }
    const rawLevel = Number(pick(pr, ['level', 'buildings', 'houses'], fixes, spName) ?? 0) || 0;
    const max = sp.type === 'street' ? ed.maxLevel : 0;
    const level = Math.min(max, Math.max(0, rawLevel));
    if (level !== rawLevel) fixes.push(t('ai.levelCap', { space: spName, raw: rawLevel, level }));
    if (bySpace.has(space)) fixes.push(t('ai.dup', { space: spName }));
    bySpace.set(space, { space, owner, level, depot: sp.type === 'station' && !!pr.depot, mortgaged: !!pr.mortgaged });
  }
  const properties = [...bySpace.values()].sort((a, b) => a.space - b.space);
  const agreements = parseAgreements((sc as { agreements?: unknown }).agreements, players.length, ed);
  if (typeof agreements === 'string') return agreements;
  const current = Math.min(players.length - 1, Math.max(0, Number(sc.current ?? 0) || 0));
  if (sc.current !== undefined && current !== Number(sc.current)) fixes.push(t('ai.currentBad', { raw: String(sc.current), name: players[current].name }));
  const scenario: Scenario = {
    id: 'import', label: 'Imported game',
    players, properties, agreements,
    current,
    pot: Number(sc.pot ?? 0),
    busTicketsLeft: sc.busTicketsLeft === undefined ? null : sc.busTicketsLeft,
  };
  const profiles = players.map((_, i) => setup.profiles[i] ?? 'balanced');
  return { ...setup, scenario, profiles };
}

/** what the import corrected and what still looks wrong; empty lists = nothing to review */
export function reviewImport(text: string, setup: Setup): { setup?: Setup; error?: string; fixes: string[]; problems: string[] } {
  const fixes: string[] = [];
  const r = parseImport(text, setup, fixes);
  if (typeof r === 'string') return { error: r, fixes, problems: [] };
  const g = previewGame(r);
  const problems = 'error' in g ? [g.error] : warnings(r, g).filter((w) => w.level !== 'info').map((w) => w.text);
  return { setup: r, fixes, problems };
}

/** message for the assistant, so it can correct its own answer */
export function feedbackText(rv: { error?: string; fixes: string[]; problems: string[] }) {
  const { t } = i18n();
  const lines = [
    ...(rv.error ? [t('common.error', { error: rv.error })] : []),
    ...rv.problems.map((x) => t('ai.fbProblem', { x })),
    ...rv.fixes.map((x) => t('ai.fbFixed', { x })),
  ];
  return t('ai.feedback', { lines: lines.map((l) => `- ${l}`).join('\n') });
}

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard API needs a secure context; fall back for plain http on the LAN
    const el = document.createElement('textarea');
    el.value = text;
    document.body.append(el);
    el.select();
    document.execCommand('copy');
    el.remove();
  }
}

export function AiImport({ setup, onChange }: { setup: Setup; onChange: (s: Setup) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<'template' | 'paste'>('template');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const { t } = useI18n();
  const tpl = template(setup);

  const [review, setReview] = useState<ReturnType<typeof reviewImport> | null>(null);
  const copy = async () => {
    await writeClipboard(tpl);
    setMsg(t('ai.copied'));
  };
  const done = (s: Setup) => {
    onChange(s);
    setMsg(null);
    setReview(null);
    setText('');
    ref.current?.close();
  };
  const check = () => {
    setMsg(null);
    const rv = reviewImport(text, setup);
    if (rv.setup && !rv.fixes.length && !rv.problems.length) done(rv.setup);
    else setReview(rv);
  };
  const copyFeedback = async () => {
    if (!review) return;
    await writeClipboard(feedbackText(review));
    setMsg(t('ai.fbCopied'));
  };

  return (
    <>
      <button className="btn btn-sm" onClick={() => { setMsg(null); ref.current?.showModal(); }}>{t('ai.open')}</button>
      <dialog ref={ref} className="dialog" onClick={(e) => e.target === ref.current && ref.current?.close()}>
        <div className="section" style={{ gap: 14 }}>
          <div className="section-head">
            <h2 className="h16">{t('ai.title')}</h2>
            <button className="btn btn-ghost btn-sm btn-icon" aria-label={t('common.close')} onClick={() => ref.current?.close()}><Icon name="close" /></button>
          </div>
          <p className="caption">{t('ai.intro')}</p>
          <div className="segmented">
            <button aria-pressed={mode === 'template'} onClick={() => setMode('template')}>{t('ai.step1')}</button>
            <button aria-pressed={mode === 'paste'} onClick={() => setMode('paste')}>{t('ai.step2')}</button>
          </div>
          {mode === 'template' ? (
            <>
              <textarea className="input mono textarea" readOnly value={tpl} rows={14} />
              <div><button className="btn btn-sm btn-primary" onClick={copy}>{t('ai.copy')}</button></div>
            </>
          ) : (
            <>
              <textarea className="input mono textarea" rows={14} placeholder='{ "players": [ … ], "properties": [ … ] }' value={text}
                onChange={(e) => { setText(e.target.value); setReview(null); }} />
              {review && (
                <div className="import-review" role="status">
                  {review.error && <p className="caption" style={{ color: 'var(--error)' }}>{review.error}</p>}
                  {review.problems.length > 0 && (
                    <><h3 className="label">{t('ai.open2')}</h3><ul>{review.problems.map((x) => <li key={x}>{x}</li>)}</ul></>
                  )}
                  {review.fixes.length > 0 && (
                    <><h3 className="label">{t('ai.fixed')}</h3><ul>{review.fixes.map((x) => <li key={x}>{x}</li>)}</ul></>
                  )}
                </div>
              )}
              <div className="button-row">
                {review?.setup ? (
                  <button className="btn btn-sm btn-primary" onClick={() => done(review.setup!)}>{review.problems.length ? t('ai.applyAnyway') : t('ai.apply')}</button>
                ) : (
                  <button className="btn btn-sm btn-primary" onClick={check} disabled={!text.trim() || !!review}>{t('ai.check')}</button>
                )}
                {review && (
                  <button className="btn btn-sm" onClick={copyFeedback}>{t('ai.copyFeedback')}</button>
                )}
              </div>
            </>
          )}
          {msg && <p className="caption" role="status">{msg}</p>}
        </div>
      </dialog>
    </>
  );
}
