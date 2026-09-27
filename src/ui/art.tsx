// Board illustrations and playing pieces.
// Every piece is drawn in its own small box and scaled into place with <Fit>.
import type { ReactNode } from 'react';
import { playerColor } from './model';

const INK = '#1a1a1a';

/** scale a drawing made for a vw×vh box into the box (x, y, w) keeping its aspect */
export function Fit({ x, y, w, vw, vh, children }: { x: number; y: number; w: number; vw: number; vh: number; children: ReactNode }) {
  const s = w / vw;
  return <g transform={`translate(${x} ${y - (vh * s) / 2}) scale(${s})`}>{children}</g>;
}

// ------------------------------------------------------------------ space art (native boxes, see ART_BOX)

const cellHole = { fill: 'var(--board-cell)' };

const Locomotive = () => (
  <g fill="currentColor">
    <path d="M7.5 9 6 2.5h7L11.5 9Z" />
    <rect x="3.5" y="8.5" width="22" height="9" rx="3" />
    <path d="M15 8.5a3 3 0 0 1 6 0Z" />
    <rect x="24" y="4" width="12" height="14" />
    <rect x="22.5" y="2" width="15" height="2.6" rx="0.8" />
    <rect x="27" y="6.5" width="6" height="5" rx="0.6" style={cellHole} />
    <rect x="1.5" y="16.5" width="37" height="3" />
    <path d="M4 17.5 0 23.5h6.5Z" />
    <circle cx="10" cy="22" r="4" /><circle cx="19" cy="22" r="4" /><circle cx="31" cy="21.5" r="4.6" />
    <circle cx="10" cy="22" r="1.4" style={cellHole} /><circle cx="19" cy="22" r="1.4" style={cellHole} /><circle cx="31" cy="21.5" r="1.7" style={cellHole} />
  </g>
);

const Chest = () => (
  <g stroke="#0b3a5c" strokeWidth="1.2" strokeLinejoin="round">
    <path d="M4 13V9.5Q4 4 10 4h20q6 0 6 5.5V13Z" fill="#3aa0e0" />
    <rect x="4" y="13" width="32" height="15" rx="1.5" fill="#1b75bb" />
    <rect x="10" y="4.3" width="3.2" height="23.5" fill="#f6c343" />
    <rect x="26.8" y="4.3" width="3.2" height="23.5" fill="#f6c343" />
    <rect x="17" y="10.5" width="6" height="7.5" rx="1" fill="#f6c343" />
    <circle cx="20" cy="14" r="1" fill="#0b3a5c" stroke="none" />
    <path d="M6 7.5q2-2 5-2.5" stroke="#bfe4fb" strokeWidth="1.4" fill="none" strokeLinecap="round" />
  </g>
);

const Bus = () => (
  <g strokeLinejoin="round">
    <rect x="1.5" y="2" width="37" height="22" rx="3.5" fill="#d7261e" stroke="#7a1410" strokeWidth="1.2" />
    <rect x="1.5" y="12.3" width="37" height="1.6" fill="#f3e3b0" />
    {[4.5, 12, 19.5, 27].map((x) => <rect key={x} x={x} y="4.6" width="6" height="5.6" rx="1" fill="#dff1ff" />)}
    <rect x="3.5" y="15.5" width="5" height="7" rx="0.8" fill="#dff1ff" />
    {[11, 18.5, 26].map((x) => <rect key={x} x={x} y="15.5" width="6" height="4.5" rx="1" fill="#dff1ff" />)}
    <rect x="33" y="15.5" width="4" height="3" rx="0.6" fill="#ffe08a" />
    <circle cx="9.5" cy="24.5" r="3.6" fill="#222" /><circle cx="30.5" cy="24.5" r="3.6" fill="#222" />
    <circle cx="9.5" cy="24.5" r="1.3" fill="#bbb" /><circle cx="30.5" cy="24.5" r="1.3" fill="#bbb" />
  </g>
);

const Gift = () => (
  <g strokeLinejoin="round">
    <rect x="7" y="15" width="26" height="15" rx="1" fill="#e2231a" stroke="#7a1410" strokeWidth="1.1" />
    <rect x="5" y="10" width="30" height="6" rx="1" fill="#f0474f" stroke="#7a1410" strokeWidth="1.1" />
    <rect x="18" y="10" width="4" height="20" fill="#fdd835" />
    <path d="M20 10c-2-5-9-7-9-3.5 0 2.3 4.5 3.5 9 3.5Zm0 0c2-5 9-7 9-3.5 0 2.3-4.5 3.5-9 3.5Z" fill="#fdd835" stroke="#a37d00" strokeWidth="1" />
  </g>
);

const Bank = () => (
  <g stroke="#8a4a00" strokeWidth="1.1" strokeLinejoin="round">
    <path d="M3 12 20 3l17 9Z" fill="#f7941d" />
    <rect x="4.5" y="12" width="31" height="3.4" fill="#f7941d" />
    {[7.5, 14, 22.5, 29].map((x) => <rect key={x} x={x} y="15.4" width="3.6" height="10.6" fill="#fbb040" />)}
    <rect x="2.5" y="26" width="35" height="2.6" fill="#f7941d" />
    <rect x="1" y="28.6" width="38" height="2.4" fill="#f7941d" />
    <text x="20" y="10.6" textAnchor="middle" fontSize="4.6" fontWeight="800" fill="#6b3500" stroke="none" letterSpacing="0.3">BANK</text>
  </g>
);

const Diamond = () => (
  <g stroke="#2f6f99" strokeWidth="1.1" strokeLinejoin="round">
    <path d="M7 11 13.5 4h13l6.5 7Z" fill="#d6f1ff" />
    <path d="M7 11 20 28l13-17Z" fill="#8fd0f2" />
    <path d="m13.5 4 2.5 7 4-7 4 7 2.5-7M16 11l4 17 4-17" fill="none" strokeWidth="0.8" />
  </g>
);

const Flame = () => (
  <g strokeLinejoin="round">
    <path d="M20 2c6 6.5 11 11.7 11 18.5a11 11 0 0 1-22 0c0-4.2 2-7.6 4.6-10.4.5 3 2 5 4.1 6-.8-5.4.2-9.8 2.3-14.1Z" fill="#1565c0" stroke="#0d3c73" strokeWidth="1.1" />
    <path d="M20.4 14c3 3.2 5.2 5.6 5.2 8.6a5.6 5.6 0 0 1-11.2 0c0-2.4 1.6-4.6 3-5.8.3 1.6 1 2.4 2 2.8-.3-2.2.1-3.8 1-5.6Z" fill="#7fd3ff" />
  </g>
);

const Bulb = () => (
  <g strokeLinejoin="round" strokeLinecap="round">
    <path d="M14.5 22c0-4-6-6.5-6-12.5a11.5 11.5 0 0 1 23 0c0 6-6 8.5-6 12.5Z" fill="#ffe066" stroke="#9a7a00" strokeWidth="1.2" />
    <path d="M17 21.5c0-4-2.5-6-2.5-9M23 21.5c0-4 2.5-6 2.5-9M14.5 12.5l2.8 1.8 2.7-1.8 2.7 1.8 2.8-1.8" fill="none" stroke="#b58900" strokeWidth="0.9" />
    <rect x="14.5" y="22" width="11" height="6" rx="1" fill="#9aa4ad" stroke="#4b545c" strokeWidth="1" />
    <path d="M14.5 24h11M14.5 26h11" stroke="#4b545c" strokeWidth="0.8" />
    <path d="M17.5 28h5l-1 2h-3Z" fill="#4b545c" />
    <path d="M13 6.5q2-3 5.5-3.6" fill="none" stroke="#fff8c6" strokeWidth="1.5" />
  </g>
);

const Tap = () => (
  <g strokeLinejoin="round" strokeLinecap="round">
    <path d="M3 9.5h17a5 5 0 0 1 5 5V17h-6v-1.5a1 1 0 0 0-1-1H3Z" fill="#b8c4cc" stroke="#46525b" strokeWidth="1.2" />
    <rect x="10" y="4.5" width="3" height="5" fill="#b8c4cc" stroke="#46525b" strokeWidth="1.1" />
    <rect x="6" y="2.5" width="11" height="2.6" rx="1.3" fill="#8b98a1" stroke="#46525b" strokeWidth="1.1" />
    <path d="M25 22.5c0 2.2-1.4 3.8-3 3.8s-3-1.6-3-3.8c0-1.8 3-5.4 3-5.4s3 3.6 3 5.4Z" fill="#1e88e5" stroke="#0d4f8a" strokeWidth="1" />
  </g>
);

const Gavel = () => (
  <g strokeLinejoin="round" stroke="#4a2b10" strokeWidth="1.1">
    <g transform="rotate(-38 20 14)">
      <rect x="12" y="6" width="16" height="8" rx="2" fill="#a0612b" />
      <rect x="10.5" y="6.8" width="2.5" height="6.4" rx="0.8" fill="#d8b98b" />
      <rect x="27" y="6.8" width="2.5" height="6.4" rx="0.8" fill="#d8b98b" />
      <rect x="18.6" y="14" width="2.8" height="16" rx="1.2" fill="#c07a38" />
    </g>
    <rect x="17" y="25.5" width="19" height="4.5" rx="1.2" fill="#8a5424" />
  </g>
);

const RedCar = () => (
  <g strokeLinejoin="round">
    <path d="M2 18.5v-4.5q0-2 2-2.3l6-.9 5-5.3q1-1 2.5-1h8.5q1.6 0 2.6 1.2l4.2 5.1 4 .6q2 .4 2 2.4v4.7Z" fill="#e2231a" stroke="#7a1410" strokeWidth="1.2" />
    <path d="M12.5 11.3 16.6 7h4.4v4.3ZM23 7h3.6q.8 0 1.3.6l3 3.7H23Z" fill="#dff1ff" />
    <rect x="33.5" y="13" width="3.5" height="2" rx="0.8" fill="#ffe08a" />
    <circle cx="10.5" cy="19" r="4.2" fill="#222" /><circle cx="30.5" cy="19" r="4.2" fill="#222" />
    <circle cx="10.5" cy="19" r="1.6" fill="#ccc" /><circle cx="30.5" cy="19" r="1.6" fill="#ccc" />
  </g>
);

const Bobby = () => (
  <g strokeLinejoin="round" strokeLinecap="round">
    {/* pointing arm */}
    <path d="M24 26.5 36 21" stroke="#1d2f6f" strokeWidth="5" />
    <circle cx="37" cy="20.5" r="2.6" fill="#f2c9a0" stroke="#8a5a36" strokeWidth="0.9" />
    <path d="M38.5 19.3 44 17" stroke="#f2c9a0" strokeWidth="1.8" />
    {/* body */}
    <path d="M9 36v-6q0-5.5 11-5.5T31 30v6Z" fill="#1d2f6f" stroke="#0d1838" strokeWidth="1" />
    <circle cx="20" cy="29" r="0.9" fill="#d9dde6" /><circle cx="20" cy="32.5" r="0.9" fill="#d9dde6" />
    {/* head */}
    <circle cx="20" cy="18" r="6.5" fill="#f2c9a0" stroke="#8a5a36" strokeWidth="1" />
    <path d="M15.5 20.3q2.2-1.5 4.5 0 2.3-1.5 4.5 0-2 1.6-4.5.6-2.5 1-4.5-.6Z" fill="#5a3a20" />
    <circle cx="17.6" cy="16.8" r="0.8" fill={INK} /><circle cx="22.4" cy="16.8" r="0.8" fill={INK} />
    {/* custodian helmet */}
    <path d="M12.5 13.5Q12.6 2 20 1.5q7.4.5 7.5 12Z" fill="#1d2f6f" stroke="#0d1838" strokeWidth="1" />
    <rect x="11" y="12.6" width="18" height="2.4" rx="1.2" fill="#15245a" />
    <circle cx="20" cy="1.6" r="1.4" fill="#c8ced9" />
    <path d="m20 6 1.2 2.4 2.6.2-2 1.7.7 2.5-2.5-1.4-2.5 1.4.7-2.5-2-1.7 2.6-.2Z" fill="#dfe3ea" />
  </g>
);

const Ring = () => (
  <g strokeLinejoin="round">
    <ellipse cx="20" cy="21" rx="11" ry="8" fill="none" stroke="#b8860b" strokeWidth="3.4" />
    <ellipse cx="20" cy="21" rx="11" ry="8" fill="none" stroke="#f6c343" strokeWidth="1.6" />
    <path d="M13 9.5 16.5 5h7l3.5 4.5Z" fill="#e6f6ff" stroke="#2f6f99" strokeWidth="1" />
    <path d="M13 9.5 20 17l7-7.5Z" fill="#9fd6f3" stroke="#2f6f99" strokeWidth="1" />
    <path d="M17 12.5h6l-1.2 2.4h-3.6Z" fill="#b8860b" />
    <path d="M30 4.5l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1Z" fill="#fff" stroke="#9fd6f3" strokeWidth="0.6" />
  </g>
);

const Cash = () => (
  <g strokeLinejoin="round">
    {[[4, 12, -8, '#b7dfa8'], [6, 9, 4, '#cdeac0'], [5, 6, -2, '#dff2d2']].map(([x, y, r, f], k) => (
      <g key={k} transform={`rotate(${r} 20 16)`}>
        <rect x={x as number} y={y as number} width="30" height="16" rx="1.6" fill={f as string} stroke="#4f7a45" strokeWidth="1" />
        <rect x={(x as number) + 2.5} y={(y as number) + 2.5} width="25" height="11" rx="1" fill="none" stroke="#4f7a45" strokeWidth="0.7" />
        <ellipse cx={(x as number) + 15} cy={(y as number) + 8} rx="4.2" ry="3.6" fill="none" stroke="#4f7a45" strokeWidth="0.9" />
      </g>
    ))}
  </g>
);

export const ART_BOX: Record<string, [number, number, () => ReactNode]> = {
  station: [40, 26, Locomotive],
  community_chest: [40, 30, Chest],
  bus: [40, 29, Bus],
  gift: [40, 31, Gift],
  bank: [40, 31, Bank],
  tax: [40, 29, Diamond],
  ring: [40, 30, Ring],
  cash: [40, 30, Cash],
  gas: [40, 34, Flame],
  electric: [40, 31, Bulb],
  water: [28, 28, Tap],
  auction: [40, 31, Gavel],
  car: [42, 24, RedCar],
  bobby: [46, 37, Bobby],
};

/** a space illustration centred at (cx, cy), `w` units wide */
export function SpaceArt({ name, cx, cy, w }: { name: string; cx: number; cy: number; w: number }) {
  const a = ART_BOX[name];
  if (!a) return null;
  const [vw, vh, Draw] = a;
  return <Fit x={cx - w / 2} y={cy} w={w} vw={vw} vh={vh}><Draw /></Fit>;
}

// ------------------------------------------------------------------ buildings (drawn with the base at y = 0)

export function House({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} strokeLinejoin="round">
      <path d="M-5.5 0v-6.5L0-11l5.5 4.5V0Z" fill="#1fa855" stroke="#0a5a2a" strokeWidth="1" />
      <path d="M0-11 5.5-6.5V0H1.5v-6.8Z" fill="#168a45" />
      <path d="M-5.5-6.5 0-11 5.5-6.5" fill="none" stroke="#0a5a2a" strokeWidth="1" />
    </g>
  );
}

export function Hotel({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} strokeLinejoin="round">
      <path d="M-11 0v-8.5L0-14l11 5.5V0Z" fill="#e2231a" stroke="#7a1410" strokeWidth="1.1" />
      <path d="M0-14 11-8.5V0H4V-8.8Z" fill="#b71c14" />
      {[-7, -3].map((dx) => <rect key={dx} x={dx} y={-6.5} width={2.4} height={2.6} fill="#ffd9d6" />)}
      <rect x={-1.6} y={-4} width={3.2} height={4} fill="#7a1410" />
    </g>
  );
}

export function Skyscraper({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  // cream tower that stands taller than the colour bar, as the real piece does
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} strokeLinejoin="round">
      <path d="M-9 0v-19h4v-5h10v5h4V0Z" fill="#f4ead0" stroke="#6b5b35" strokeWidth="1.1" />
      <path d="M5-24v5h4V0H2v-24Z" fill="#dccda6" />
      <rect x="-1.2" y="-28" width="2.4" height="4" fill="#6b5b35" />
      {[-21, -16.5, -12, -7.5].map((wy) => [-3.5, 0].map((wx) => <rect key={`${wx}${wy}`} x={wx} y={wy} width={2.4} height={2.6} fill="#8d7b4f" />))}
      {[-15, -10.5, -6].map((wy) => <rect key={wy} x={-7.2} y={wy} width={2} height={2.4} fill="#8d7b4f" />)}
    </g>
  );
}

export function Depot({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} strokeLinejoin="round">
      <path d="M-9 0v-9l9-4.5L9-9V0Z" fill="#f4ead0" stroke="#6b5b35" strokeWidth="1" />
      <path d="M-5 0v-4a5 5 0 0 1 10 0v4Z" fill="#6b5b35" />
      <rect x="-11" y="-1" width="22" height="2" rx="0.6" fill="#6b5b35" />
    </g>
  );
}

/** building level as a small inline icon: 1-4 houses, 5 hotel, 6 skyscraper */
export function LevelIcon({ level, size = 18 }: { level: number; size?: number }) {
  if (level === 0) {
    return (
      <svg width={size} height={size} viewBox="-12 -24 24 26" aria-hidden>
        <path d="M-9 0h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
        <path d="M-3 0v-14l8 3.5-8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  }
  if (level >= 5) {
    return (
      <svg width={size} height={size} viewBox={level === 6 ? '-12 -30 24 32' : '-13 -18 26 20'} aria-hidden>
        {level === 6 ? <Skyscraper x={0} y={0} /> : <Hotel x={0} y={0} />}
      </svg>
    );
  }
  const w = 12 * level + 2;
  return (
    <svg width={(size * w) / 16} height={size} viewBox={`${-w / 2} -13 ${w} 14`} aria-hidden>
      {Array.from({ length: level }, (_, k) => <House key={k} x={-w / 2 + 7 + k * 12} y={0} />)}
    </svg>
  );
}

export function DepotIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="-12 -16 24 18" aria-hidden><Depot x={0} y={0} /></svg>;
}

/** a space illustration as a standalone inline icon */
export function ArtIcon({ name, size = 28 }: { name: string; size?: number }) {
  const a = ART_BOX[name];
  if (!a) return null;
  const [vw, vh, Draw] = a;
  return <svg width={(size * vw) / vh} height={size} viewBox={`0 0 ${vw} ${vh}`} aria-hidden style={{ color: 'var(--fg)' }}><Draw /></svg>;
}

// ------------------------------------------------------------------ playing pieces (24×24, filled silhouettes)

/** piece ids in picker order; names: token.<id> in src/ui/i18n */
export const TOKENS: { id: string }[] = ['car', 'boat', 'cat', 'hat', 'dog', 'boot', 'thimble', 'iron', 'barrow', 'duck', 'penguin', 'trex'].map((id) => ({ id }));

/** `hole` is painted in the chip colour to cut details out of the silhouette */
const PIECES: Record<string, (hole: string) => ReactNode> = {
  car: (h) => (
    <>
      <path d="M1.5 15.2 5 12.6l5-.8 2.3-3.3h3.2l1.3 3.2 4.6.6q1.6.3 1.6 1.9v1.6H1.5Z" />
      <circle cx="14.3" cy="8.2" r="1.9" />
      <circle cx="6.5" cy="16.2" r="2.9" /><circle cx="18" cy="16.2" r="2.9" />
      <circle cx="6.5" cy="16.2" r="1" fill={h} /><circle cx="18" cy="16.2" r="1" fill={h} />
    </>
  ),
  boat: (h) => (
    <>
      <path d="M1 14.5h22l-2.6 4.8H4.2Z" />
      <rect x="7" y="10.5" width="10" height="4.2" rx="0.5" />
      <rect x="9.6" y="7.2" width="4.6" height="3.6" rx="0.5" />
      <rect x="11.4" y="3" width="1.2" height="4.4" />
      <path d="M3.2 12.6 7.2 11.4v1.4l-4 1Z" /><path d="M16.8 11.4l4.6-1.3v1.4l-4.6 1.2Z" />
      <rect x="10.2" y="11.6" width="1.2" height="1.2" fill={h} /><rect x="12.6" y="11.6" width="1.2" height="1.2" fill={h} />
    </>
  ),
  cat: (h) => (
    <>
      <path d="M5.8 7.4 6.3 2.8 9 5.6Z" /><path d="M10.4 5.6 13 2.8l.6 4.6Z" />
      <circle cx="9.7" cy="8.6" r="4" />
      <path d="M6.3 12q-3 3.8-1.8 8.5h10.3q1.2-4.7-1.8-8.5Z" />
      <path d="M14.4 20.3q5.6.4 5.3-4.1-.2-2.3-2.2-3.4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="8.3" cy="8.3" r="0.7" fill={h} /><circle cx="11.1" cy="8.3" r="0.7" fill={h} />
    </>
  ),
  hat: (h) => (
    <>
      <path d="M7 4.5h10l-.8 12.5H7.8Z" />
      <rect x="3" y="16.5" width="18" height="2.8" rx="1.4" />
      <rect x="7.6" y="13.2" width="8.8" height="1.6" fill={h} />
    </>
  ),
  dog: () => (
    <path d="M2 11.5 4.3 10.2 4.9 6.8 6.5 9h1.9L9 11h9l2.8-3 -.5 3.6 1.2.8v4.3h-1.6v2.8h-2.2v-2.4H9.4v2.4H7.2v-2.9l-2-.9-.6-1.6-2.6-.5Z" />
  ),
  boot: () => (
    <path d="M7 3h6.5v10.5l6 2.5q2.5 1.1 2.5 3.6v1.4H5.5v-1.5l1-2V3Zm-1.5 17h6v1.5h-6Z" />
  ),
  thimble: (h) => (
    <>
      <path d="M7 19.5V10q0-6 5-6t5 6v9.5Z" />
      <rect x="6" y="18.3" width="12" height="2.8" rx="1" />
      {[[10, 8], [14, 8], [12, 10.5], [10, 13], [14, 13], [12, 15.5]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="0.8" fill={h} />)}
    </>
  ),
  iron: () => (
    <>
      <path d="M2.5 18.5q.5-7.3 8.5-8.5h9q1.5 0 1.5 1.5v7Z" />
      <path d="M8.5 10q.8-4.5 4.2-4.5h5.3q1.5 0 1.5 1.5v3" fill="none" stroke="currentColor" strokeWidth="1.9" />
    </>
  ),
  barrow: () => (
    <>
      <path d="M2.5 8.5h15l-2.2 6H5.2Z" />
      <circle cx="7" cy="17.5" r="2.7" />
      <path d="M17 8.8 22 6.8M13.8 14.3l1.4 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  duck: (h) => (
    <>
      <path d="M3.5 13.8q0 6.2 8.5 6.2t8.8-6.4q-3.5 1.2-5.6-1.4 2-1.7 1.6-4.3Q16.4 4.5 12.8 4.5q-3.8 0-4 3.9-.1 2.1 1.3 3.5-4.5 0-6.6 1.9Z" />
      <path d="m16.4 7.6 4.3.9-4.1 1.6Z" />
      <circle cx="13.6" cy="7.4" r="0.8" fill={h} />
    </>
  ),
  penguin: (h) => (
    <>
      <path d="M12 2.5q4 0 4.3 4.6.3 3 1.9 6.2 1.3 3-1 5.6L18 21H6l.8-2.1q-2.3-2.6-1-5.6 1.6-3.2 1.9-6.2Q8 2.5 12 2.5Z" />
      <path d="M12 8.3q2.4.3 2.8 4.7.3 3.6-2.8 5.4-3.1-1.8-2.8-5.4.4-4.4 2.8-4.7Z" fill={h} />
      <path d="m11.2 6.3 1.6 1.2-1.6.9Z" fill={h} />
    </>
  ),
  trex: () => (
    <path d="M13 3h5.5q2 0 2 2v2.2q0 .8-.8.8h-3.2v1H19v1.2h-2.5v1.8q2.5 1.2 2.5 4.2v1.4l-2 .8-.7 2.6h-2l.6-2.6h-3l-.8 2.6h-2l.9-3.3Q6 17.3 3 18.8L1.5 18q3.3-1.8 5.2-4.9 1.6-2.6 4.3-3.3V5q0-2 2-2Zm1.8 1.6a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Z" fillRule="evenodd" />
  ),
};

/** a piece as a standalone inline icon (pickers, chips) */
export function TokenIcon({ id, size = 16, hole = 'var(--bg)' }: { id: string; size?: number; hole?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {(PIECES[id] ?? PIECES.car)(hole)}
    </svg>
  );
}

/** a piece on the board: white figure on a disc in the player colour */
export function TokenDisc({ id, color, r = 14 }: { id: string; color: string; r?: number }) {
  const s = (r * 1.34) / 24;
  return (
    <g>
      <circle r={r} fill={color} stroke="#fff" strokeWidth={2.4} filter="url(#token-shadow)" />
      <g transform={`translate(${-12 * s} ${-12 * s}) scale(${s})`} fill="#fff" color="#fff">{(PIECES[id] ?? PIECES.car)(color)}</g>
    </g>
  );
}

/** HTML chip: player colour with the piece, used in lists, bars and legends */
export function PlayerChip({ i, token, size = 22, title }: { i: number; token: string; size?: number; title?: string }) {
  return (
    <span className="chip" style={{ background: playerColor(i), width: size, height: size }} title={title} aria-hidden={title ? undefined : true}>
      <TokenIcon id={token} size={Math.round(size * 0.74)} hole={playerColor(i)} />
    </span>
  );
}

export function DicePair() {
  const pips: Record<number, [number, number][]> = {
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  const die = (x: number, y: number, rot: number, face: number) => (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x="-22" y="-22" width="44" height="44" rx="9" fill="#fff" stroke="#6b6b6b" strokeWidth="1.6" />
      <path d="M-22 12v1a9 9 0 0 0 9 9h26a9 9 0 0 0 9-9v-1" fill="none" stroke="#d8d8d8" strokeWidth="3" />
      {pips[face].map(([px, py], k) => <circle key={k} cx={px * 11} cy={py * 11} r="4.2" fill="#1a1a1a" />)}
    </g>
  );
  return <g>{die(-28, 6, -14, 6)}{die(28, -8, 12, 4)}</g>;
}

/** a few houses and a hotel, as they come out of the box */
export function BuildingPile() {
  return (
    <g>
      <Hotel x={-4} y={-6} s={3.2} />
      <House x={-54} y={20} s={2.8} />
      <House x={40} y={26} s={2.8} />
      <House x={4} y={36} s={2.8} />
    </g>
  );
}
