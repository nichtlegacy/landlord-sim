// The board as one SVG, drawn after the printed board. Every space is drawn once in the
// frame of the bottom row (colour bar towards the centre, price at the outer edge) and then
// rotated onto its side, so all text faces outwards as on the real board.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from './icons';
import type { Edition, Space } from '../engine/types';
import { BuildingPile, DicePair, Depot, Hotel, House, Skyscraper, SpaceArt, TokenDisc } from './art';
import { editionName } from '../engine/edition';
import { useI18n, levelName } from './i18n';
import { artFor, lookFor, printedName, type Look } from './looks';
import { GROUP_COLORS, playerColor } from './model';

export interface BoardView {
  owner: number[];
  level: number[];
  depot: boolean[];
  mortgaged: boolean[];
  pos: number[];
  inJail: boolean[];
  out: boolean[];
}

const V = 1000;
const INK = 'currentColor';

export function geometry(n: number) {
  const k = n / 4;
  const w = V / (k - 1 + 3.1);
  const c = 1.55 * w;
  return { k, w, c, strip: c * 0.21 };
}

export interface CellBox { x: number; y: number; w: number; h: number; side: number; corner: boolean }

export function cellBox(i: number, n: number): CellBox {
  const { k, w, c } = geometry(n);
  const side = Math.floor(i / k), j = i % k;
  if (j === 0) {
    const pos = [[V - c, V - c], [0, V - c], [0, 0], [V - c, 0]][side];
    return { x: pos[0], y: pos[1], w: c, h: c, side, corner: true };
  }
  switch (side) {
    case 0: return { x: V - c - j * w, y: V - c, w, h: c, side, corner: false };
    case 1: return { x: 0, y: V - c - j * w, w: c, h: w, side, corner: false };
    case 2: return { x: c + (j - 1) * w, y: 0, w, h: c, side, corner: false };
    default: return { x: V - c, y: c + (j - 1) * w, w: c, h: w, side, corner: false };
  }
}

/** centre of a space in % of the board (for HTML overlays such as the popover) */
/** a cell box after turning the board `quarter` quarter turns clockwise (SVG y points down) */
export function rotateBox(b: CellBox, quarter: number): CellBox {
  let r = { ...b };
  for (let q = 0; q < ((quarter % 4) + 4) % 4; q++) r = { ...r, x: V - (r.y + r.h), y: r.x, w: r.h, h: r.w, side: (r.side + 1) % 4 };
  return r;
}

export function cellCenterPct(i: number, n: number) {
  const b = cellBox(i, n);
  return { x: ((b.x + b.w / 2) / V) * 100, y: ((b.y + b.h / 2) / V) * 100, side: b.side };
}

function wrap(text: string, max: number, maxLines = 3): string[] {
  const lines: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    if (!line) line = w;
    else if ((line + ' ' + w).length <= max) line += ' ' + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

/** text that is squeezed to `max` units when it would not fit (Geist caps ≈ 0.64 em) */
function Fitted({ x, y, text, size, max, weight = 600, fill = INK, spacing = 0.02 }: {
  x: number; y: number; text: string; size: number; max: number; weight?: number; fill?: string; spacing?: number;
}) {
  const est = text.length * size * (0.64 + spacing);
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={size} fontWeight={weight} fill={fill} letterSpacing={`${spacing}em`}
      {...(est > max ? { textLength: max, lengthAdjust: 'spacingAndGlyphs' } : {})}>{text}</text>
  );
}

/** animate tokens space by space for short forward moves; jump otherwise */
function useHop(target: number[], n: number, animate: boolean) {
  const [shown, setShown] = useState(target);
  const [jumping, setJumping] = useState<boolean[]>(target.map(() => true));
  const ref = useRef(target);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers: number[] = [];
    const cur = [...ref.current];
    const jump = target.map(() => false);
    const steps = target.map((t, p) => {
      const d = (t - cur[p] + n) % n;
      if (!animate || reduce || d === 0 || d > 24 || cur.length !== target.length) { jump[p] = true; return 0; }
      return d;
    });
    setJumping(jump);
    const maxSteps = Math.max(0, ...steps);
    if (maxSteps === 0) { ref.current = target; setShown(target); return; }
    const stepMs = Math.max(28, Math.min(70, 520 / maxSteps));
    for (let s = 1; s <= maxSteps; s++) {
      timers.push(window.setTimeout(() => {
        const next = cur.map((c, p) => (steps[p] === 0 ? target[p] : (c + Math.min(s, steps[p])) % n));
        ref.current = next;
        setShown(next);
      }, s * stepMs));
    }
    // players that jump (jail, cards) move at once
    const immediate = cur.map((c, p) => (steps[p] === 0 ? target[p] : c));
    ref.current = immediate;
    setShown(immediate);
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.join(','), n, animate]);
  return { shown, jumping };
}

export function Board(props: {
  edition: Edition;
  view: BoardView;
  names: string[];
  tokens: string[];
  selected?: number | null;
  onSelect?: (i: number) => void;
  animate?: boolean;
  pot?: number;
  /** bus tickets still in the stack (null = full) */
  busLeft?: number | null;
  /** quarter turns clockwise; keeps counting up so every turn animates clockwise */
  rotation?: number;
}) {
  const { edition: ed, view, names, tokens, selected = null, onSelect, animate = false, rotation = 0 } = props;
  const n = ed.spaces.length;
  const g = geometry(n);
  const [focus, setFocus] = useState(selected ?? 0);
  const { shown, jumping } = useHop(view.pos, n, animate);
  const svgRef = useRef<SVGSVGElement>(null);
  const look = lookFor(ed);
  const { t, lang } = useI18n();

  const onKey = (e: KeyboardEvent) => {
    const map: Record<string, number> = { ArrowLeft: 1, ArrowUp: 1, ArrowRight: -1, ArrowDown: -1 };
    if (e.key in map) {
      e.preventDefault();
      const next = (focus + map[e.key] + n) % n;
      setFocus(next);
      (svgRef.current?.querySelector(`[data-i="${next}"]`) as SVGGElement | null)?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(focus);
    }
  };

  // chance spaces cycle through the three printed colours
  let chance = 0;
  const chanceIdx = ed.spaces.map((sp) => (sp.type === 'chance' ? chance++ : -1));

  return (
    <div className="board-wrap">
      <svg ref={svgRef} className="board" data-look={look.kind} viewBox={`0 0 ${V} ${V}`} role="grid" aria-label={t('board.aria', { name: editionName(ed, lang) })} onKeyDown={onKey}>
        <defs>
          <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--board-hatch)" strokeWidth="3" />
          </pattern>
          <filter id="token-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodOpacity="0.35" />
          </filter>
        </defs>
        <rect x={0} y={0} width={V} height={V} className="board-bg" />
        <Centre ed={ed} g={g} pot={props.pot ?? 0} busLeft={props.busLeft ?? null}
          onBus={onSelect ? () => { const b = ed.spaces.find((sp) => sp.type === 'bus_ticket'); if (b) onSelect(b.index); } : undefined} />
        {/* the ring of spaces and the tokens turn; the centre artwork stays upright */}
        <g className="board-rot" style={{ transform: `rotate(${rotation * 90}deg)` }}>
        {ed.spaces.map((sp) => (
          <Cell key={sp.index} sp={sp} ed={ed} look={look} n={n} view={view} names={names} g={g} chance={chanceIdx[sp.index]}
            selected={selected === sp.index} tabIndex={focus === sp.index ? 0 : -1}
            onClick={() => { setFocus(sp.index); onSelect?.(sp.index); }} />
        ))}
        <rect x={g.c} y={g.c} width={V - 2 * g.c} height={V - 2 * g.c} fill="none" className="board-line" strokeWidth={2} />
        <rect x={1.5} y={1.5} width={V - 3} height={V - 3} fill="none" className="board-line" strokeWidth={3} />
        {/* buildings stand on top of every line, like the pieces on the real board */}
        <g pointerEvents="none">
          {ed.spaces.map((sp) => {
            const lvl = sp.type === 'street' ? view.level[sp.index] : 0;
            const depot = view.depot[sp.index];
            if (!lvl && !depot) return null;
            const side = Math.floor(sp.index / g.k), j = sp.index % g.k;
            return (
              <g key={sp.index} transform={`rotate(${side * 90} ${V / 2} ${V / 2}) translate(${V - g.c - j * g.w} ${V - g.c})`}>
                {lvl > 0 && <Buildings level={lvl} w={g.w} bar={g.c * 0.21} />}
                {depot && <g><Depot x={g.w / 2} y={3} s={n > 40 ? 1.05 : 1.25} /><title>{t('board.depot')}</title></g>}
              </g>
            );
          })}
        </g>
        {shown.map((pos, p) => {
          if (view.out[p]) return null;
          const t = tokenPoint(pos, p, shown, view.inJail, n, ed.jailIndex);
          return (
            <g key={p} className={`token${jumping[p] ? ' jump' : ''}`} style={{ transform: `translate(${t.x}px, ${t.y}px) rotate(${-rotation * 90}deg)` }} pointerEvents="none">
              <TokenDisc id={tokens[p]} color={playerColor(p)} r={n > 40 ? 14 : 16} />
              <title>{names[p]}</title>
            </g>
          );
        })}
        </g>
      </svg>
    </div>
  );
}

function tokenPoint(pos: number, p: number, all: number[], inJail: boolean[], n: number, jailIndex: number) {
  const b = cellBox(pos, n);
  const { strip } = geometry(n);
  const here = all.map((q, i) => ({ q, i })).filter((t) => t.q === pos && (pos !== jailIndex || inJail[t.i] === inJail[p]));
  const k = here.findIndex((t) => t.i === p);
  let cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  let vertical = false;
  if (!b.corner) {
    // middle of the space without the colour bar
    if (b.side === 0) cy = b.y + strip + (b.h - strip) * 0.5;
    if (b.side === 2) cy = b.y + (b.h - strip) * 0.5;
    if (b.side === 1) { cx = b.x + (b.w - strip) / 2; vertical = true; }
    if (b.side === 3) { cx = b.x + strip + (b.w - strip) / 2; vertical = true; }
  } else if (pos === jailIndex) {
    const s = b.w * 0.64;
    if (inJail[p]) { cx = b.x + b.w - s / 2; cy = b.y + s / 2; }
    else { cx = b.x + b.w * 0.4; cy = b.y + b.h * 0.83; }
  }
  // stack along the long axis of the space
  const gap = here.length > 3 ? 12 : 18;
  const o = (k - (here.length - 1) / 2) * gap;
  return vertical ? { x: cx + o * 0.35, y: cy + o } : { x: cx + o, y: cy + o * 0.35 };
}

// ------------------------------------------------------------------ one space

const CHANCE_COLORS = ['#f7941d', '#1b75bb', '#d93a96'];
/** small print on the specials of the grand board, as on the printed board */
const NOTES: Partial<Record<Space['type'], (t: ReturnType<typeof useI18n>['t'], amount: string) => { top?: string; bottom?: string }>> = {
  auction: (t) => ({ top: t('board.auctionTop'), bottom: t('board.auctionBottom') }),
  birthday_gift: (t, amount) => ({ bottom: t('board.giftBottom', { amount }) }),
};
const UPPER = (s: string) => s.toUpperCase();

function Cell(props: {
  sp: Space; ed: Edition; look: Look; n: number; view: BoardView; names: string[]; g: ReturnType<typeof geometry>; chance: number;
  selected: boolean; tabIndex: number; onClick: () => void;
}) {
  const { sp, n, view, names, g, selected } = props;
  const i = sp.index;
  const side = Math.floor(i / g.k), j = i % g.k;
  const corner = j === 0;
  const w = corner ? g.c : g.w, h = g.c;
  const x0 = corner ? V - g.c : V - g.c - j * g.w;
  const owner = view.owner[i];
  const { t, lang, money } = useI18n();
  const label = `${printedName(props.ed, i, lang, t)}${sp.price ? `, ${money(props.ed, sp.price)}` : ''}${owner >= 0 ? t('board.cellOwned', { name: names[owner] }) : ''}${view.mortgaged[i] ? t('board.cellMortgaged') : ''}`;

  return (
    <g className="cell" data-i={i} data-selected={selected} role="gridcell" aria-label={label} tabIndex={props.tabIndex} onClick={props.onClick}
      transform={`rotate(${side * 90} ${V / 2} ${V / 2}) translate(${x0} ${V - g.c})`}>
      <rect className="cell-bg" width={w} height={h} />
      {corner ? <Corner sp={sp} c={g.c} ed={props.ed} />
        : <SpaceBody sp={sp} ed={props.ed} look={props.look} w={w} h={h} n={n} view={view} names={names} chance={props.chance} />}
      <rect className="cell-frame" width={w} height={h} fill="none" />
    </g>
  );
}

function SpaceBody({ sp, ed, look, w, h, n, view, names, chance }: { sp: Space; ed: Edition; look: Look; w: number; h: number; n: number; view: BoardView; names: string[]; chance: number }) {
  const i = sp.index;
  const { t, lang, money } = useI18n();
  const big = n <= 40;
  const fs = big ? 9.4 : 8.2;
  const bar = sp.type === 'street' ? h * 0.21 : 0;
  const owner = view.owner[i];
  const band = owner >= 0 ? (big ? 14 : 12) : 0;
  const cx = w / 2;
  const pad = 4;
  const lines = wrap(UPPER(printedName(ed, i, lang, t)), Math.floor((w - 2 * pad) / (fs * 0.62)), sp.type === 'street' ? 3 : 4);
  const sub = look.subtitle(i);
  const nameTop = bar + fs + (bar ? 5 : 7);
  const subY = nameTop + lines.length * fs * 1.12;
  const priceY = h - band - (big ? 6 : 5);
  const price = sp.type === 'tax' ? `${t('board.pay')} ${money(ed, sp.amount!)}` : sp.price ? money(ed, sp.price) : '';
  const art = artFor(sp, look);
  // printed small print of the grand specials: under the name and at the outer edge, several short lines
  const note = NOTES[sp.type]?.(t, money(ed, sp.amount ?? 100));
  const nfs = fs * 0.66, nlh = nfs * 1.2, nmax = Math.floor((w - 2 * pad) / (nfs * 0.62));
  const topNote = note?.top ? wrap(note.top, nmax, 3) : [];
  const bottomNote = note?.bottom ? wrap(note.bottom, nmax, 3) : [];
  const nameEnd = sub ? subY : nameTop + (lines.length - 1) * fs * 1.12;
  const topNoteY = nameEnd + nfs + 4;
  const nameBottom = topNote.length ? topNoteY + (topNote.length - 1) * nlh : nameEnd;
  const bottomNoteY = priceY - (bottomNote.length - 1) * nlh;
  const artTop = nameBottom + 4;
  const artBottom = bottomNote.length ? bottomNoteY - nfs - 3 : price ? priceY - fs - 2 : h - band - 6;

  return (
    <>
      {bar > 0 && (
        <>
          <rect width={w} height={bar} fill={GROUP_COLORS[sp.group!] ?? '#ccc'} />
          <line x1={0} x2={w} y1={bar} y2={bar} className="board-line" strokeWidth={1.2} />
        </>
      )}
      {lines.map((l, k) => <Fitted key={k} x={cx} y={nameTop + k * fs * 1.12} text={l} size={fs} max={w - 2 * pad} />)}
      {sub && <Fitted x={cx} y={subY} text={sub} size={fs * 0.82} max={w - 2 * pad} weight={400} spacing={0} />}

      {sp.type === 'chance' ? (
        <text x={cx} y={(artTop + artBottom) / 2 + 17} textAnchor="middle" fontSize={big ? 58 : 50} fontWeight={800}
          fill={CHANCE_COLORS[chance % 3]} stroke="#1a1a1a" strokeWidth={1.6} paintOrder="stroke" style={{ fontFamily: 'Georgia, serif' }}>?</text>
      ) : art && (
        <g color="var(--board-ink)">
          <SpaceArt name={art} cx={cx} cy={(artTop + artBottom) / 2}
            w={Math.min(w * (art === 'water' ? 0.5 : 0.72), (artBottom - artTop) * 1.35)} />
        </g>
      )}
      {topNote.map((l, k) => <Fitted key={`t${k}`} x={cx} y={topNoteY + k * nlh} text={l} size={nfs} max={w - 2 * pad} weight={500} />)}
      {bottomNote.map((l, k) => <Fitted key={`b${k}`} x={cx} y={bottomNoteY + k * nlh} text={l} size={nfs} max={w - 2 * pad} weight={500} />)}
      {price && <Fitted x={cx} y={priceY} text={price} size={fs} max={w - 2 * pad} weight={500} />}

      {view.mortgaged[i] && <Mortgaged w={w} h={h} top={bar} bottom={band} />}
      {owner >= 0 && (
        <g>
          <rect y={h - band} width={w} height={band} fill={playerColor(owner)} />
          <Fitted x={cx} y={h - band / 2 + 3} text={UPPER(names[owner] ?? '')} size={band * 0.6} max={w - 6} weight={700} fill="#fff" spacing={0.06} />
        </g>
      )}
    </>
  );
}

function Mortgaged({ w, h, top, bottom }: { w: number; h: number; top: number; bottom: number }) {
  const { t } = useI18n();
  const cy = top + (h - top - bottom) / 2;
  return (
    <g pointerEvents="none">
      <rect y={top} width={w} height={h - top - bottom} className="mortgage-veil" />
      <rect y={top} width={w} height={h - top - bottom} fill="url(#hatch)" />
      <g transform={`translate(${w / 2} ${cy}) rotate(-62)`}>
        <rect x={-30} y={-7} width={60} height={14} rx={2} fill="var(--board-cell)" stroke="#d6242d" strokeWidth={1.6} />
        <text textAnchor="middle" y={3.2} fontSize={8.4} fontWeight={800} fill="#d6242d" letterSpacing="0.1em">{t('board.mortgagedStamp')}</text>
      </g>
      <title>{t('board.mortgaged')}</title>
    </g>
  );
}

function Buildings({ level, w, bar }: { level: number; w: number; bar: number }) {
  const { t } = useI18n();
  if (!level) return null;
  const base = bar - 3;
  const s = w > 70 ? 1.3 : 1.12;
  if (level === 6) return <g><Skyscraper x={w / 2} y={bar - 2} s={s} /><title>{levelName(t, 6)}</title></g>;
  if (level === 5) return <g><Hotel x={w / 2} y={base} s={s} /><title>{levelName(t, 5)}</title></g>;
  const step = 12.6 * s, x0 = w / 2 - ((level - 1) * step) / 2;
  return (
    <g>
      {Array.from({ length: level }, (_, k) => <House key={k} x={x0 + k * step} y={base} s={s} />)}
      <title>{levelName(t, level)}</title>
    </g>
  );
}

// ------------------------------------------------------------------ corners (drawn as the GO corner, bottom right)

function Corner({ sp, c, ed }: { sp: Space; c: number; ed: Edition }) {
  const { t: tr, money } = useI18n();
  const t = {
    collect: tr('board.collect', { go: money(ed, 200) }).split('\n'), go: tr('board.go'), inJail: tr('board.inJail'), just: tr('board.just'),
    visiting: tr('board.visiting'), free: [tr('board.free1'), tr('board.free2')], goTo: [tr('board.goTo1'), tr('board.goTo2')],
  };
  const m = c / 2;
  const diag = (children: ReactNode) => <g transform={`rotate(-45 ${m} ${m})`}>{children}</g>;
  switch (sp.type) {
    case 'go':
      return (
        <g>
          {diag(
            <>
              <Fitted x={m} y={m - c * 0.29} text={t.collect[0]} size={c * 0.062} max={c * 0.66} />
              <Fitted x={m} y={m - c * 0.205} text={t.collect[1] ?? ''} size={c * 0.062} max={c * 0.5} />
              <text x={m} y={m + c * 0.12} textAnchor="middle" fontSize={c * (t.go.length > 2 ? 0.3 : 0.36)} fontWeight={900} fill="#ed1b24" stroke="#1a1a1a" strokeWidth={1.4} paintOrder="stroke" letterSpacing="0.02em">{t.go}</text>
            </>,
          )}
          <path d={`M${c - 10} ${c - 12}H${c * 0.3}`} stroke="#ed1b24" strokeWidth={c * 0.07} />
          <path d={`M${c * 0.3 + 1} ${c - 12 - c * 0.1}L${c * 0.1} ${c - 12}L${c * 0.3 + 1} ${c - 12 + c * 0.1}Z`} fill="#ed1b24" />
        </g>
      );
    case 'jail': {
      // drawn in the GO frame: after the quarter turn the cell sits top right, "JUST" on the left, "VISITING" below
      const s = c * 0.64;
      return (
        <g>
          <rect width={s} height={s} fill="#f7941d" className="board-line" strokeWidth={1.4} />
          <rect x={s * 0.3} y={s * 0.14} width={s * 0.6} height={s * 0.72} fill="#fbd29b" stroke="#1a1a1a" strokeWidth={1.2} />
          {[0.42, 0.54, 0.66, 0.78].map((f) => <line key={f} x1={s * f} x2={s * f} y1={s * 0.14} y2={s * 0.86} stroke="#1a1a1a" strokeWidth={2.2} />)}
          <g transform={`translate(${s * 0.2} ${s / 2}) rotate(-90)`}>
            <Fitted x={0} y={c * 0.035} text={t.inJail} size={c * 0.1} max={s * 0.9} weight={800} fill="#1a1a1a" spacing={0.08} />
          </g>
          <Fitted x={s / 2} y={s + (c - s) / 2 + 5} text={t.just} size={c * 0.12} max={s * 0.95} weight={800} spacing={0.08} />
          <g transform={`translate(${s + (c - s) / 2 + 5} ${c / 2}) rotate(-90)`}>
            <Fitted x={0} y={0} text={t.visiting} size={c * 0.12} max={c * 0.95} weight={800} spacing={0.08} />
          </g>
        </g>
      );
    }
    case 'free_parking':
      return diag(
        <>
          <Fitted x={m} y={m - c * 0.2} text={t.free[0]} size={c * 0.14} max={c * 0.8} weight={800} spacing={0.06} />
          <SpaceArt name="car" cx={m} cy={m + 2} w={c * 0.62} />
          <Fitted x={m} y={m + c * 0.3} text={t.free[1]} size={c * 0.14} max={c * 0.64} weight={800} spacing={0.06} />
        </>,
      );
    default: // go to jail
      return diag(
        <>
          <Fitted x={m} y={m - c * 0.25} text={t.goTo[0]} size={c * 0.12} max={c * 0.64} weight={800} spacing={0.06} />
          <SpaceArt name="bobby" cx={m + 3} cy={m + 1} w={c * 0.5} />
          <Fitted x={m} y={m + c * 0.33} text={t.goTo[1]} size={c * 0.12} max={c * 0.6} weight={800} spacing={0.06} />
        </>,
      );
  }
}

// ------------------------------------------------------------------ the centre
// Placement follows the printed grand board (GO bottom right): Chance cards top right,
// Community Fund bottom left, Bus Tickets bottom right, the logo top left and
// the edition name across the lower half. The Free Parking pot lies in the middle, as at the table.

function Centre({ ed, g, pot, busLeft, onBus }: { ed: Edition; g: ReturnType<typeof geometry>; pot: number; busLeft: number | null; onBus?: () => void }) {
  const S = V - 2 * g.c, o = g.c;
  const { t, lang } = useI18n();
  const name = editionName(ed, lang);
  const mega = ed.decks.bus.length > 0;
  const u = S / 800; // design unit: sizes below are for an 800-wide centre
  const at = (fx: number, fy: number) => [o + S * fx, o + S * fy] as const;
  // the app's own wordmark: a house outline and the name, no edition branding
  const logo = (x: number, y: number, k: number) => (
    <g transform={`translate(${x} ${y}) rotate(-45) scale(${k * u})`} className="board-mark">
      <path d="M-128-2-110-18-92-2M-124-6v22h28V-6" fill="none" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
      <text x={-76} y={16} fontSize={46} fontWeight={800} letterSpacing="0.06em">LANDLORD</text>
    </g>
  );
  const deck = (fx: number, fy: number, kind: 'chance' | 'chest', rot: number) =>
    <Deck x={at(fx, fy)[0]} y={at(fx, fy)[1]} u={u} kind={kind} rot={rot} label={kind === 'chance' ? t('board.chance') : t('board.chest')} />;
  return (
    <g pointerEvents="none">
      <rect x={o} y={o} width={S} height={S} className="board-centre" />
      {mega ? (
        <>
          {logo(...at(0.29, 0.29), 0.95)}
          <g transform={`translate(${at(0.665, 0.665).join(' ')}) rotate(-45)`}>
            {/* shrink long edition names so they stay inside the centre (about 0.55 of its width along the diagonal) */}
            <text y={20 * u} textAnchor="middle" fontSize={Math.min(64 * u, (0.55 * S) / (name.length * 0.8))} fontWeight={800} fill={INK} letterSpacing="0.08em">{name.toUpperCase()}</text>
          </g>
          {deck(0.77, 0.23, 'chance', 45)}
          {deck(0.23, 0.77, 'chest', 45)}
          <BusDeck x={at(0.855, 0.855)[0]} y={at(0.855, 0.855)[1]} u={u} left={busLeft ?? ed.decks.bus.length} total={ed.decks.bus.length} onClick={onBus} />
        </>
      ) : (
        <>
          {logo(...at(0.5, 0.5), 1.25)}
          {deck(0.27, 0.27, 'chest', 135)}
          {deck(0.73, 0.73, 'chance', -45)}
          <g transform={`translate(${at(0.79, 0.21).join(' ')}) scale(${u * 1.15})`}><DicePair /></g>
          {pot === 0 && <g transform={`translate(${at(0.21, 0.79).join(' ')}) scale(${u * 1.1})`}><BuildingPile /></g>}
        </>
      )}
      {pot > 0 && <PotPile x={at(mega ? 0.465 : 0.25, mega ? 0.465 : 0.75)[0]} y={at(mega ? 0.465 : 0.25, mega ? 0.465 : 0.75)[1]} u={u} pot={pot} ed={ed} label={t('board.pot')} />}
    </g>
  );
}

function Deck({ x, y, u, kind, rot, label }: { x: number; y: number; u: number; kind: 'chance' | 'chest'; rot: number; label: string }) {
  const W = 170 * u, H = 108 * u;
  const chance = kind === 'chance';
  const face = chance ? '#f7941d' : '#bfe4fb', edge = chance ? '#a85a00' : '#1b75bb';
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      {/* printed card spot: hugs the stack (top card at 0, lower cards offset by up to 7.2u) */}
      <rect x={-W / 2 - 3 * u} y={-H / 2 - 3 * u} width={W + 13.2 * u} height={H + 13.2 * u} rx={9 * u} fill="none" stroke={edge} strokeOpacity={0.55} strokeWidth={1.4 * u} strokeDasharray={`${7 * u} ${5 * u}`} />
      {[3, 2, 1].map((k) => <rect key={k} x={-W / 2 + k * 2.4 * u} y={-H / 2 + k * 2.4 * u} width={W} height={H} rx={7 * u} fill="var(--board-cell)" stroke={edge} strokeWidth={1.2 * u} />)}
      <rect x={-W / 2} y={-H / 2} width={W} height={H} rx={7 * u} fill={face} stroke={edge} strokeWidth={2 * u} />
      <rect x={-W / 2 + 7 * u} y={-H / 2 + 7 * u} width={W - 14 * u} height={H - 14 * u} rx={4 * u} fill="none" stroke={edge} strokeWidth={1.4 * u} strokeDasharray={`${5 * u} ${4 * u}`} />
      {chance ? (
        <>
          <text y={30 * u} textAnchor="middle" fontSize={64 * u} fontWeight={800} fill="#fff" stroke="#1a1a1a" strokeWidth={2 * u} paintOrder="stroke" style={{ fontFamily: 'Georgia, serif' }}>?</text>
          <Fitted x={0} y={-26 * u} text={label} size={15 * u} max={150 * u} weight={800} fill="#5c2d00" spacing={0.2} />
        </>
      ) : (
        <>
          <SpaceArt name="community_chest" cx={0} cy={12 * u} w={58 * u} />
          <Fitted x={0} y={-26 * u} text={label} size={13 * u} max={150 * u} weight={800} fill="#0b3a5c" spacing={0.14} />
        </>
      )}
    </g>
  );
}

/** the Bus Ticket stack; an empty stack shows only the printed outline */
function BusDeck({ x, y, u, left, total, onClick }: { x: number; y: number; u: number; left: number; total: number; onClick?: () => void }) {
  const W = 128 * u, H = 78 * u;
  const { t } = useI18n();
  const layers = Math.min(4, Math.ceil((left / Math.max(1, total)) * 4));
  return (
    <g transform={`translate(${x} ${y}) rotate(-45)`} className={onClick ? 'deck-btn' : undefined} pointerEvents={onClick ? 'auto' : 'none'}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
      <rect x={-W / 2 - 8 * u} y={-H / 2 - 8 * u} width={W + 16 * u} height={H + 30 * u} rx={6 * u} fill="transparent" stroke={INK} strokeOpacity={0.45} strokeWidth={1.4 * u} strokeDasharray={`${6 * u} ${4 * u}`} />
      {left > 0 && (
        <>
          {Array.from({ length: layers }, (_, k) => layers - k).map((k) => (
            <rect key={k} x={-W / 2 + k * 2 * u} y={-H / 2 + k * 2 * u} width={W} height={H} rx={5 * u} fill="#fff7e0" stroke="#7a1410" strokeWidth={1 * u} />
          ))}
          <rect x={-W / 2} y={-H / 2} width={W} height={H} rx={5 * u} fill="#fff7e0" stroke="#7a1410" strokeWidth={1.6 * u} />
          <rect x={-W / 2} y={-H / 2} width={W} height={20 * u} rx={5 * u} fill="#d7261e" />
          <text y={-H / 2 + 14.5 * u} textAnchor="middle" fontSize={11 * u} fontWeight={800} fill="#fff" letterSpacing="0.18em">{t('board.busTicket')}</text>
          <SpaceArt name="bus" cx={0} cy={12 * u} w={50 * u} />
        </>
      )}
      <text y={H / 2 + 16 * u} textAnchor="middle" fontSize={11 * u} fontWeight={700} fill={INK} letterSpacing="0.08em">
        {left > 0 ? t('board.busLeft', { left, total }) : t('board.busNone')}
      </text>
      <title>{left > 0 ? t('board.busTitleLeft', { left, total }) : t('board.busTitleNone')}</title>
    </g>
  );
}

function PotPile({ x, y, u, pot, ed, label }: { x: number; y: number; u: number; pot: number; ed: Edition; label: string }) {
  const { money } = useI18n();
  // three banknotes, the top one straight and carrying the amount
  const notes = [['#9fd0f0', -16, -10, 6], ['#f5e6a8', 9, 8, 3], ['#f7c6d9', 0, 0, 0]] as const;
  return (
    <g transform={`translate(${x} ${y})`}>
      {notes.map(([fill, r, dx, dy], k) => (
        <g key={k} transform={`translate(${dx * u} ${dy * u}) rotate(${r})`}>
          <rect x={-50 * u} y={-25 * u} width={100 * u} height={50 * u} rx={3 * u} fill={fill} stroke="#5f5f5f" strokeWidth={1.1 * u} />
          <rect x={-44 * u} y={-19 * u} width={88 * u} height={38 * u} rx={2 * u} fill="none" stroke="#5f5f5f" strokeOpacity={0.45} strokeWidth={0.9 * u} />
        </g>
      ))}
      <text y={8 * u} textAnchor="middle" fontSize={24 * u} fontWeight={800} fill="#1a1a1a">{money(ed, pot)}</text>
      <text y={48 * u} textAnchor="middle" fontSize={11 * u} fontWeight={800} fill={INK} letterSpacing="0.16em">{label}</text>
    </g>
  );
}

/** the row under the board: a hint on the left, rotate (and on phones zoom) on the right */
export function BoardTools({ hint, onRotate, zoom, onZoom }: { hint?: string; onRotate: () => void; zoom?: boolean; onZoom?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="board-tools">
      {hint ? <p className="caption board-hint">{hint}</p> : <span />}
      <div className="tool-group" role="toolbar" aria-label={t('board.tools')}>
        {onZoom && (
          <button className="btn btn-sm tool-btn zoom-tool" aria-pressed={zoom} onClick={onZoom} aria-label={zoom ? t('board.zoomOutAria') : t('board.zoomInAria')} title={zoom ? t('board.zoomOut') : t('board.zoomIn')}>
            <Icon name={zoom ? 'close' : 'zoom'} size={16} /><span className="tool-label">{zoom ? t('board.zoomOut') : t('board.zoom')}</span>
          </button>
        )}
        <button className="btn btn-sm tool-btn" onClick={onRotate} aria-label={t('board.rotateAria')} title={t('board.rotateTitle')}>
          <Icon name="rotate" size={16} /><span className="tool-label">{t('board.rotate')}</span>
        </button>
      </div>
    </div>
  );
}
