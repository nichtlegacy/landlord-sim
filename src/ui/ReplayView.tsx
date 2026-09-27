// "Replay" tab: step through one simulated game turn by turn.
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Edition } from '../engine/types';
import { replay, type Frame, type RunStats } from '../sim/runner';
import { Board, BoardTools } from './Board';
import { Icon } from './icons';
import { PlayerChip } from './art';
import { useI18n } from './i18n';
import { EDITIONS, playerColor, tokenOf, type Setup } from './model';
import { useWidth } from './ResultsView';
import { configFor } from './useSimulation';
import { eventText } from './events';

function typicalSeed(stats: RunStats, winner: number) {
  const games = stats.samples.filter((s) => s.winner === winner && !s.timeout);
  if (!games.length) return null;
  // ties broken by seed so the pick does not depend on worker completion order
  const sorted = [...games].sort((a, b) => a.rounds - b.rounds || a.seed - b.seed);
  return sorted[sorted.length >> 1];
}

export function ReplayView({ setup, stats, rotation = 0, onRotate }: { setup: Setup; stats: RunStats | null; rotation?: number; onRotate: () => void }) {
  const names = setup.scenario.players.map((p) => p.name);
  const tokens = names.map((_, i) => tokenOf(setup, i));
  const ed = EDITIONS[setup.editionId].edition;
  const { t, lang } = useI18n();
  const choices = useMemo(() => (stats ? names.map((_, i) => typicalSeed(stats, i)) : []), [stats, names]);
  const [seed, setSeed] = useState<number | null>(null);
  const [seedInput, setSeedInput] = useState('');
  const effectiveSeed = seed ?? choices.find((c) => c)?.seed ?? setup.seed;
  // with rotating starts the sample knows who began; a typed-in seed starts with the player on turn
  const start = stats?.samples.find((sm) => sm.seed === effectiveSeed)?.start ?? setup.scenario.current;
  const game = useMemo(() => replay(configFor(setup), effectiveSeed, start), [setup, effectiveSeed, start]);
  const say = (e: Frame['events'][number]) => eventText(e, { names, ed, lang });
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [animate, setAnimate] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const frames = game.frames;
  const f: Frame = frames[Math.min(idx, frames.length - 1)];

  useEffect(() => { setIdx(0); setPlaying(false); }, [effectiveSeed, setup]);
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setIdx((i) => {
      if (i >= frames.length - 1) { setPlaying(false); return i; }
      return i + 1;
    }), 900 / speed);
    return () => clearInterval(t);
  }, [playing, speed, frames.length]);
  useEffect(() => {
    // scroll only the log box to its newest line; scrollIntoView would drag the whole page along
    const box = logRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [idx]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      if (e.key === 'ArrowRight') { setAnimate(false); setIdx((i) => Math.min(frames.length - 1, i + 1)); }
      else if (e.key === 'ArrowLeft') { setAnimate(false); setIdx((i) => Math.max(0, i - 1)); }
      else if (e.key === ' ') { e.preventDefault(); setAnimate(true); setPlaying((p) => !p); }
      else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [frames.length]);

  const view = { owner: f.owner, level: f.level, depot: f.depot, mortgaged: f.mortgaged, pos: f.pos, inJail: f.inJail, out: f.bankrupt };
  const last = frames[frames.length - 1];
  const step = (d: number) => { setAnimate(true); setPlaying(false); setIdx((i) => Math.max(0, Math.min(frames.length - 1, i + d))); };
  const jump = (i: number) => { setAnimate(false); setPlaying(false); setIdx(i); };

  return (
    <div className="layout replay">
      <div className="replay-board">
        <Board edition={ed} view={view} names={names} tokens={tokens} animate={animate && idx > 0} pot={f.pot} busLeft={f.busLeft} rotation={rotation} />
        <BoardTools onRotate={onRotate} />
      </div>
      <div className="side sticky-side replay-side">
        <section className="section" style={{ gap: 12 }}>
          <h2 className="h16">{t('replay.which')}</h2>
          <div className="segmented">
            {choices.map((c, i) => c && (
              <button key={i} aria-pressed={effectiveSeed === c.seed} onClick={() => setSeed(c.seed)}>
                <PlayerChip i={i} token={tokens[i]} size={18} />{names[i]}<span className="hide-sm">{t('replay.wins')}</span>
              </button>
            ))}
          </div>
          <p className="caption">
            {stats ? t('replay.typical') : t('replay.noSim')}
          </p>
          <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (seedInput) setSeed(Number(seedInput)); }}>
            <input className="input mono" placeholder={t('replay.seed', { n: effectiveSeed })} value={seedInput} onChange={(e) => setSeedInput(e.target.value.replace(/\D/g, ''))} aria-label="Seed" />
            <button className="btn btn-sm" type="submit">{t('replay.load')}</button>
          </form>
        </section>

        <section className="now replay-now" aria-live="polite">
          <div className="now-head">
            <span className="eyebrow">{t('replay.position', { r: f.round, i: idx, n: frames.length - 1 })}</span>
            <span className="caption">{t('replay.winsAfter', { name: names[game.winner], n: last.round, cap: game.timeout ? t('replay.capped') : '' })}</span>
          </div>
          <p className="h16" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {f.player >= 0 ? <><PlayerChip i={f.player} token={tokens[f.player]} size={22} />{t('replay.turnOf', { name: names[f.player] })}</> : t('replay.setup')}
          </p>
          <div className="now-events">
            {f.events.length ? f.events.slice(-4).map((e, k) => <span key={k}>{say(e)}</span>) : <span className="muted">{t('replay.startHint')}</span>}
          </div>
          <div className="replay-controls">
            <button className="btn btn-sm btn-icon" aria-label={t('replay.first')} onClick={() => jump(0)}><Icon name="first" /></button>
            <button className="btn btn-sm btn-icon" aria-label={t('replay.prev')} onClick={() => step(-1)}><Icon name="prev" /></button>
            <button className="btn btn-sm btn-primary play-btn" onClick={() => { setAnimate(true); setPlaying(!playing); }} aria-label={playing ? t('replay.pause') : t('replay.playAria')}>
              <Icon name={playing ? 'pause' : 'play'} size={14} /><span className="play-label">{playing ? t('replay.pause') : t('replay.play')}</span>
            </button>
            <button className="btn btn-sm btn-icon" aria-label={t('replay.next')} onClick={() => step(1)}><Icon name="next" /></button>
            <button className="btn btn-sm btn-icon" aria-label={t('replay.last')} onClick={() => jump(frames.length - 1)}><Icon name="last" /></button>
            <div className="segmented speed-seg">
              {[1, 4, 16].map((sp) => <button key={sp} aria-pressed={speed === sp} onClick={() => setSpeed(sp)}>{sp}×</button>)}
            </div>
          </div>
          <input className="range" type="range" min={0} max={frames.length - 1} value={idx} aria-label={t('replay.time')}
            onChange={(e) => jump(Number(e.target.value))} />
          <p className="caption"><span className="kbd">←</span> <span className="kbd">→</span> {t('replay.keysStep')} <span className="kbd">{t('replay.space')}</span> {t('replay.playPause')}</p>
        </section>

        <section className="section" style={{ gap: 12 }}>
          <div className="section-head">
            <h2 className="h16">{t('replay.cash')}</h2>
            <span className="caption">{t('replay.clickJump')}</span>
          </div>
          <CashChart ed={ed} frames={frames} idx={idx} names={names} tokens={tokens} onPick={jump} />
        </section>

        <section className="section" style={{ gap: 12 }}>
          <h2 className="h16">{t('replay.log')}</h2>
          {idx === 0 && <p className="caption">{t('replay.noTurns')} <span className="kbd">→</span>{t('replay.noTurnsEnd')}</p>}
          <div className="log" ref={logRef}>
            {frames.slice(Math.max(1, idx - 40), idx + 1).map((fr, k, arr) => fr.events.map((e, j) => (
              <div key={`${k}-${j}`} className="log-row" data-current={k === arr.length - 1}>
                <span className="caption num">R {e.round}</span>
                <PlayerChip i={e.player} token={tokens[e.player]} size={18} />
                <span>{say(e)}</span>
              </div>
            )))}
          </div>
        </section>
      </div>
    </div>
  );
}

function CashChart({ ed, frames, idx, names, tokens, onPick }: { ed: Edition; frames: Frame[]; idx: number; names: string[]; tokens: string[]; onPick: (i: number) => void }) {
  const [ref, W] = useWidth<HTMLDivElement>(480);
  const H = 170, L = 40, R = 6, T = 8, B = 22;
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...frames.flatMap((f) => f.cash));
  const n = Math.max(1, frames.length - 1);
  const x = (i: number) => L + (i / n) * (W - L - R);
  const y = (v: number) => T + (1 - Math.max(0, v) / max) * (H - T - B);
  const at = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(n, Math.round(((e.clientX - box.left) / box.width) * n)));
  };
  const ticks = niceTicks(max, 3);
  const lastRound = frames[frames.length - 1].round;
  const roundTicks = niceTicks(Math.max(1, lastRound), W < 400 ? 3 : 5).filter((r) => r <= lastRound);
  const frameOfRound = (r: number) => Math.max(0, frames.findIndex((f) => f.round >= r));
  const show = hover ?? idx;
  const { t, money } = useI18n();
  return (
    <div className="chart-wrap" ref={ref}>
      <svg className="chart" width={W} height={H} role="img" aria-label={t('replay.cashAria')}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text x={L - 6} y={y(t)} dy="0.35em" textAnchor="end">{t >= 1000 ? `${t / 1000}k` : t}</text>
          </g>
        ))}
        {roundTicks.map((r) => <text key={r} x={x(frameOfRound(r))} y={H - 6} textAnchor="middle">{r === 0 ? t('chart.start') : t('chart.r', { n: r })}</text>)}
        {names.map((_, p) => (
          <path key={p} d={`M${frames.map((f, i) => `${x(i)},${y(f.cash[p])}`).join('L')}`} fill="none" stroke={playerColor(p)} strokeWidth={1.6} strokeLinejoin="round" />
        ))}
        <line x1={x(idx)} x2={x(idx)} y1={T} y2={H - B} stroke="var(--fg)" strokeWidth={1.5} />
        {hover !== null && hover !== idx && <line className="cursor" x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} />}
        {names.map((_, p) => !frames[show].bankrupt[p] && (
          <circle key={p} cx={x(show)} cy={y(frames[show].cash[p])} r={3.5} fill={playerColor(p)} stroke="var(--bg)" strokeWidth={1.5} />
        ))}
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" style={{ cursor: 'pointer' }}
          onPointerMove={(e) => setHover(at(e))} onPointerLeave={() => setHover(null)}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onPick(at(e)); }}
          onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)} />
      </svg>
      <div className="legend" style={{ marginTop: 8 }}>
        {names.map((nm, p) => (
          <span key={p} style={{ opacity: frames[show].bankrupt[p] ? 0.45 : 1 }}>
            <PlayerChip i={p} token={tokens[p]} size={18} />{nm}
            <strong className="num">{frames[show].bankrupt[p] ? t('replay.broke') : money(ed, frames[show].cash[p])}</strong>
          </span>
        ))}
        {hover !== null && <span className="caption">{t('replay.hover', { r: frames[hover].round, i: hover })}</span>}
      </div>
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
