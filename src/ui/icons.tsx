// One line-icon set on a 24 grid, stroke = currentColor. Drawn for this project.
import type { ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  chance: (
    <>
      <path d="M8.5 8.5a3.5 3.5 0 1 1 5.2 3.06c-.98.55-1.7 1.3-1.7 2.44V15" />
      <circle cx="12" cy="18.6" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  community_chest: (
    <>
      <path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M4 10V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v2" />
      <path d="M10.5 10v3h3v-3" />
    </>
  ),
  station: (
    <>
      <rect x="6" y="3.5" width="12" height="13" rx="3" />
      <path d="M6 10h12" />
      <circle cx="9.5" cy="13.3" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13.3" r="0.8" fill="currentColor" stroke="none" />
      <path d="M9 16.5 7 20.5M15 16.5l2 4M8 19h8" />
    </>
  ),
  gas: <path d="M12 3.5c3 3.3 5.5 6.3 5.5 10a5.5 5.5 0 0 1-11 0c0-2.2 1-3.9 2.3-5.4.3 1.6 1 2.6 2.1 3.1-.4-2.8.1-5.3 1.1-7.7Z" />,
  electric: (
    <>
      <path d="M9 17.5h6M9.8 20.5h4.4" />
      <path d="M9 17.5c0-2.3-3-3.9-3-7.5a6 6 0 0 1 12 0c0 3.6-3 5.2-3 7.5" />
    </>
  ),
  water: (
    <>
      <path d="M4 9.5h8.5a3 3 0 0 1 3 3V14" />
      <path d="M4 6.5v6M8 6.5V9.5M6 6.5h4" />
      <path d="M15.5 17.5c0 1.1-.7 2-1.5 2s-1.5-.9-1.5-2c0-.9 1.5-2.7 1.5-2.7s1.5 1.8 1.5 2.7Z" />
      <path d="M15.5 12.5H20" />
    </>
  ),
  bus: (
    <>
      <rect x="4.5" y="4" width="15" height="13.5" rx="2.5" />
      <path d="M4.5 11h15M8 17.5V20M16 17.5V20M8 7.2h8" />
      <circle cx="8" cy="14.3" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="16" cy="14.3" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  gift: (
    <>
      <rect x="4" y="9" width="16" height="4" rx="1" />
      <path d="M5.5 13v6.5h13V13M12 9v10.5" />
      <path d="M12 9c-1.2-3.6-5-4.4-5-2 0 1.4 2.4 2 5 2Zm0 0c1.2-3.6 5-4.4 5-2 0 1.4-2.4 2-5 2Z" />
    </>
  ),
  bank: (
    <>
      <path d="M3.5 9 12 4.5 20.5 9M5 9h14M5 19.5h14M3.5 21h17" />
      <path d="M7 11.5v5.5M10.3 11.5v5.5M13.7 11.5v5.5M17 11.5v5.5" />
    </>
  ),
  auction: (
    <>
      <path d="m13.5 4.5 6 6M10.5 7.5l6 6M12 6l-3.8 3.8M15 9l-3.8 3.8" />
      <path d="m9.7 11.3-5.7 5.7a1.5 1.5 0 0 0 2.1 2.1l5.7-5.7" />
      <path d="M14 20.5h6.5" />
    </>
  ),
  tax: (
    <>
      <path d="M12 3.5 19.5 12 12 20.5 4.5 12Z" />
      <path d="M12 8.5v7M10 10.2c0-1 .9-1.7 2-1.7s2 .6 2 1.5c0 2-4 1.2-4 3.3 0 .9.9 1.6 2 1.6s2-.7 2-1.7" />
    </>
  ),
  go: <path d="M20 12H4.5m0 0 5-5m-5 5 5 5" />,
  jail: (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="1.5" />
      <path d="M9 4.5v15M12 4.5v15M15 4.5v15" />
    </>
  ),
  parking: (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="3.5" />
      <path d="M10 16.5v-9h3a2.6 2.6 0 0 1 0 5.2h-3" />
    </>
  ),
  go_to_jail: (
    <>
      <path d="M3.5 12h8m0 0-3-3m3 3-3 3" />
      <rect x="13.5" y="5.5" width="7" height="13" rx="1" />
      <path d="M16 5.5v13M18.2 5.5v13" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5Z" fill="currentColor" />,
  pause: <path d="M8.5 5.5v13M15.5 5.5v13" strokeWidth="2.5" />,
  prev: <path d="M15 5.5 8.5 12l6.5 6.5" />,
  next: <path d="m9 5.5 6.5 6.5L9 18.5" />,
  first: <path d="M7 5.5v13M17 5.5 10.5 12l6.5 6.5" />,
  last: <path d="M17 5.5v13M7 5.5l6.5 6.5L7 18.5" />,
  up: <path d="m6.5 14.5 5.5-5.5 5.5 5.5" />,
  down: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  board: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M3.5 8h17M3.5 16h17M8 3.5v17M16 3.5v17" />
    </>
  ),
  chart: <path d="M4 19.5h16M6.5 16v-5M11 16V7M15.5 16v-3.5M20 16V9.5" />,
  replay: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 8.8v6.4l5.2-3.2Z" fill="currentColor" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M5.6 18.4l1.3-1.3M17.1 6.9l1.3-1.3" />
    </>
  ),
  moon: <path d="M19.5 14.2A7.8 7.8 0 0 1 9.8 4.5a7.8 7.8 0 1 0 9.7 9.7Z" />,
  rotate: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v3.2h-3.2" />
    </>
  ),
  zoom: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5M8 10.5h5M10.5 8v5" />
    </>
  ),
};

export type IconName = keyof typeof P;

/** icon inside an existing SVG (board) */
export function IconG({ name, x, y, size = 24, strokeWidth = 1.5 }: { name: string; x: number; y: number; size?: number; strokeWidth?: number }) {
  const s = size / 24;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="none" stroke="currentColor" strokeWidth={strokeWidth / s} strokeLinecap="round" strokeLinejoin="round">
      {P[name]}
    </g>
  );
}

/** standalone icon */
export function Icon({ name, size = 16, strokeWidth = 1.5, label }: { name: string; size?: number; strokeWidth?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {P[name]}
    </svg>
  );
}

export const spaceIcon = (type: string, name: string): string | null => {
  switch (type) {
    case 'chance': return 'chance';
    case 'community_chest': return 'community_chest';
    case 'station': return 'station';
    case 'utility': return /gas/i.test(name) ? 'gas' : /water|reservoir/i.test(name) ? 'water' : 'electric';
    case 'bus_ticket': return 'bus';
    case 'birthday_gift': return 'gift';
    case 'auction': return 'auction';
    case 'tax': return /bank/i.test(name) ? 'bank' : 'tax';
    case 'go': return 'go';
    case 'jail': return 'jail';
    case 'free_parking': return 'parking';
    case 'go_to_jail': return 'go_to_jail';
    default: return null;
  }
};
