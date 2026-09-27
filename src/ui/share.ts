// Share links (?s=) and strict validation of untrusted setups (links, JSON files).
import { PROFILES } from '../engine/policy';
import type { Edition } from '../engine/types';
import { spaceName } from '../engine/edition';
import { HOUSE_RULES } from '../house-rules';
import { i18n } from './i18n';
import { EDITIONS, type Setup } from './model';

type Obj = Record<string, unknown>;

const MAX_PARAM = 64 * 1024;
const MAX_TEXT = 512 * 1024;
const PROPERTY_TYPES = new Set(['street', 'station', 'utility']);
const RULE_IDS = new Set(HOUSE_RULES.map((h) => h.id));

function fail(msg: string): never {
  throw new Error(msg);
}
/** messages in the current UI language */
const t: ReturnType<typeof i18n>['t'] = (key, vars) => i18n().t(key, vars);
const nm = (ed: Edition, i: number) => spaceName(ed, i, i18n().lang);
const has = (o: object, k: unknown): k is string => typeof k === 'string' && Object.hasOwn(o, k);
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const obj = (x: unknown, what: string): Obj => (isObj(x) ? x : fail(t('v.missing', { what })));
const list = (x: unknown, what: string): unknown[] => (Array.isArray(x) ? x : fail(t('v.list', { what })));
const opt = <T>(x: unknown, f: (x: unknown) => T): T | undefined => (x === undefined ? undefined : f(x));
const int = (x: unknown, lo: number, hi: number, what: string): number =>
  Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi ? (x as number) : fail(t('v.int', { what, lo, hi }));
const amount = (x: unknown, what: string): number =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : fail(t('v.amount', { what }));
const bool = (x: unknown, what: string): boolean | undefined =>
  x === undefined || typeof x === 'boolean' ? x : fail(t('v.bool', { what }));
const str = (x: unknown, max: number, what: string): string => (typeof x === 'string' ? x.slice(0, max) : fail(t('v.text', { what })));

/** fresh object in raw's key order (setupKey, and so the result cache, depends on it); undefined values dropped */
function keep(raw: Obj, out: Obj): Obj {
  const res: Obj = {};
  for (const k of [...Object.keys(raw), ...Object.keys(out)])
    if (Object.hasOwn(out, k) && out[k] !== undefined && !Object.hasOwn(res, k)) res[k] = out[k];
  return res;
}

function player(raw: unknown, i: number, ed: Edition): Obj {
  const what = t('player.default', { n: i + 1 });
  const f = (key: Parameters<typeof t>[0]) => `${what}: ${t(key)}`;
  const p = obj(raw, what);
  const name = str(p.name, 1000, f('v.name')).trim().slice(0, 40);
  if (!name) fail(t('v.nameMissing', { what }));
  const cash = list(p.cash, f('v.cash'));
  if (cash.length !== 2) fail(t('v.cashRange', { what }));
  const [a, b] = cash.map((x) => amount(x, f('v.cash')));
  const goojf = opt(p.goojf, (x) => {
    const g = list(x, f('v.goojf'));
    if (g.length > 2 || g.some((d) => d !== 'chance' && d !== 'community_chest')) fail(t('v.goojfBad', { what }));
    return [...g];
  });
  return keep(p, {
    name,
    cash: [Math.min(a, b), Math.max(a, b)],
    pos: int(p.pos, 0, ed.spaces.length - 1, f('v.position')),
    inJail: bool(p.inJail, f('v.jail')),
    jailTurns: opt(p.jailTurns, (x) => int(x, 0, 10, f('v.jailTurns'))),
    goojf,
    busTickets: opt(p.busTickets, (x) => int(x, 0, ed.decks.bus.length, f('v.bus'))),
    token: opt(p.token, (x) => str(x, 40, f('v.token'))),
  });
}

function property(raw: unknown, k: number, ed: Edition, players: number, seen: Set<number>): Obj {
  const what = t('v.property', { n: k + 1 });
  const pr = obj(raw, what);
  const space = int(pr.space, 0, ed.spaces.length - 1, `${what}: ${t('v.space')}`);
  const sp = ed.spaces[space], name = nm(ed, space);
  const f = (key: Parameters<typeof t>[0]) => `${name}: ${t(key)}`;
  if (!PROPERTY_TYPES.has(sp.type)) fail(t('v.notProperty', { space: name }));
  if (seen.has(space)) fail(t('v.duplicate', { space: name }));
  seen.add(space);
  const owner = int(pr.owner, 0, players - 1, f('v.owner'));
  const level = opt(pr.level, (x) => int(x, 0, ed.maxLevel, f('v.level')));
  if (level && sp.type !== 'street') fail(t('v.housesStreets', { space: name }));
  const depot = bool(pr.depot, f('v.depot'));
  if (depot && sp.type !== 'station') fail(t('v.depotStations', { space: name }));
  const mortgaged = bool(pr.mortgaged, f('v.mortgage'));
  if (mortgaged && (level || depot)) fail(t('warn.mortgageBuilt', { space: name }));
  return keep(pr, { space, owner, level, depot, mortgaged });
}

function scope(x: unknown, ed: Edition, what: string): unknown {
  if (x === 'all' || x === 'stations' || x === 'utilities') return x;
  if (isObj(x) && has(ed.groups, x.group)) return { group: x.group };
  if (isObj(x) && Array.isArray(x.spaces)) return { spaces: x.spaces.map((s) => int(s, 0, ed.spaces.length - 1, `${what}: ${t('v.space')}`)) };
  return fail(t('v.scopeBad', { what }));
}

function agreement(raw: unknown, k: number, ed: Edition, players: number): Obj {
  const what = t('v.agreement', { n: k + 1 });
  const f = (key: Parameters<typeof t>[0]) => `${what}: ${t(key)}`;
  const a = obj(raw, what);
  const payer = int(a.payer, 0, players - 1, f('v.payer'));
  const pct = (x: unknown) => int(x, 0, 100, f('v.percent'));
  const note = opt(a.note, (x) => str(x, 200, f('v.note')));
  if (a.kind === 'joker') {
    return keep(a, {
      kind: 'joker', payer,
      owner: a.owner === null ? null : int(a.owner, 0, players - 1, f('v.counterpart')),
      uses: int(a.uses, 1, 1000, f('v.count')),
      percent: pct(a.percent),
      note,
    });
  }
  if (a.kind === 'rent') {
    return keep(a, {
      kind: 'rent', payer,
      owner: int(a.owner, 0, players - 1, f('v.owner')),
      scope: scope(a.scope, ed, what),
      maxAmount: opt(a.maxAmount, (x) => amount(x, f('v.maxAmount'))),
      percent: opt(a.percent, pct),
      note,
    });
  }
  return fail(t('v.kindBad', { what }));
}

/** strict check of an untrusted setup; throws with a short message (UI language) naming the first problem */
export function parseSetup(raw: unknown): Setup {
  const s = obj(raw, t('v.game'));
  if (!has(EDITIONS, s.editionId)) fail(t('v.editionBad', { id: String(s.editionId).slice(0, 40) }));
  const ed = EDITIONS[s.editionId].edition;

  const sc = obj(s.scenario, t('v.game'));
  const rawPlayers = list(sc.players, t('v.players'));
  if (rawPlayers.length < 2 || rawPlayers.length > 6) fail(t('v.playerCount'));
  const n = rawPlayers.length;
  const players = rawPlayers.map((p, i) => player(p, i, ed));
  const seen = new Set<number>();
  const properties = list(sc.properties, t('v.properties')).map((p, k) => property(p, k, ed, n, seen));
  const scenario = keep(sc, {
    id: sc.id === undefined ? 'import' : str(sc.id, 80, t('v.scenarioId')),
    label: sc.label === undefined ? 'Imported game' : str(sc.label, 80, t('v.scenarioName')),
    players,
    current: int(sc.current, 0, n - 1, t('v.current')),
    properties,
    pot: amount(sc.pot, t('v.pot')),
    busTicketsLeft: sc.busTicketsLeft == null ? null : int(sc.busTicketsLeft, 0, ed.decks.bus.length, t('v.busLeft')),
    agreements: opt(sc.agreements, (x) => list(x, t('v.agreements')).map((a, k) => agreement(a, k, ed, n))),
  });

  const houseRules = list(s.houseRules, t('v.houseRules')).map((id) => (typeof id === 'string' && RULE_IDS.has(id) ? id : fail(t('v.ruleBad', { id: String(id).slice(0, 20) }))));
  const amounts = opt(s.amounts, (x) => {
    const a = obj(x, t('v.amounts'));
    return keep(a, { goPass: amount(a.goPass, t('v.goPass')), goLand: amount(a.goLand, t('v.goLand')), jailFine: amount(a.jailFine, t('v.bail')) });
  });
  // boolean switches only; new ones (e.g. trade) pass through without a change here
  const continuation = opt(s.continuation, (x) => {
    const c = obj(x, t('v.cont'));
    const out: Obj = {};
    for (const k of Object.keys(c)) {
      if (!/^[a-z][a-zA-Z]{0,30}$/.test(k)) continue;
      if (typeof c[k] !== 'boolean') fail(t('v.bool', { what: `${t('v.cont')} ${k}` }));
      out[k] = c[k];
    }
    if (typeof out.buy !== 'boolean' || typeof out.build !== 'boolean') fail(t('v.contIncomplete'));
    return keep(c, out);
  });
  const profiles = list(s.profiles, t('v.styles')).map((p) => (has(PROFILES, p) ? p : fail(t('v.styleBad', { id: String(p).slice(0, 20) }))));
  if (profiles.length !== n) fail(t('v.styleCount'));
  const games = int(s.games, 100, 1_000_000, t('v.games'));
  const seed = Number.isSafeInteger(s.seed) ? s.seed : fail(t('v.seed'));

  return keep(s, {
    editionId: s.editionId, scenario, houseRules, amounts, continuation,
    rotateStart: bool(s.rotateStart, t('v.rotate')),
    profiles, games, seed,
  }) as unknown as Setup;
}

// ------------------------------------------------------------------ link encoding

const toB64url = (bytes: Uint8Array) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** inflated text, or null when it grows past MAX_TEXT (stops early, so a zip bomb never fills memory) */
async function inflate(bytes: Uint8Array): Promise<string | null> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_TEXT) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(await new Blob(chunks as BlobPart[]).arrayBuffer());
}

export async function encodeSetup(s: Setup): Promise<string> {
  const stream = new Blob([JSON.stringify(s)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return toB64url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

export async function decodeSetup(param: string): Promise<Setup> {
  if (param.length > MAX_PARAM) fail(t('link.tooLong'));
  if (!/^[A-Za-z0-9_-]+$/.test(param)) fail(t('link.broken'));
  let text: string | null;
  try {
    text = await inflate(fromB64url(param));
  } catch {
    return fail(t('link.broken'));
  }
  if (text === null) fail(t('link.tooBig'));
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail(t('link.unreadable'));
  }
  return parseSetup(raw);
}

export const shareUrl = async (s: Setup) => `${location.origin}${location.pathname}?s=${await encodeSetup(s)}#state`;
