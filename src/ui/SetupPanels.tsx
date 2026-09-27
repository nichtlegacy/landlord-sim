import { useState, type CSSProperties } from 'react';
// Panels of the "Game" tab: players (next to the board), rules, simulation and table (below it).
import { editionName, spaceName } from '../engine/edition';
import { PROFILES } from '../engine/policy';
import { HOUSE_RULES, officialAmounts, POPULAR_HOUSE_RULES, popularAmounts, speedModeOf, toggleRule, withSpeedMode, type Amounts, type SpeedMode } from '../house-rules';
import { AiImport } from './AiImport';
import { PlayerChip, TOKENS, TokenIcon } from './art';
import { addPlayer, movePlayer, removePlayer, setPlayer } from './edit';
import { profileName, ruleText, tokenName, useI18n, type Key } from './i18n';
import { Icon } from './icons';
import { amountsOf, continuationOf, EDITIONS, playerColor, presetNewGame, presetExample, tokenOf, type Setup } from './model';
import { parseSetup, shareUrl } from './share';

type Props = { setup: Setup; onChange: (s: Setup) => void };
const num = (v: string, fallback = 0) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : fallback);

// ------------------------------------------------------------------ players

export function PlayersPanel({ setup, onChange }: Props) {
  const ed = EDITIONS[setup.editionId].edition;
  const sc = setup.scenario;
  const { t, lang, money, num: fmt, currency } = useI18n();
  const cashLabel = ([lo, hi]: [number, number]) => (lo === hi ? money(ed, lo) : `${money(ed, lo)}–${fmt(Math.round(hi))}`);
  const cur = currency(ed);
  return (
    <section className="section" style={{ gap: 8 }}>
      <div className="section-head">
        <h2 className="h16">{t('players.title')} <span className="muted num" style={{ fontWeight: 400 }}>{sc.players.length}</span></h2>
        <button className="btn btn-sm btn-ghost" onClick={() => onChange(addPlayer(setup))} disabled={sc.players.length >= 6}>
          <Icon name="plus" size={14} /> {t('common.add')}
        </button>
      </div>
      <div className="acc-list">
        {sc.players.map((pl, i) => (
          <details key={i} className="acc">
            <summary>
              <PlayerChip i={i} token={tokenOf(setup, i)} />
              <span className="acc-title">
                {pl.name}
                {sc.current === i && <span className="acc-flag">{t('players.onTurn')}</span>}
              </span>
              <span className="acc-meta num">{cashLabel(pl.cash)}</span>
              <span className="acc-meta acc-pos">{pl.inJail ? `${t('players.jail')}${pl.jailTurns ? ` · ${pl.jailTurns}×` : ''}` : spaceName(ed, pl.pos, lang)}</span>
              <span className="acc-chevron" aria-hidden><Icon name="down" size={14} /></span>
            </summary>
            <div className="acc-body">
              <div className="form-grid">
                <label className="field span-2">
                  <span className="caption">{t('players.name')}</span>
                  <input className="input" value={pl.name} onChange={(e) => onChange(setPlayer(setup, i, { name: e.target.value || '?' }))} />
                </label>
                <div className="field span-2">
                  <span className="caption">{t('players.token')}</span>
                  <TokenPicker setup={setup} i={i} onChange={onChange} />
                </div>
                <label className="field">
                  <span className="caption">{t('players.cashFrom')}</span>
                  <span className="money"><span>{cur}</span>
                    <input className="input" type="number" min={0} step={10} value={pl.cash[0]}
                      onChange={(e) => onChange(setPlayer(setup, i, { cash: [num(e.target.value), Math.max(pl.cash[1], num(e.target.value))] }))} />
                  </span>
                </label>
                <label className="field">
                  <span className="caption">{t('players.cashTo')}</span>
                  <span className="money"><span>{cur}</span>
                    <input className="input" type="number" min={0} step={10} value={pl.cash[1]}
                      onChange={(e) => onChange(setPlayer(setup, i, { cash: [pl.cash[0], num(e.target.value)] }))} />
                  </span>
                </label>
                <label className="field span-2">
                  <span className="caption">{t('players.position')}</span>
                  <select className="select" value={pl.pos} onChange={(e) => onChange(setPlayer(setup, i, { pos: num(e.target.value), inJail: pl.inJail && num(e.target.value) === ed.jailIndex }))}>
                    {ed.spaces.map((sp) => <option key={sp.index} value={sp.index}>{sp.index} · {spaceName(ed, sp.index, lang)}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="caption">{t('players.style')}</span>
                  <select className="select" value={setup.profiles[i]}
                    onChange={(e) => onChange({ ...setup, profiles: setup.profiles.map((p, k) => (k === i ? e.target.value : p)) })}>
                    <ProfileOptions />
                  </select>
                </label>
                <label className="field">
                  <span className="caption">{t('players.goojf')}</span>
                  <input className="input" type="number" min={0} max={2} value={pl.goojf?.length ?? 0}
                    onChange={(e) => {
                      const k = Math.max(0, Math.min(2, num(e.target.value)));
                      onChange(setPlayer(setup, i, { goojf: (['chance', 'community_chest'] as const).slice(0, k) }));
                    }} />
                </label>
                <div className="field span-2">
                  <span className="caption">{t('players.status')}</span>
                  <div className="inline-controls">
                    <Switch checked={!!pl.inJail} label={t('players.inJail')}
                      onChange={(on) => onChange(setPlayer(setup, i, on ? { inJail: true, pos: ed.jailIndex } : { inJail: false, jailTurns: 0 }))} />
                    {pl.inJail && (
                      <label className="inline-field">
                        <span className="caption">{t('players.failed')}</span>
                        <input className="input input-xs" type="number" min={0} max={10} value={pl.jailTurns ?? 0}
                          onChange={(e) => onChange(setPlayer(setup, i, { jailTurns: num(e.target.value) }))} />
                      </label>
                    )}
                    {ed.decks.bus.length > 0 && (
                      <label className="inline-field">
                        <span className="caption">{t('players.bus')}</span>
                        <input className="input input-xs" type="number" min={0} max={16} value={pl.busTickets ?? 0}
                          onChange={(e) => onChange(setPlayer(setup, i, { busTickets: num(e.target.value) }))} />
                      </label>
                    )}
                  </div>
                </div>
              </div>
              <div className="acc-actions">
                <button className="btn btn-sm" disabled={sc.current === i} onClick={() => onChange({ ...setup, scenario: { ...sc, current: i } })}>
                  {sc.current === i ? t('players.isOnTurn') : t('players.makeNext')}
                </button>
                <span className="header-spacer" />
                <button className="btn btn-ghost btn-sm btn-icon" aria-label={t('players.up')} disabled={i === 0} onClick={() => onChange(movePlayer(setup, i, -1))}><Icon name="up" /></button>
                <button className="btn btn-ghost btn-sm btn-icon" aria-label={t('players.down')} disabled={i === sc.players.length - 1} onClick={() => onChange(movePlayer(setup, i, 1))}><Icon name="down" /></button>
                <button className="btn btn-ghost btn-sm" disabled={sc.players.length <= 2} onClick={() => onChange(removePlayer(setup, i))}>{t('players.remove')}</button>
              </div>
            </div>
          </details>
        ))}
      </div>
      <p className="caption">{t('players.note')}</p>
    </section>
  );
}

function TokenPicker({ setup, i, onChange }: Props & { i: number }) {
  const { t } = useI18n();
  const mine = tokenOf(setup, i);
  const taken = new Set(setup.scenario.players.map((_, k) => (k === i ? '' : tokenOf(setup, k))));
  return (
    <div className="token-grid" role="radiogroup" aria-label={t('players.token')} style={{ '--pc': playerColor(i) } as CSSProperties}>
      {TOKENS.map(({ id }) => {
        const label = tokenName(t, id);
        return (
          <button key={id} type="button" className="token-btn" role="radio" aria-checked={mine === id} aria-pressed={mine === id}
            aria-label={label} title={taken.has(id) ? t('token.taken', { name: label }) : label} disabled={taken.has(id)}
            onClick={() => onChange(setPlayer(setup, i, { token: id }))}>
            <TokenIcon id={id} size={22} hole={mine === id ? playerColor(i) : 'var(--bg-raised)'} />
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ rules

export function RulesCard({ setup, onChange }: Props) {
  const { t, tp, money } = useI18n();
  const entry = EDITIONS[setup.editionId];
  const ed = entry.edition;
  const hasSpeed = !!entry.official.speedDie;
  // speed die modes are one segmented control, not two switches
  const shown = HOUSE_RULES.filter((h) => (hasSpeed || !h.needsSpeedDie) && h.id !== 'H1' && h.id !== 'H13');
  const rules = shown.filter((h) => !h.requires);
  const childrenOf = (id: string) => shown.filter((h) => h.requires === id);
  const ids = HOUSE_RULES.filter((h) => hasSpeed || !h.needsSpeedDie).map((h) => h.id);
  const active = setup.houseRules.filter((id) => ids.includes(id));
  const amounts = amountsOf(setup);
  const official = officialAmounts(entry.official);
  const set = (patch: Partial<Setup>) => onChange({ ...setup, ...patch });
  const presets: [Key, string[], Amounts][] = [
    ['rules.presetOfficial', [], official],
    ['rules.presetPopular', POPULAR_HOUSE_RULES.filter((id) => ids.includes(id)), popularAmounts(entry.official)],
  ];
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const sameAmounts = (a: Amounts, b: Amounts) => a.goPass === b.goPass && a.goLand === b.goLand && a.jailFine === b.jailFine;
  const matched = presets.find(([, list, am]) => same(list, active) && sameAmounts(am, amounts))?.[0];
  const mode = speedModeOf(setup.houseRules);
  const setAmount = (k: keyof Amounts, v: number) => set({ amounts: { ...amounts, [k]: Math.max(0, v) } });
  const cont = continuationOf(setup);
  const tip = (id: string) => `${ruleText(t, id, 'ours')}\n${t('rules.officialTip', { text: ruleText(t, id, 'official') })}`;
  const m = (n: number) => money(ed, n);

  return (
    <section className="card section">
      <div className="card-head">
        <div>
          <h2 className="h16">{t('rules.title')}</h2>
          <p className="caption">{active.length ? tp('rules.active', active.length) : t('rules.official')}{matched ? '' : t('rules.custom')}</p>
        </div>
        <div className="segmented" role="group" aria-label={t('rules.preset')}>
          {presets.map(([key, list, am]) => (
            <button key={key} aria-pressed={matched === key} onClick={() => set({ houseRules: list, amounts: { ...am } })}>{t(key)}</button>
          ))}
        </div>
      </div>

      <div className="rule-block">
        <h3 className="label">{t('rules.goJail')}</h3>
        <div className="amount-grid">
          <AmountField label={t('rules.goPass')} value={amounts.goPass} onChange={(v) => setAmount('goPass', v)} official={official.goPass} setup={setup} />
          <AmountField label={t('rules.goLand')} value={amounts.goLand} onChange={(v) => setAmount('goLand', v)} official={official.goLand} setup={setup} />
          <AmountField label={t('rules.jailFine')} value={amounts.jailFine} onChange={(v) => setAmount('jailFine', v)} official={official.jailFine} setup={setup} noToggle />
        </div>
      </div>

      {hasSpeed && (
        <div className="rule-block">
          <h3 className="label">{t('rules.speed')}</h3>
          <div className="segmented" role="group" aria-label={t('rules.speed')}>
            {([['off', 'rules.speedOff'], ['official', 'rules.speedOfficial'], ['no_bonus', 'rules.speedNoBonus']] as [SpeedMode, Key][]).map(([sm, label]) => (
              <button key={sm} aria-pressed={mode === sm} onClick={() => set({ houseRules: withSpeedMode(setup.houseRules, sm) })}>{t(label)}</button>
            ))}
          </div>
          <p className="caption">
            {mode === 'off' ? t('rules.speedOffText') : mode === 'official' ? t('rules.speedOfficialText') : t('rules.speedNoBonusText')}
          </p>
        </div>
      )}

      <div className="rule-block">
        <h3 className="label">{t('rules.cont')}</h3>
        <div className="rule-grid">
          <div className="rule-item">
            <Switch checked={cont.buy} label={t('rules.buy')} onChange={(buy) => set({ continuation: { ...cont, buy } })} />
            <p className="caption">{cont.buy ? t('rules.buyOn') : t('rules.buyOff')}</p>
          </div>
          <div className="rule-item">
            <Switch checked={cont.build} label={t('rules.build')} onChange={(build) => set({ continuation: { ...cont, build } })} />
            <p className="caption">{cont.build ? t('rules.buildOn') : t('rules.buildOff')}</p>
          </div>
          <div className="rule-item">
            <Switch checked={cont.trade} label={t('rules.trade')} onChange={(trade) => set({ continuation: { ...cont, trade } })} />
            <p className="caption">{cont.trade ? t('rules.tradeOn') : t('rules.tradeOff')}</p>
          </div>
        </div>
      </div>

      <div className="rule-grid">
        {rules.map((h) => (
          <div key={h.id} className="rule-item" title={tip(h.id)}>
            <Switch checked={setup.houseRules.includes(h.id)} label={ruleText(t, h.id, 'label')} id={h.id}
              onChange={(on) => set({ houseRules: toggleRule(setup.houseRules, h.id, on) })} />
            <p className="caption">{ruleText(t, h.id, 'ours')}</p>
            {childrenOf(h.id).map((c) => {
              const parentOn = setup.houseRules.includes(h.id);
              return (
                <div key={c.id} className="rule-child" title={tip(c.id)} data-disabled={!parentOn}>
                  <Switch checked={parentOn && setup.houseRules.includes(c.id)} label={ruleText(t, c.id, 'label')} id={c.id} disabled={!parentOn}
                    onChange={(on) => set({ houseRules: toggleRule(setup.houseRules, c.id, on) })} />
                  <p className="caption">{parentOn ? ruleText(t, c.id, 'ours') : t('rules.onlyWith', { id: h.id })}</p>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <details className="disclosure">
        <summary>{t('rules.compare')}</summary>
        <table className="table" style={{ fontSize: 13, marginTop: 8 }}>
          <thead><tr><th scope="col">{t('rules.colRule')}</th><th scope="col">{t('rules.colHouse')}</th><th scope="col">{t('rules.colOfficial')}</th></tr></thead>
          <tbody>
            {HOUSE_RULES.filter((h) => hasSpeed || !h.needsSpeedDie).map((h) => (
              <tr key={h.id}><th scope="row" style={{ color: 'var(--fg)', whiteSpace: 'nowrap' }}>{h.id}</th><td>{ruleText(t, h.id, 'ours')}</td><td className="muted">{ruleText(t, h.id, 'official')}</td></tr>
            ))}
            <tr><th scope="row" style={{ color: 'var(--fg)' }}>{t('rules.goRow')}</th><td>{t('rules.goRowOurs', { pass: m(amounts.goPass), land: m(amounts.goLand) })}</td><td className="muted">{t('rules.goRowOfficial', { amount: m(official.goPass) })}</td></tr>
            <tr><th scope="row" style={{ color: 'var(--fg)' }}>{t('rules.bail')}</th><td>{m(amounts.jailFine)}</td><td className="muted">{m(official.jailFine)}</td></tr>
          </tbody>
        </table>
      </details>
    </section>
  );
}

function AmountField({ label, value, onChange, official, setup, noToggle = false }: { label: string; value: number; onChange: (v: number) => void; official: number; setup: Setup; noToggle?: boolean }) {
  const { t, money, currency } = useI18n();
  const ed = EDITIONS[setup.editionId].edition;
  const on = noToggle || value > 0;
  return (
    <div className="field">
      <span className="caption">{label}</span>
      <div className="amount-row">
        {!noToggle && <Switch checked={on} label="" onChange={(v) => onChange(v ? (official || 200) : 0)} />}
        <span className="money"><span>{currency(ed)}</span>
          <input className="input" type="number" min={0} step={10} value={value} disabled={!on} aria-label={label}
            onChange={(e) => onChange(num(e.target.value))} />
        </span>
      </div>
      <span className="caption muted">{t('rules.officialAmount', { amount: money(ed, official) })}</span>
    </div>
  );
}

const PROFILE_GROUPS = [['style', 'profile.groupStyle'], ['literature', 'profile.groupLiterature'], ['test', 'profile.groupTest']] as const;

/** profile <option>s grouped by kind; literature presets name their source on hover */
function ProfileOptions({ prefix = '' }: { prefix?: string }) {
  const { t } = useI18n();
  return PROFILE_GROUPS.map(([kind, label]) => (
    <optgroup key={kind} label={t(label)}>
      {Object.values(PROFILES).filter((p) => p.kind === kind).map((p) => <option key={p.id} value={p.id} title={p.source}>{prefix}{profileName(t, p.id, p.label)}</option>)}
    </optgroup>
  ));
}

// ------------------------------------------------------------------ simulation (compact, under the run button)

const GAMES = [5000, 10000, 20000, 50000, 100000];

/** games and play style; laid out by the run block of ResultSummary */
export function SimControls({ setup, onChange }: Props) {
  const { t } = useI18n();
  const allSame = setup.profiles.every((p) => p === setup.profiles[0]) ? setup.profiles[0] : '';
  return (
    <>
      <div className="segmented" role="group" aria-label={t('sim.games')}>
        {GAMES.map((g) => (
          <button key={g} aria-pressed={setup.games === g} onClick={() => onChange({ ...setup, games: g })}>{g / 1000}k</button>
        ))}
      </div>
      <select className="select select-sm" aria-label={t('sim.styleAll')} value={allSame}
        onChange={(e) => e.target.value && onChange({ ...setup, profiles: setup.profiles.map(() => e.target.value) })}>
        {!allSame && <option value="">{t('sim.mixed')}</option>}
        <ProfileOptions prefix={t('sim.stylePrefix')} />
      </select>
    </>
  );
}

// ------------------------------------------------------------------ table state and files

export function TableCard({ setup, onChange }: Props) {
  const { t, lang, currency } = useI18n();
  const ed = EDITIONS[setup.editionId].edition;
  const sc = setup.scenario;
  return (
    <section className="card section">
      <div className="card-head">
        <h2 className="h16">{t('table.title')}</h2>
        <select className="select select-sm" value={setup.editionId} aria-label={t('table.edition')} onChange={(e) => {
          if (e.target.value === setup.editionId) return;
          const names = setup.scenario.players.map((p) => p.name);
          onChange({ ...presetNewGame(e.target.value, names), profiles: setup.profiles });
        }}>
          {Object.entries(EDITIONS).map(([id, x]) => <option key={id} value={id}>{t('table.editionOption', { name: editionName(x.edition, lang), n: x.edition.spaces.length })}</option>)}
        </select>
      </div>
      <div className="form-grid">
        <label className="field">
          <span className="caption">{t('table.pot')}</span>
          <span className="money"><span>{currency(ed)}</span>
            <input className="input" type="number" min={0} value={sc.pot} onChange={(e) => onChange({ ...setup, scenario: { ...sc, pot: num(e.target.value) } })} />
          </span>
        </label>
        {ed.decks.bus.length > 0 && (
          <label className="field">
            <span className="caption">{t('table.bus')}</span>
            <input className="input" type="number" min={0} max={ed.decks.bus.length} value={sc.busTicketsLeft ?? ed.decks.bus.length}
              onChange={(e) => onChange({ ...setup, scenario: { ...sc, busTicketsLeft: Math.min(ed.decks.bus.length, num(e.target.value)) } })} />
          </label>
        )}
      </div>
      <div className="rule-item">
        <Switch checked={!!setup.rotateStart} label={t('table.rotate')} onChange={(rotateStart) => onChange({ ...setup, rotateStart })} />
        <p className="caption">{t('table.rotateText')}</p>
      </div>
      <label className="field">
        <span className="caption">{t('table.seed')} <span className="muted">{t('table.seedNote')}</span></span>
        <span style={{ display: 'flex', gap: 8 }}>
          <input className="input mono" type="number" value={setup.seed} onChange={(e) => onChange({ ...setup, seed: num(e.target.value, 1) })} />
          <button className="btn btn-sm" onClick={() => onChange({ ...setup, seed: 1 + Math.floor(Math.random() * 1e6) })}>{t('table.random')}</button>
        </span>
      </label>
      <div className="button-row">
        <button className="btn btn-sm" onClick={() => onChange(presetExample())}>{t('table.example')}</button>
        <button className="btn btn-sm" onClick={() => onChange(presetNewGame(setup.editionId))}>{t('table.newGame')}</button>
        <AiImport setup={setup} onChange={onChange} />
        <ExportImport setup={setup} onChange={onChange} />
      </div>
    </section>
  );
}

const MAX_IMPORT = 2 * 1024 * 1024;

function ExportImport({ setup, onChange }: Props) {
  const { t } = useI18n();
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(setup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `landlord-${setup.scenario.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_IMPORT) { alert(t('io.tooBig')); return; }
    f.text().then((text) => {
      try {
        onChange(parseSetup(JSON.parse(text)));
      } catch (e) {
        alert(t('io.failed', { error: e instanceof Error ? e.message : String(e) }));
      }
    });
  };
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = await shareUrl(setup);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API needs a secure context (not on plain-http LAN)
      window.prompt(t('io.copyPrompt'), url);
    }
  };
  return (
    <>
      <button className="btn btn-sm" onClick={share} aria-live="polite">{copied ? t('io.copied') : t('io.share')}</button>
      <button className="btn btn-sm" onClick={exportJson}>{t('io.export')}</button>
      <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
        {t('io.import')}
        <input type="file" accept="application/json" hidden onChange={(e) => importJson(e.target.files?.[0])} />
      </label>
    </>
  );
}

// ------------------------------------------------------------------ switch

export function Switch({ checked, onChange, label, id, disabled = false }: { checked: boolean; onChange: (on: boolean) => void; label: string; id?: string; disabled?: boolean }) {
  return (
    <label className="switch" data-disabled={disabled}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden />
      <span className="switch-label">{id && <span className="muted mono">{id}</span>} {label}</span>
    </label>
  );
}
