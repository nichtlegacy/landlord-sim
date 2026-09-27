// "Ergebnis" tab: the answer first, then how it comes about, then how robust it is.
import type React from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PROFILES, STYLE_IDS } from '../engine/policy';
import { HOUSE_RULES, POPULAR_HOUSE_RULES, applyAmounts, applyHouseRules, popularAmounts } from '../house-rules';
import { wilson, type RunStats } from '../sim/runner';
import { agreementText } from './AgreementsCard';
import { PlayerChip } from './art';
import { cacheGet, cachePut, hashKey } from './cache';
import { applyTrade, previewGame } from './edit';
import { spaceName } from '../engine/edition';
import { profileName, ruleText, useI18n, type I18n } from './i18n';
import { EDITIONS, playerColor, rulesFor, setupKey, tokenOf, type Setup } from './model';
import { WinBars, headline } from './ResultSummary';
import { cancelJobs, configFor, runJob } from './useSimulation';

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

/** setup: the one the result was simulated with; current: the one being edited (the trade check starts from it) */
export function ResultsView({ setup, current, stats, stale, onRun, onChange, running }: {
  setup: Setup; current: Setup; stats: RunStats | null; stale: boolean; onRun: () => void; onChange: (s: Setup) => void; running: boolean;
}) {
  const names = setup.scenario.players.map((p) => p.name);
  const tokens = names.map((_, i) => tokenOf(setup, i));
  const { t, num, pct: fmtPct } = useI18n();
  if (!stats) {
    return (
      <div className="section" style={{ paddingTop: 48, maxWidth: 560 }}>
        <h1 className="title">{t('results.emptyTitle')}</h1>
        <p className="muted">{t('results.emptyText')}</p>
        <div><button className="btn btn-primary" onClick={onRun} disabled={running}>{t('summary.run')}</button></div>
      </div>
    );
  }
  const order = stats.wins.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w);
  const top = order[0];
  const sortedRounds = [...stats.rounds].sort((a, b) => a - b);
  const cap = EDITIONS[setup.editionId].official.roundCap;
  const med = quantile(sortedRounds, 0.5), q90 = quantile(sortedRounds, 0.9);
  const capWins = stats.capWins ?? stats.wins.map(() => 0);
  const capSum = capWins.reduce((a, b) => a + b, 0);

  return (
    <div className="page">
      <section className="hero">
        <div className="section">
          <div className="hero-medal">
            <PlayerChip i={top.i} token={tokens[top.i]} size={64} />
            <div>
              <p className="eyebrow">{t('results.likely')}</p>
              <p className="display num" style={{ color: playerColor(top.i) }}>{fmtPct(top.w / stats.games, 0)}</p>
            </div>
          </div>
          <h1 className="title">{headline(names, stats.wins, stats.games)}</h1>
          <p className="muted" style={{ maxWidth: '60ch' }}>
            {t('results.lead', { pct: fmtPct(top.w / stats.games), games: num(stats.games), name: names[top.i] })}
            {capSum > 0 && t('results.capLead', { n: num(capSum), pct: fmtPct(capSum / stats.games), share: fmtPct(capWins[top.i] / Math.max(1, top.w)), name: names[top.i] })}
          </p>
          {stale && <p className="caption warn">{t('results.stale')}</p>}
        </div>
        <div className="section">
          <WinBars names={names} tokens={tokens} wins={stats.wins} games={stats.games} ci={stats.ci} />
          <p className="caption">{t('results.barsCaption')}</p>
          <div className="stat-row">
            <div className="stat"><span className="caption">{t('results.median')}</span><strong>{t('results.rounds', { n: med })}</strong></div>
            <div className="stat"><span className="caption">{t('results.q90')}</span><strong>{q90 > cap ? t('results.cap') : t('results.roundsShort', { n: q90 })}</strong></div>
            <div className="stat"><span className="caption">{t('results.games')}</span><strong>{num(stats.games)}</strong></div>
            <div className="stat"><span className="caption">{t('results.trades')}</span><strong>{num((stats.trades ?? 0) / stats.games, 1)}</strong></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head wrap">
          <div>
            <h2 className="h20">{t('worth.title')}</h2>
            <p className="caption">{t('worth.caption', { n: stats.trajectories.length })}</p>
          </div>
        </div>
        <WorthChart stats={stats} names={names} tokens={tokens} setup={setup} />
      </section>

      <section className="section">
        <div>
          <h2 className="h20">{t('conv.title')}</h2>
          <p className="caption">{t('conv.caption')}</p>
        </div>
        <ConvergenceChart stats={stats} names={names} />
      </section>

      <section className="grid-2">
        <div className="section">
          <div>
            <h2 className="h20">{t('length.title')}</h2>
            <p className="caption">
              {t('length.caption', { med, rest: q90 > cap ? t('length.capped', { cap }) : t('length.q90', { n: q90 }) })}
            </p>
          </div>
          <LengthChart rounds={sortedRounds} cap={cap} />
        </div>
        <div className="section">
          <div>
            <h2 className="h20">{t('surv.title')}</h2>
            <p className="caption">{t('surv.caption')}</p>
          </div>
          <SurvivalChart rounds={sortedRounds} cap={cap} />
        </div>
      </section>

      <section className="grid-2">
        <div className="section">
          <div>
            <h2 className="h20">{t('kinds.title')}</h2>
            <p className="caption">{t('kinds.caption', { cap })}</p>
          </div>
          <WinKindTable stats={stats} capWins={capWins} names={names} tokens={tokens} />
        </div>
        <div className="section">
          <div>
            <h2 className="h20">{t('bankrupt.title')}</h2>
            <p className="caption">{t('bankrupt.caption')}</p>
          </div>
          <BankruptTable stats={stats} names={names} tokens={tokens} />
        </div>
      </section>

      {setup.rotateStart && <SeatAdvantage stats={stats} />}
      <TradeCheck setup={current} onChange={onChange} />
      <Variants setup={setup} names={names} />
      <Sensitivity setup={setup} names={names} />
      <Assumptions setup={setup} />
    </div>
  );
}

/** width of an element in CSS px, so charts draw at their real size (text stays 11px) */
export function useWidth<T extends HTMLElement>(fallback = 800) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function WorthChart({ stats, names, tokens, setup }: { stats: RunStats; names: string[]; tokens: string[]; setup: Setup }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const { t, num, money } = useI18n();
  const fmtM = (n: number) => money(EDITIONS[setup.editionId].edition, n);
  const narrow = W < 560;
  const H = narrow ? 240 : 320, L = narrow ? 44 : 56, R = narrow ? 8 : 64, T = 12, B = 28;
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const data = useMemo(() => {
    const tr = stats.trajectories;
    if (!tr.length) return null;
    const rounds = tr[0].length;
    const lens = [...stats.rounds].sort((a, b) => a - b);
    const xMax = Math.min(rounds - 1, Math.max(20, quantile(lens, 0.9)));
    const series = names.map((_, p) => {
      const pts: { r: number; lo: number; mid: number; hi: number }[] = [];
      for (let r = 0; r <= xMax; r++) {
        const col = tr.map((g) => g[r][p]).sort((a, b) => a - b);
        pts.push({ r, lo: quantile(col, 0.25), mid: quantile(col, 0.5), hi: quantile(col, 0.75) });
      }
      return pts;
    });
    const yMax = Math.max(1, ...series.flatMap((s) => s.map((x) => x.hi)));
    return { series, xMax, yMax };
  }, [stats, names]);
  if (!data) return null;
  const x = (r: number) => L + (r / data.xMax) * (W - L - R);
  const y = (v: number) => T + (1 - v / data.yMax) * (H - T - B);
  const ticks = niceTicks(data.yMax, 4);
  const xt = niceTicks(data.xMax, narrow ? 3 : 6).filter((t) => t <= data.xMax);
  const labels = data.series.map((s, p) => ({ p, y: y(s[s.length - 1].mid) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < labels.length; k++) labels[k].y = Math.max(labels[k].y, labels[k - 1].y + 14);
  for (let k = labels.length - 1; k >= 0; k--) labels[k].y = Math.min(labels[k].y, (k === labels.length - 1 ? H - B : labels[k + 1].y - 14));
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const r = Math.round(((e.clientX - box.left) / box.width) * data.xMax);
    setHover(Math.max(0, Math.min(data.xMax, r)));
  };
  const hx = hover !== null ? x(hover) : 0;
  const rows = hover !== null ? data.series.map((s, p) => ({ p, v: s[hover] })).sort((a, b) => b.v.mid - a.v.mid) : [];
  return (
    <div className="chart-wrap" ref={ref}>
      <div className="legend" role="group" aria-label={t('worth.legend')} style={{ marginBottom: 12 }}>
        {names.map((n, i) => (
          <button key={i} className="legend-btn" aria-pressed={focus === i} onClick={() => setFocus(focus === i ? null : i)}>
            <PlayerChip i={i} token={tokens[i]} size={18} />{n}
          </button>
        ))}
      </div>
      <svg className="chart" width={W} height={H} role="img" aria-label={t('worth.aria')}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text x={L - 8} y={y(t)} dy="0.35em" textAnchor="end">{narrow ? `${Math.round(t / 1000)}k` : fmtM(t)}</text>
          </g>
        ))}
        <line className="axis" x1={L} x2={W - R} y1={H - B} y2={H - B} />
        {xt.map((r) => <text key={r} x={x(r)} y={H - 8} textAnchor="middle">{r === 0 ? t('chart.start') : t('chart.r', { n: r })}</text>)}
        {focus !== null && (() => {
          const sr = data.series[focus];
          return <path d={`M${sr.map((d) => `${x(d.r)},${y(d.hi)}`).join('L')}L${[...sr].reverse().map((d) => `${x(d.r)},${y(d.lo)}`).join('L')}Z`} fill={playerColor(focus)} opacity={0.16} />;
        })()}
        {data.series.map((s, p) => (
          <path key={`l${p}`} d={`M${s.map((d) => `${x(d.r)},${y(d.mid)}`).join('L')}`} fill="none" stroke={playerColor(p)}
            strokeWidth={focus === p ? 3 : 2.2} opacity={focus === null || focus === p ? 1 : 0.35} strokeLinejoin="round" />
        ))}
        {!narrow && labels.map(({ p, y: ly }) => <text key={p} x={W - R + 8} y={ly} dy="0.35em" style={{ fill: playerColor(p), fontWeight: 600 }}>{names[p]}</text>)}
        {hover !== null && (
          <g pointerEvents="none">
            <line className="cursor" x1={hx} x2={hx} y1={T} y2={H - B} />
            {data.series.map((s, p) => <circle key={p} cx={hx} cy={y(s[hover].mid)} r={4} fill={playerColor(p)} stroke="var(--bg)" strokeWidth={2} />)}
          </g>
        )}
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: hx > W / 2 ? hx - 232 : hx + 12, top: 44 }}>
          <strong>{hover === 0 ? t('chart.start') : t('chart.round', { n: hover })}</strong>
          {rows.map(({ p, v }) => (
            <span key={p} className="tooltip-row">
              <PlayerChip i={p} token={tokens[p]} size={16} />{names[p]}
              <strong>{fmtM(v.mid)}</strong>
            </span>
          ))}
          <span className="caption">{t('worth.spread', { list: rows.map(({ v }) => `${num(v.lo / 1000, 1)}–${num(v.hi / 1000, 1)}k`).join(' · ') })}</span>
        </div>
      )}
    </div>
  );
}

function LengthChart({ rounds, cap }: { rounds: number[]; cap: number }) {
  const [ref, W] = useWidth<HTMLDivElement>(600);
  const H = 240, L = 36, R = 8, T = 16, B = 28;
  const [hover, setHover] = useState<number | null>(null);
  const { t, num, pct: fmtPct } = useI18n();
  const finished = rounds.filter((r) => r <= cap);
  const capped = rounds.length - finished.length;
  const max = Math.max(10, finished.length ? quantile(finished, 0.99) : 10);
  const binW = Math.max(1, Math.ceil(max / 28));
  const bins = new Array(Math.ceil((max + 1) / binW)).fill(0);
  let late = 0;
  for (const r of finished) { if (r > max) late++; else bins[Math.floor(r / binW)]++; }
  const all = capped ? [...bins, capped] : bins;
  const top = Math.max(1, ...all);
  const gap = capped ? 14 : 0;
  const bw = (W - L - R - gap) / all.length;
  const bx = (k: number) => L + k * bw + (capped && k === bins.length ? gap : 0);
  const y = (c: number) => T + (1 - c / top) * (H - T - B);
  const med = quantile(rounds, 0.5);
  const medX = med > cap ? bx(bins.length) + bw / 2 : L + ((med + 0.5) / binW) * bw;
  const yt = niceTicks(top / rounds.length, 3).map((f) => f * rounds.length).filter((c) => c <= top);
  const xt = niceTicks(max, W < 480 ? 3 : 5).filter((t) => t <= max);
  const label = (k: number) => (k === bins.length ? t('length.capBin', { cap }) : binW === 1 ? t('chart.round', { n: k * binW }) : t('length.bin', { a: k * binW, b: k * binW + binW - 1 }));
  return (
    <div className="chart-wrap" ref={ref}>
      <svg className="chart" width={W} height={H} role="img" aria-label={t('length.aria')} onPointerLeave={() => setHover(null)}>
        {yt.map((c) => (
          <g key={c}>
            <line className="grid" x1={L} x2={W - R} y1={y(c)} y2={y(c)} />
            <text x={L - 6} y={y(c)} dy="0.35em" textAnchor="end">{fmtPct(c / rounds.length, 0)}</text>
          </g>
        ))}
        {all.map((c, k) => (
          <rect key={k} className={k === bins.length ? 'bar-cap' : 'bar'} data-on={hover === k} x={bx(k) + 0.5} width={Math.max(1, bw - 1.5)}
            y={y(c)} height={Math.max(0, H - B - y(c))} rx={1.5} />
        ))}
        {all.map((_, k) => (
          <rect key={`h${k}`} x={bx(k)} width={bw} y={T} height={H - T - B} fill="transparent"
            onPointerEnter={() => setHover(k)} onPointerDown={() => setHover(k)} />
        ))}
        <line x1={medX} x2={medX} y1={T} y2={H - B} stroke="var(--focus)" strokeWidth={1.5} strokeDasharray="3 3" pointerEvents="none" />
        <text x={medX + 6} y={T + 8} style={{ fill: 'var(--focus)', fontWeight: 600 }} pointerEvents="none">{t('length.median', { n: med })}</text>
        <line className="axis" x1={L} x2={W - R} y1={H - B} y2={H - B} />
        {xt.map((t) => <text key={t} x={L + (t / binW) * bw} y={H - 8} textAnchor="middle">{t}</text>)}
        {capped > 0 && <text x={bx(bins.length) + bw / 2} y={H - 8} textAnchor="middle" style={{ fill: 'var(--warning)' }}>{t('results.cap')}</text>}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: Math.min(Math.max(0, bx(hover) - 60), W - 170), top: 0 }}>
          <strong>{label(hover)}</strong>
          <span className="tooltip-row">{t('length.games')} <strong>{num(all[hover])}</strong></span>
          <span className="tooltip-row">{t('length.share')} <strong>{fmtPct(all[hover] / rounds.length)}</strong></span>
        </div>
      )}
      {late > 0 && <p className="caption" style={{ marginTop: 4 }}>{t('length.late', { n: num(late), max })}</p>}
    </div>
  );
}

function BankruptTable({ stats, names, tokens }: { stats: RunStats; names: string[]; tokens: string[] }) {
  const { t, pct: fmtPct } = useI18n();
  const cols = [...names, t('common.bank')];
  const heat = (share: number, color: string) => ({ background: `color-mix(in srgb, ${color} ${Math.round(Math.min(1, share * 2.2) * 70)}%, transparent)` });
  return (
    <div className="table-wrap">
      <table className="table heat-table">
        <thead>
          <tr><th scope="col">{t('bankrupt.col')}</th>{cols.map((c) => <th key={c} scope="col" className="n">{c}</th>)}<th scope="col" className="n">{t('bankrupt.survives')}</th></tr>
        </thead>
        <tbody>
          {names.map((n, v) => {
            const total = stats.bankruptBy[v].reduce((a, b) => a + b, 0);
            return (
              <tr key={v}>
                <th scope="row"><span className="row-name"><PlayerChip i={v} token={tokens[v]} size={18} />{n}</span></th>
                {stats.bankruptBy[v].map((c, j) => (
                  <td key={j} className="n">
                    {j === v ? <span className="muted">–</span> : <span className="heat" style={heat(c / stats.games, j < names.length ? playerColor(j) : 'var(--fg-faint)')}>{fmtPct(c / stats.games, 0)}</span>}
                  </td>
                ))}
                <td className="n"><strong>{fmtPct(1 - total / stats.games, 0)}</strong></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** winners[k] = winner of game k; stored with comparison rows so runs can be paired game by game */
/** `id` 'current' marks the row the others are compared against */
interface VariantRow { id?: string; label: string; stats: RunStats; winners?: number[] }

const winnersOf = (st: RunStats) => {
  const w = new Array<number>(st.games).fill(-1);
  for (const sm of st.samples) w[sm.k] = sm.winner;
  return w;
};

/**
 * Paired difference of player i's win share between two runs with the same seeds (common random numbers):
 * d_k = [a_k = i] - [b_k = i], mean and 95 % half-width.
 */
export function pairedDelta(a: number[], b: number[], i: number) {
  const n = Math.min(a.length, b.length);
  let sum = 0, sq = 0;
  for (let k = 0; k < n; k++) { const d = (a[k] === i ? 1 : 0) - (b[k] === i ? 1 : 0); sum += d; sq += d * d; }
  const mean = n ? sum / n : 0;
  const sd = Math.sqrt(Math.max(0, (sq - n * mean * mean) / Math.max(1, n - 1)));
  return { mean, half: n ? (1.96 * sd) / Math.sqrt(n) : 0 };
}
/** "+4.2 ± 0.9" in percentage points */
const fmtDelta = ({ mean, half }: { mean: number; half: number }, num: I18n['num']) => `${mean < 0 ? '−' : '+'}${num(Math.abs(mean) * 100, 1)} ± ${num(half * 100, 1)}`;

/** what the comparison tables need; drops per-game samples and trajectories before caching */
const slim = (st: RunStats): RunStats => ({ ...st, samples: [], trajectories: [] });

/** rows of a comparison, restored from the server cache for this exact setup */
function useCachedRows<T>(kind: 'variants' | 'sensitivity', setup: Setup) {
  const key = useMemo(() => hashKey(`${kind}|${setupKey(setup)}`), [kind, setup]);
  const [rows, setRows] = useState<T[] | null>(null);
  useEffect(() => {
    let live = true;
    setRows(null);
    cacheGet<{ rows: T[] }>(kind, key).then((c) => { if (live && c?.rows) setRows(c.rows); });
    return () => { live = false; };
  }, [kind, key]);
  const save = (r: T[]) => cachePut(kind, key, { rows: r });
  return [rows, setRows, save] as const;
}

function Variants({ setup, names }: { setup: Setup; names: string[] }) {
  const [rows, setRows, saveRows] = useCachedRows<VariantRow>('variants', setup);
  const [busy, setBusy] = useState<string | null>(null);
  const { t, tp, num, pct: fmtPct } = useI18n();
  const entry = EDITIONS[setup.editionId];
  // rows are cached with their label; shown by id so they follow the UI language
  const labelOf = (r: { id?: string; label: string }) =>
    r.id === 'current' ? t('variants.current', { rules: tp('app.houseRules', setup.houseRules.length) })
    : r.id === 'official' || r.id === 'popular' || r.id === 'no_speed' || r.id === 'no_trade' || r.id === 'no_auction' ? t(`variants.${r.id}`) : r.label;
  const variants = useMemo(() => {
    type Variant = { id: string; label: string; rules: ReturnType<typeof configFor>['rules'] };
    const currentRules = configFor(setup).rules;
    const list: Variant[] = [
      { id: 'official', label: 'Official rules', rules: entry.official },
      { id: 'popular', label: 'Popular house rules', rules: applyAmounts(applyHouseRules(entry.official, POPULAR_HOUSE_RULES), popularAmounts(entry.official)) },
      { id: 'current', label: 'Current selection', rules: currentRules },
    ];
    if (currentRules.speedDie) list.push({ id: 'no_speed', label: 'Without speed die', rules: { ...currentRules, speedDie: null, triplesAnySpace: false } });
    if (currentRules.trading) list.push({ id: 'no_trade', label: 'Without trading', rules: { ...currentRules, trading: false } });
    if (currentRules.auctionOnDecline) list.push({ id: 'no_auction', label: 'Without auctions', rules: { ...currentRules, auctionOnDecline: false } });
    return list;
  }, [setup, entry]);
  const games = 5000;
  const ref = rows?.find((r) => r.id === 'current');
  const go = async () => {
    const out: VariantRow[] = [];
    for (const [k, v] of variants.entries()) {
      setBusy(t('variants.progress', { k: k + 1, n: variants.length, label: labelOf(v) }));
      const st = await runJob(configFor(setup, { rules: v.rules, games }));
      if (!st) { setBusy(null); return; }
      out.push({ id: v.id, label: v.label, stats: slim(st), winners: winnersOf(st) });
      setRows([...out]);
    }
    saveRows(out);
    setBusy(null);
  };
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2 className="h20">{t('variants.title')}</h2>
          <p className="caption">{t('variants.caption', { games: num(games) })}</p>
        </div>
        <button className="btn btn-sm" onClick={go} disabled={!!busy}>{rows ? t('common.recompute') : t('variants.compare')}</button>
      </div>
      {busy && <p className="caption">{busy}</p>}
      {rows && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('variants.colRules')}</th>
                {names.map((n) => <th key={n} scope="col" className="n">{n}</th>)}
                {ref?.winners && names.map((n) => <th key={`d${n}`} scope="col" className="n">{t('variants.delta', { name: n })}</th>)}
                <th scope="col" className="n">{t('variants.medianRounds')}</th>
                <th scope="col" className="n">{t('variants.cap')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const best = Math.max(...r.stats.wins);
                const sorted = [...r.stats.rounds].sort((a, b) => a - b);
                return (
                  <tr key={r.id ?? r.label}>
                    <th scope="row" style={{ color: 'var(--fg)', fontWeight: 500 }}>{labelOf(r)}</th>
                    {r.stats.wins.map((w, i) => <td key={i} className="n" style={{ fontWeight: w === best ? 600 : 400 }}>{fmtPct(w / r.stats.games)}</td>)}
                    {ref?.winners && names.map((_, i) => (
                      <td key={`d${i}`} className="n muted" style={{ whiteSpace: 'nowrap' }}>{r === ref || !r.winners ? '–' : fmtDelta(pairedDelta(r.winners, ref.winners!, i), num)}</td>
                    ))}
                    <td className="n">{quantile(sorted, 0.5)}</td>
                    <td className="n">{fmtPct(r.stats.timeouts / r.stats.games)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Sensitivity({ setup, names }: { setup: Setup; names: string[] }) {
  const ids = STYLE_IDS;
  const combos = useMemo(() => {
    let out: string[][] = [[]];
    for (let k = 0; k < names.length; k++) out = out.flatMap((c) => ids.map((id) => [...c, id]));
    return out;
  }, [names.length, ids]);
  const [rows, setRows, saveRows] = useCachedRows<{ profiles: string[]; stats: RunStats }>('sensitivity', setup);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { t, num, pct: fmtPct } = useI18n();
  const games = 1000;
  const feasible = combos.length <= 81;
  const go = async () => {
    const out: { profiles: string[]; stats: RunStats }[] = [];
    for (const [k, profiles] of combos.entries()) {
      setBusy(t('sens.progress', { k: k + 1, n: combos.length }));
      const st = await runJob(configFor(setup, { profiles, games }));
      if (!st) { setBusy(null); return; }
      out.push({ profiles, stats: slim(st) });
      if (k % 3 === 2 || k === combos.length - 1) setRows([...out]);
    }
    saveRows(out);
    setBusy(null);
  };
  const leaderCount = rows ? names.map((_, i) => rows.filter((r) => r.stats.wins.indexOf(Math.max(...r.stats.wins)) === i).length) : [];
  const base = rows?.find((r) => r.profiles.every((p, i) => p === setup.profiles[i]));
  const ranked = rows && base ? [...rows].sort((a, b) => dist(b, base) - dist(a, base)) : rows;
  const shown = showAll ? ranked : ranked?.slice(0, 8);
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2 className="h20">{t('sens.title')}</h2>
          <p className="caption">
            {t('sens.caption', { styles: ids.map((id) => profileName(t, id, PROFILES[id].label)).join(', '), games: num(games) })}
            {!feasible && t('sens.tooMany')}
          </p>
        </div>
        <button className="btn btn-sm" onClick={go} disabled={!!busy || !feasible}>{rows ? t('common.recompute') : t('sens.run', { n: combos.length })}</button>
      </div>
      {busy && <p className="caption">{busy}</p>}
      {rows && (
        <>
          <p style={{ maxWidth: '68ch' }}>
            {names.map((n, i) => ({ n, c: leaderCount[i] })).sort((a, b) => b.c - a.c)
              .map(({ n, c }, k) => (k === 0 ? t('sens.leadFirst', { name: n, c, n: rows.length }) : t('sens.leadOther', { name: n, c }))).join(', ')}.
          </p>
          <div className="table-wrap">
            <table className="table">
              <caption className="caption">
                {showAll ? t('sens.all', { n: rows.length }) : t('sens.some', { shown: shown!.length, n: rows.length })}{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => setShowAll(!showAll)}>{showAll ? t('sens.less') : t('sens.showAll', { n: rows.length })}</button>
              </caption>
              <thead>
                <tr>
                  {names.map((n) => <th key={`p${n}`} scope="col">{t('sens.styleOf', { name: n })}</th>)}
                  {names.map((n) => <th key={`w${n}`} scope="col" className="n">{n}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown!.map((r) => {
                  const best = Math.max(...r.stats.wins);
                  return (
                    <tr key={r.profiles.join()} data-current={r === base}>
                      {r.profiles.map((p, i) => <td key={i}>{profileName(t, p, PROFILES[p].label)}</td>)}
                      {r.stats.wins.map((w, i) => <td key={i} className="n" style={{ fontWeight: w === best ? 600 : 400 }}>{fmtPct(w / r.stats.games)}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

const dist = (a: { stats: RunStats }, b: { stats: RunStats }) =>
  a.stats.wins.reduce((s, w, i) => s + Math.abs(w / a.stats.games - b.stats.wins[i] / b.stats.games), 0);

function Assumptions({ setup }: { setup: Setup }) {
  const tr = useI18n();
  const { t, tp, money } = tr;
  const ed = EDITIONS[setup.editionId].edition;
  const ranges = setup.scenario.players.filter((p) => p.cash[0] !== p.cash[1]);
  const active = HOUSE_RULES.filter((h) => setup.houseRules.includes(h.id));
  const rules = rulesFor(setup);
  const profiles = setup.profiles.map((id) => PROFILES[id]);
  const lit = [...new Set(profiles.filter((p) => p.source))];
  const leverage = setup.scenario.players.filter((_, i) => profiles[i].leverage).map((p) => p.name);
  const label = (id: string) => profileName(t, id, PROFILES[id].label);
  return (
    <section className="section" style={{ maxWidth: 760 }}>
      <h2 className="h20">{t('assume.title')}</h2>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ranges.length > 0 && <li>{t('assume.cash', { list: ranges.map((p) => `${p.name} ${money(ed, p.cash[0])}–${money(ed, p.cash[1])}`).join(', ') })}</li>}
        <li>
          {t('assume.styles', { list: setup.scenario.players.map((p, i) => `${p.name} ${profiles[i].kind === 'style' ? label(profiles[i].id).toLowerCase() : label(profiles[i].id)}`).join(', ') })}
          {' '}{t('assume.bots')}
          {rules.trading ? t('assume.trade') : t('assume.noTrade')}
          {leverage.length > 0 && tp('assume.leverage', leverage.length, { names: leverage.join(', ') })}
        </li>
        {lit.length > 0 && <li>{t('assume.lit', { list: lit.map((p) => t('assume.litItem', { label: label(p.id), source: p.source! })).join(' · ') })}</li>}
        {(!rules.buying || !rules.building) && (
          <li>{t('assume.cont', { list: [!rules.buying && t('assume.noBuy'), !rules.building && t('assume.noBuild')].filter(Boolean).join('; ') })}</li>
        )}
        <li>{t('assume.shuffle')}</li>
        <li>{t('assume.cap', { n: EDITIONS[setup.editionId].official.roundCap })}</li>
        {active.length > 0 && <li>{t('assume.rules', { list: active.map((h) => `${h.id} ${ruleText(t, h.id, 'label')}`).join(' · ') })}</li>}
        {(setup.scenario.agreements ?? []).length > 0 && (
          <li>{t('assume.deals', { list: setup.scenario.agreements!.map((a) => agreementText(a, setup.scenario.players.map((p) => p.name), ed, tr)).join(' · ') })}</li>
        )}
        <li>{t('assume.bus')}</li>
        <li>{t('assume.engine')}</li>
      </ul>
    </section>
  );
}

/** running win share after the first n games, from the per-game samples */
function ConvergenceChart({ stats, names }: { stats: RunStats; names: string[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const narrow = W < 560;
  const H = 200, L = 44, R = narrow ? 8 : 88, T = 12, B = 28;
  const { t, num, pct: fmtPct } = useI18n();
  const pts = useMemo(() => {
    const n = stats.samples.length, step = Math.max(1, Math.ceil(n / 200));
    const wins = names.map(() => 0), out: { n: number; p: number[] }[] = [];
    stats.samples.forEach((sm, k) => {
      wins[sm.winner]++;
      if ((k + 1) % step === 0 || k === n - 1) out.push({ n: k + 1, p: wins.map((w) => w / (k + 1)) });
    });
    return out;
  }, [stats, names]);
  if (pts.length < 2) return null;
  const nMax = pts[pts.length - 1].n;
  // start the axis once every player has a few games, the first dozen are pure noise
  const n0 = pts.find((d) => d.n >= Math.min(100, nMax / 20))!.n;
  const shown = pts.filter((d) => d.n >= n0);
  const yMax = Math.min(1, Math.max(0.1, ...shown.flatMap((d) => d.p)) * 1.1);
  const x = (n: number) => L + ((n - n0) / Math.max(1, nMax - n0)) * (W - L - R);
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const yt = niceTicks(yMax, 4).filter((t) => t <= yMax);
  const xt = niceTicks(nMax, W < 480 ? 3 : 5).filter((t) => t >= n0);
  const last = shown[shown.length - 1];
  // end labels, pushed apart so close lines stay readable
  const labels = names.map((_, p) => ({ p, y: y(last.p[p]) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < labels.length; k++) labels[k].y = Math.max(labels[k].y, labels[k - 1].y + 14);
  return (
    <div className="chart-wrap" ref={ref}>
      <svg className="chart" width={W} height={H} role="img" aria-label={t('conv.aria')}>
        {yt.map((t) => (
          <g key={t}>
            <line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text x={L - 8} y={y(t)} dy="0.35em" textAnchor="end">{fmtPct(t, 0)}</text>
          </g>
        ))}
        <line className="axis" x1={L} x2={W - R} y1={H - B} y2={H - B} />
        {xt.map((t) => <text key={t} x={x(t)} y={H - 8} textAnchor="middle">{num(t)}</text>)}
        {names.map((_, p) => (
          <path key={p} d={`M${shown.map((d) => `${x(d.n).toFixed(1)},${y(d.p[p]).toFixed(1)}`).join('L')}`} fill="none" stroke={playerColor(p)} strokeWidth={2} strokeLinejoin="round" />
        ))}
        {!narrow && labels.map(({ p, y: ly }) => <text key={`t${p}`} x={W - R + 8} y={ly} dy="0.35em" style={{ fill: playerColor(p), fontWeight: 600 }}>{names[p]} {fmtPct(last.p[p], 0)}</text>)}
      </svg>
    </div>
  );
}

function niceTicks(max: number, n: number) {
  const raw = max / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(v);
  return out;
}

/** S(n): share of games still running after n rounds, with a 95 % Wilson band */
function SurvivalChart({ rounds, cap }: { rounds: number[]; cap: number }) {
  const [ref, W] = useWidth<HTMLDivElement>(600);
  const H = 240, L = 44, R = 12, T = 16, B = 28;
  const [hover, setHover] = useState<number | null>(null);
  const { t, pct: fmtPct } = useI18n();
  const pts = useMemo(() => {
    const N = rounds.length, nMax = Math.min(cap, rounds[N - 1] ?? 0);
    const out: { n: number; s: number; lo: number; hi: number }[] = [];
    for (let n = 0, j = 0; n <= nMax; n++) {
      while (j < N && rounds[j] <= n) j++;
      const [lo, hi] = wilson(N - j, N);
      out.push({ n, s: (N - j) / N, lo, hi });
    }
    return out;
  }, [rounds, cap]);
  if (pts.length < 2) return null;
  const nMax = pts[pts.length - 1].n;
  const x = (n: number) => L + (n / nMax) * (W - L - R);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const yt = niceTicks(1, 4);
  const xt = niceTicks(nMax, W < 480 ? 3 : 5).filter((t) => t <= nMax);
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(nMax, Math.round(((e.clientX - box.left) / box.width) * nMax))));
  };
  const h = hover !== null ? pts[hover] : null;
  const last = pts[pts.length - 1];
  return (
    <div className="chart-wrap" ref={ref}>
      <svg className="chart" width={W} height={H} role="img" aria-label={t('surv.aria')}>
        {yt.map((t) => (
          <g key={t}>
            <line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text x={L - 8} y={y(t)} dy="0.35em" textAnchor="end">{fmtPct(t, 0)}</text>
          </g>
        ))}
        <line className="axis" x1={L} x2={W - R} y1={H - B} y2={H - B} />
        {xt.map((t) => <text key={t} x={x(t)} y={H - 8} textAnchor="middle">{t}</text>)}
        <path d={`M${pts.map((d) => `${x(d.n).toFixed(1)},${y(d.hi).toFixed(1)}`).join('L')}L${[...pts].reverse().map((d) => `${x(d.n).toFixed(1)},${y(d.lo).toFixed(1)}`).join('L')}Z`}
          fill="var(--fg)" opacity={0.12} />
        <path d={`M${pts.map((d) => `${x(d.n).toFixed(1)},${y(d.s).toFixed(1)}`).join('L')}`} fill="none" stroke="var(--fg)" strokeWidth={2} strokeLinejoin="round" />
        {h && (
          <g pointerEvents="none">
            <line className="cursor" x1={x(h.n)} x2={x(h.n)} y1={T} y2={H - B} />
            <circle cx={x(h.n)} cy={y(h.s)} r={4} fill="var(--fg)" stroke="var(--bg)" strokeWidth={2} />
          </g>
        )}
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {h && (
        <div className="tooltip" style={{ left: x(h.n) > W / 2 ? x(h.n) - 190 : x(h.n) + 12, top: 0 }}>
          <strong>{t('surv.after', { n: h.n })}</strong>
          <span className="tooltip-row">{t('surv.running')} <strong>{fmtPct(h.s)}</strong></span>
          <span className="caption">{t('surv.ci', { lo: fmtPct(h.lo), hi: fmtPct(h.hi) })}</span>
        </div>
      )}
      <p className="caption" style={{ marginTop: 4 }}>
        {last.n === cap && last.s > 0
          ? t('surv.atCap', { cap, s: fmtPct(last.s), lo: fmtPct(last.lo), hi: fmtPct(last.hi) })
          : t('surv.allDone', { n: last.n })}
      </p>
    </div>
  );
}

function WinKindTable({ stats, capWins, names, tokens }: { stats: RunStats; capWins: number[]; names: string[]; tokens: string[] }) {
  const { t, pct: fmtPct } = useI18n();
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">{t('kinds.player')}</th>
            <th scope="col" className="n">{t('kinds.share')}</th>
            <th scope="col" className="n">{t('kinds.bankrupt')}</th>
            <th scope="col" className="n">{t('kinds.cap')}</th>
          </tr>
        </thead>
        <tbody>
          {names.map((n, i) => (
            <tr key={i}>
              <th scope="row"><span className="row-name"><PlayerChip i={i} token={tokens[i]} size={18} />{n}</span></th>
              <td className="n"><strong>{fmtPct(stats.wins[i] / stats.games)}</strong></td>
              <td className="n">{fmtPct((stats.wins[i] - capWins[i]) / stats.games)}</td>
              <td className="n">{fmtPct(capWins[i] / stats.games)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** win share by seat when the starting player rotates; fair would be 1/n each */
function SeatAdvantage({ stats }: { stats: RunStats }) {
  const { t, pct: fmtPct } = useI18n();
  const seat = stats.seatWins ?? [];
  const n = seat.length;
  if (!n || !stats.games) return null;
  const ci = seat.map((w) => wilson(w, stats.games));
  const fair = 1 / n;
  const first = seat[0] / stats.games;
  return (
    <section className="section">
      <div>
        <h2 className="h20">{t('seat.title')}</h2>
        <p className="caption">{t('seat.caption', { fair: fmtPct(fair) })}</p>
      </div>
      <p style={{ maxWidth: '68ch' }}>
        {t('seat.text', { first: fmtPct(first), lo: fmtPct(ci[0][0]), hi: fmtPct(ci[0][1]), fair: fmtPct(fair) })}
        {ci[0][0] > fair ? t('seat.adv') : ci[0][1] < fair ? t('seat.disadv') : t('seat.noise')}
      </p>
      <div className="bars" role="list" style={{ maxWidth: 640 }}>
        {seat.map((w, k) => (
          <div key={k} role="listitem" style={{ display: 'contents' }}>
            <div className="bar-name">{t('seat.nth', { n: k + 1 })}</div>
            <div className="bar-track" aria-hidden>
              <div className="bar-fill" style={{ background: 'var(--fg)', opacity: 0.8, transform: `scaleX(${w / stats.games})` }} />
              <div className="bar-ci" style={{ left: `${ci[k][0] * 100}%`, width: `${Math.max(0.3, (ci[k][1] - ci[k][0]) * 100)}%` }} />
              <div className="bar-ref" style={{ left: `${fair * 100}%` }} />
            </div>
            <div className="bar-value">{fmtPct(w / stats.games)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const TRADE_GAMES = [2000, 5000, 10000];

/** "what does a trade bring": the same seeds before and after the trade, compared game by game */
function TradeCheck({ setup, onChange }: { setup: Setup; onChange: (s: Setup) => void }) {
  const names = setup.scenario.players.map((p) => p.name);
  const [a, setA] = useState(0);
  const [b, setB] = useState(1);
  const [giveA, setGiveA] = useState<number[]>([]);
  const [giveB, setGiveB] = useState<number[]>([]);
  const [cashText, setCashText] = useState('0');
  const cash = Math.round(Number(cashText)) || 0;
  const [games, setGames] = useState(5000);
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<{ a: number; b: number; before: number[]; after: number[]; delta: { mean: number; half: number }[]; games: number } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const tr = useI18n();
  const { t, lang, num, pct: fmtPct, currency } = tr;
  // a changed position invalidates selection and result
  const key = useMemo(() => setupKey(setup), [setup]);
  useEffect(() => { setGiveA([]); setGiveB([]); setCashText('0'); setRes(null); setRunError(null); }, [key]);
  const safeA = a < names.length ? a : 0, safeB = b < names.length && b !== safeA ? b : (safeA + 1) % names.length;

  const g = useMemo(() => previewGame(setup), [setup, lang]); // lang: its error text is translated
  const ed = EDITIONS[setup.editionId].edition;
  const tradeable = (p: number) =>
    'error' in g ? [] : setup.scenario.properties.filter((pr) => pr.owner === p && g.tradeable(pr.space));
  const trade = useMemo(() => {
    try { return { setup: applyTrade(setup, safeA, safeB, giveA, giveB, cash) }; }
    catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  }, [setup, safeA, safeB, giveA, giveB, cash, lang]);
  const touched = giveA.length > 0 || giveB.length > 0 || cash !== 0;

  const pick = (p: number) => (v: string) => {
    const i = Number(v);
    setRes(null);
    if (p === 0) { setA(i); setGiveA([]); if (i === safeB) { setB(safeA); setGiveB([]); } }
    else { setB(i); setGiveB([]); if (i === safeA) { setA(safeB); setGiveA([]); } }
  };
  const toggle = (list: number[], set: (l: number[]) => void, i: number) => { set(list.includes(i) ? list.filter((x) => x !== i) : [...list, i]); setRes(null); };

  const go = async () => {
    if (!('setup' in trade) || !trade.setup) return;
    setRunError(null);
    try {
      setBusy(t('trade.before'));
      const before = await runJob(configFor(setup, { games }));
      if (!before) { setBusy(null); return; }
      setBusy(t('trade.after'));
      const after = await runJob(configFor(trade.setup, { games }));
      if (!after) { setBusy(null); return; }
      const wb = winnersOf(before), wa = winnersOf(after);
      setRes({
        a: safeA, b: safeB, games,
        before: before.wins.map((w) => w / before.games),
        after: after.wins.map((w) => w / after.games),
        delta: names.map((_, i) => pairedDelta(wa, wb, i)),
      });
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };
  const cancel = () => { cancelJobs(); setBusy(null); };

  const propList = (p: number, list: number[], set: (l: number[]) => void) => {
    const props = tradeable(p);
    return (
      <fieldset className="field trade-props">
        <legend className="caption">{t('trade.gives', { name: names[p] })}</legend>
        {props.length === 0 && <span className="caption muted">{t('trade.nothing')}</span>}
        {props.map((pr) => (
          <label key={pr.space} className="check">
            <input type="checkbox" checked={list.includes(pr.space)} onChange={() => toggle(list, set, pr.space)} disabled={!!busy} />
            <span>{spaceName(ed, pr.space, lang)}{pr.mortgaged && <span className="muted">{t('trade.mortgaged')}</span>}</span>
          </label>
        ))}
      </fieldset>
    );
  };

  return (
    <section className="section">
      <div>
        <h2 className="h20">{t('trade.title')}</h2>
        <p className="caption">{t('trade.caption')}</p>
      </div>
      {'error' in g ? <p className="caption warn">{g.error}</p> : (
        <>
          <div className="trade-grid">
            <div className="section" style={{ gap: 10 }}>
              <label className="field">
                <span className="caption">{t('trade.playerA')}</span>
                <select className="select" value={safeA} onChange={(e) => pick(0)(e.target.value)} disabled={!!busy}>
                  {names.map((n, i) => <option key={i} value={i}>{n}</option>)}
                </select>
              </label>
              {propList(safeA, giveA, setGiveA)}
            </div>
            <div className="section" style={{ gap: 10 }}>
              <label className="field">
                <span className="caption">{t('trade.playerB')}</span>
                <select className="select" value={safeB} onChange={(e) => pick(1)(e.target.value)} disabled={!!busy}>
                  {names.map((n, i) => <option key={i} value={i}>{n}</option>)}
                </select>
              </label>
              {propList(safeB, giveB, setGiveB)}
            </div>
          </div>
          <div className="button-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="field">
              <span className="caption">{t('trade.pays', { a: names[safeA], b: names[safeB] })} <span className="muted">{t('trade.paysNeg', { b: names[safeB] })}</span></span>
              <span className="money"><span>{currency(ed)}</span>
                <input className="input" type="number" step={10} value={cashText} disabled={!!busy}
                  onChange={(e) => { setCashText(e.target.value); setRes(null); }} />
              </span>
            </label>
            <div className="segmented" role="group" aria-label={t('trade.gamesPerRun')}>
              {TRADE_GAMES.map((n) => (
                <button key={n} aria-pressed={games === n} disabled={!!busy} onClick={() => { setGames(n); setRes(null); }}>{num(n)}</button>
              ))}
            </div>
            {busy
              ? <button className="btn btn-sm" onClick={cancel}>{t('common.cancel')}</button>
              : <button className="btn btn-sm btn-primary" onClick={go} disabled={!('setup' in trade)}>{t('trade.check')}</button>}
            <button className="btn btn-sm" disabled={!!busy || !('setup' in trade)} onClick={() => 'setup' in trade && trade.setup && onChange(trade.setup)}>{t('trade.apply')}</button>
          </div>
          {touched && 'error' in trade && <p className="caption warn">{trade.error}</p>}
          {busy && <p className="caption" aria-live="polite">{t('trade.busy', { what: busy, games: num(games) })}</p>}
          {runError && <p className="caption" style={{ color: 'var(--error)' }}>{t('common.error', { error: runError })}</p>}
          {res && (
            <>
              <p style={{ maxWidth: '68ch' }}>{verdict(res.a, res.b, res.delta, names, tr)}</p>
              <div className="table-wrap">
                <table className="table">
                  <caption className="caption">{t('trade.tableCaption', { games: num(res.games) })}</caption>
                  <thead>
                    <tr><th scope="col">{t('kinds.player')}</th><th scope="col" className="n">{t('trade.colBefore')}</th><th scope="col" className="n">{t('trade.colAfter')}</th><th scope="col" className="n">Δ</th></tr>
                  </thead>
                  <tbody>
                    {names.map((n, i) => (
                      <tr key={i}>
                        <th scope="row"><span className="row-name"><PlayerChip i={i} token={tokenOf(setup, i)} size={18} />{n}</span></th>
                        <td className="n">{fmtPct(res.before[i])}</td>
                        <td className="n">{fmtPct(res.after[i])}</td>
                        <td className="n" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtDelta(res.delta[i], num)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

/** "For Ben +4.2 ± 0.9 percentage points, for Cleo −3.8 ± 0.9." plus bystanders whose change is measurable */
function verdict(a: number, b: number, delta: { mean: number; half: number }[], names: string[], { t, num }: I18n) {
  const d = (i: number) => fmtDelta(delta[i], num);
  const others = names.map((_, i) => i).filter((i) => i !== a && i !== b && Math.abs(delta[i].mean) > delta[i].half);
  const tail = others.length ? `; ${others.map((i) => `${names[i]} ${d(i)}`).join(', ')}` : '';
  const pro = [a, b].filter((i) => delta[i].mean - delta[i].half > 0).map((i) => names[i]);
  const sum = pro.length === 2 ? t('trade.both') : pro.length === 1 ? t('trade.one', { name: pro[0] }) : t('trade.none');
  return t('trade.verdict', { a: names[a], da: d(a), b: names[b], db: d(b), tail, sum });
}
