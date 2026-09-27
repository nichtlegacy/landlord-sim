// How each edition looks on screen: printed labels and per-space art.
// The engine does not know about any of this; everything here is presentation.
import { spaceName } from '../engine/edition';
import type { Edition, Space } from '../engine/types';
import type { I18n, Lang } from './i18n';

export type LookKind = 'grand' | 'classic';

export interface Look {
  kind: LookKind;
  /** optional second line under a space name */
  subtitle: (i: number) => string | undefined;
}

/** printed labels (GO, JAIL, the card decks, ...) follow the UI language: board.* in src/ui/i18n */
export function lookFor(ed: Edition): Look {
  return { kind: ed.decks.bus.length > 0 ? 'grand' : 'classic', subtitle: () => undefined };
}

/** name printed on space i; open research gaps show as "unknown" */
export function printedName(ed: Edition, i: number, lang: Lang, t: I18n['t']) {
  const name = spaceName(ed, i, lang);
  return /^(unknown|unbekannt)/i.test(name) ? t('board.unknown') : name;
}

/** illustration key for a space (see ART_BOX in art.tsx); null = text only */
export function artFor(sp: Space, _look: Look): string | null {
  const n = sp.name;
  switch (sp.type) {
    case 'station': return 'station';
    case 'community_chest': return 'community_chest';
    case 'utility': return /gas/i.test(n) ? 'gas' : /wasser|water|reservoir/i.test(n) ? 'water' : 'electric';
    case 'bus_ticket': return 'bus';
    case 'birthday_gift': return 'gift';
    case 'auction': return 'auction';
    case 'tax': return /bank/i.test(n) ? 'bank' : /super|zusatz|luxury/i.test(n) ? 'ring' : 'cash';
    case 'free_parking': return 'car';
    case 'go_to_jail': return 'bobby';
    default: return null;
  }
}
