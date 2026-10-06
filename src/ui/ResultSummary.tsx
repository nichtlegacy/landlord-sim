import type React from 'react';
// The answer: win probability per player on one shared 0-100 % scale.
import type { RunStats } from '../sim/runner';
import { PlayerChip } from './art';
import { i18n, useI18n } from './i18n';
import { playerColor } from './model';
import type { Live } from './useSimulation';

export function WinBars({ names, tokens, wins, games, ci, out }: { names: string[]; tokens: string[]; wins: number[]; games: number; ci?: [number, number][]; out?: boolean[] }) {
  const { t, pct, num } = useI18n();
  return (
    <div className="bars" role="list">
      {names.map((name, i) => {
        const p = games ? wins[i] / games : 0;
        return (
          <div key={i} role="listitem" style={{ display: 'contents' }}>
            <div className="bar-name">
              <PlayerChip i={i} token={tokens[i]} />
              <span style={{ opacity: out?.[i] ? 0.5 : 1 }}>{name}</span>
            </div>
            <div className="bar-track" aria-hidden>
              <div className="bar-fill" style={{ background: playerColor(i), transform: `scaleX(${p})` }} />
              {ci && ci[i] && <div className="bar-ci" style={{ left: `${ci[i][0] * 100}%`, width: `${Math.max(0.3, (ci[i][1] - ci[i][0]) * 100)}%` }} />}
            </div>
            <div className="bar-value">
              {games ? pct(p) : '–'}
              {ci && ci[i] && games > 0 && <small>{t('summary.pp', { x: num(Math.round((ci[i][1] - ci[i][0]) * 500) / 10) })}</small>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function headline(names: string[], wins: number[], games: number) {
  const { t } = i18n();
  if (!games) return t('summary.none');
  const order = wins.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w);
  const [a, b] = order;
  const gap = (a.w - (b?.w ?? 0)) / games;
  const spread = (a.w - order[order.length - 1].w) / games;
  if (order.length > 2 && spread < 0.03) return t('summary.open');
  if (gap < 0.02) return t('summary.tie', { a: names[a.i], b: names[b.i] });
  if (a.w / games > 0.75) return t('summary.sure', { name: names[a.i] });
  return t('summary.most', { name: names[a.i] });
}

export function ResultSummary(props: {
  names: string[];
  tokens: string[];
  out: boolean[];
  stats: RunStats | null;
  live: Live | null;
  stale: boolean;
  error: string | null;
  caption: string;
  onRun: () => void;
  onCancel: () => void;
  controls?: React.ReactNode;
}) {
  const { names, stats, live, stale } = props;
  const wins = live && live.games > 0 ? live.wins : stats?.wins ?? names.map(() => 0);
  const games = live && live.games > 0 ? live.games : stats?.games ?? 0;
  const showStats = !live && stats;
  const { t, num } = useI18n();
  return (
    <section className="section" aria-live="polite" aria-busy={!!live}>
      <div className="section-head">
        <h2 className="h20">{live ? t('summary.running') : headline(names, wins, games)}</h2>
      </div>
      <div className={stale && !live ? 'stale' : undefined}>
        <WinBars names={names} tokens={props.tokens} wins={wins} games={games} ci={showStats ? stats.ci : undefined} out={props.out} />
      </div>
      {live && (
        <div className="progress" aria-hidden><div style={{ transform: `scaleX(${live.games / live.total})` }} /></div>
      )}
      <p className="caption">
        {live
          ? t('summary.progress', { done: num(live.games), total: num(live.total) })
          : stale && stats ? t('summary.stale')
          : stats ? t('summary.games', { n: num(stats.games), caption: props.caption }) : props.caption}
      </p>
      {props.error && <p className="caption" style={{ color: 'var(--error)' }}>{t('common.error', { error: props.error })}</p>}
      {/* run button, then games and play style side by side (one row when the panel is wide) */}
      <div className="run-area">
        <div className="run-block">
          {live ? (
            <button key="cancel" className="btn" onClick={props.onCancel}>{t('common.cancel')}</button>
          ) : (
            <button key="run" className="btn btn-primary" data-umami-event="run-simulation" onClick={props.onRun}>{stats ? t('summary.rerun') : t('summary.run')}</button>
          )}
          {props.controls}
        </div>
      </div>
    </section>
  );
}
