import type React from 'react';
// Edit one space, laid out like a title deed: owner, buildings, mortgage, rent table.
// Special spaces explain what happens there; Bus Ticket and Free Parking are editable.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Game } from '../engine/game';
import type { Space } from '../engine/types';
import { ArtIcon, DepotIcon, LevelIcon, PlayerChip, TokenIcon } from './art';
import { cellBox, rotateBox } from './Board';
import { setProperty } from './edit';
import { artFor, lookFor, printedName } from './looks';
import { Icon } from './icons';
import { spaceName } from '../engine/edition';
import { levelName, useI18n } from './i18n';
import { GROUP_COLORS, playerColor, tokenOf, type Setup } from './model';

const DARK_TEXT = new Set(['light_blue', 'yellow', 'orange']);
export function SpacePopover({ setup, game, index, onChange, onClose, rotation = 0 }: {
  setup: Setup; game: Game; index: number; onChange: (s: Setup) => void; onClose: () => void; rotation?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ed = game.ed;
  const sp = ed.spaces[index];
  const sc = setup.scenario;
  const prop = sc.properties.find((p) => p.space === index);
  const owner = prop?.owner ?? -1;
  const level = prop?.level ?? 0;
  const names = sc.players.map((p) => p.name);
  const isProperty = sp.type === 'street' || sp.type === 'station' || sp.type === 'utility';
  const { t, lang, money } = useI18n();
  const fmtM = (n: number) => money(ed, n);
  const title = printedName(ed, index, lang, t);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (ref.current && !ref.current.contains(t) && !t.closest?.('.cell, .deck-btn')) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [onClose]);

  const pos = usePlacement(ref, index, ed.spaces.length, rotation);

  const set = (patch: Parameters<typeof setProperty>[2]) => onChange(setProperty(setup, index, patch));
  const currentRent = owner >= 0 && isProperty && !prop?.mortgaged ? game.rent(index, 7) : null;
  const group = sp.type === 'street' ? sp.group! : sp.type;
  const headStyle = sp.type === 'street'
    ? { background: GROUP_COLORS[sp.group!], color: DARK_TEXT.has(sp.group!) ? '#111' : '#fff' }
    : { background: 'var(--bg-muted)', color: 'var(--fg)' };
  const look = lookFor(ed);
  const art = artFor(sp, look);
  const sub = look.subtitle(index);

  return (
    <div ref={ref} className={`popover deed${isProperty ? ' deed-wide' : ''}`} role="dialog" aria-label={title}
      style={pos ? { left: pos.left, top: pos.top, transformOrigin: pos.origin } : { visibility: 'hidden' }}>
      <div className="deed-head" style={headStyle}>
        {art && <div className="deed-art"><ArtIcon name={art} size={34} /></div>}
        <h3>{title}</h3>
        {sub && <p className="deed-sub">{sub}</p>}
        <button className="btn btn-ghost btn-sm btn-icon deed-close" onClick={onClose} aria-label={t('common.close')}><Icon name="close" /></button>
      </div>
      <HereRow setup={setup} game={game} index={index} />

      {!isProperty ? (
        <SpecialSpace setup={setup} game={game} sp={sp} onChange={onChange} />
      ) : (
        <div className="deed-body">
        <div className="deed-col">
          <div className="deed-facts">
            <Fact label={t('deed.price')} value={fmtM(sp.price!)} />
            {sp.houseCost ? <Fact label={t('deed.perBuilding')} value={fmtM(sp.houseCost)} /> : sp.depotCost ? <Fact label={t('deed.depot')} value={fmtM(sp.depotCost)} /> : <Fact label={t('deed.space')} value={String(index)} />}
            <Fact label={t('deed.mortgage')} value={fmtM(sp.mortgage!)} />
          </div>

          <div className="field">
            <span className="label">{t('deed.owner')}</span>
            <div className="segmented owner-seg">
              <button aria-pressed={owner < 0} onClick={() => set(null)}><BankChip size={18} />{t('common.bank')}</button>
              {names.map((n, i) => (
                <button key={i} aria-pressed={owner === i} onClick={() => set({ owner: i })}>
                  <PlayerChip i={i} token={tokenOf(setup, i)} size={18} />{n}
                </button>
              ))}
            </div>
          </div>

          {sp.type === 'street' && owner >= 0 && (
            <div className="field">
              <span className="label">{t('deed.buildings')} <span className="muted" style={{ fontWeight: 400 }}>· {levelName(t, level)}</span></span>
              <div className="segmented level-seg">
                {Array.from({ length: ed.maxLevel + 1 }, (_, k) => levelName(t, k)).map((l, k) => (
                  <button key={k} aria-pressed={level === k} disabled={!!prop?.mortgaged && k > 0} onClick={() => set({ level: k })} title={l} aria-label={l}>
                    <LevelIcon level={k} size={k >= 5 ? 20 : 15} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {owner >= 0 && (
            <div className="deed-toggles">
              {sp.type === 'station' && ed.supply.depots > 0 && (
                <label className="check">
                  <input type="checkbox" checked={!!prop?.depot} disabled={!!prop?.mortgaged} onChange={(e) => set({ depot: e.target.checked })} />
                  <DepotIcon size={16} /><span>{t('deed.depot')} <span className="caption">{t('deed.depotDoubles')}</span></span>
                </label>
              )}
              <label className="check">
                <input type="checkbox" checked={!!prop?.mortgaged} disabled={level > 0 || !!prop?.depot}
                  onChange={(e) => set({ mortgaged: e.target.checked })} />
                <span>{t('deed.mortgage')} <span className="caption">{level > 0 || prop?.depot ? t('deed.sellFirst') : t('deed.mortgageBrings', { amount: fmtM(sp.mortgage!) })}</span></span>
              </label>
            </div>
          )}

          {currentRent !== null && (
            <div className="deed-due">
              <span>{t('deed.due')}{sp.type === 'utility' ? t('deed.dueAt7') : ''}</span>
              <strong className="num">{fmtM(currentRent)}</strong>
            </div>
          )}
          {prop?.mortgaged && <div className="deed-due warn"><span>{t('deed.mortgaged')}</span><strong>{t('deed.noRent')}</strong></div>}
        </div>
        <div className="deed-col">
          <RentTable game={game} sp={sp} level={level} depot={!!prop?.depot} owned={owner >= 0} />
          <GroupList setup={setup} game={game} group={group} index={index} />
        </div>
        </div>
      )}
    </div>
  );
}

/**
 * Place the popover beside its space and fully inside the board: above/below spaces of the
 * bottom/top row, left/right of the side columns. Measured after render, so every size fits.
 */
function usePlacement(ref: React.RefObject<HTMLDivElement | null>, index: number, n: number, rotation: number) {
  const [pos, setPos] = useState<{ left: number; top: number; origin: string } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const stage = el?.closest('.board-stage');
    const board = stage?.querySelector('.board-wrap');
    if (!el || !stage || !board) return;
    const place = () => {
      // phones: CSS turns the popover into a bottom sheet, nothing to place
      if (getComputedStyle(el).position === 'fixed') { setPos({ left: 0, top: 0, origin: 'bottom center' }); return; }
      const s = stage.getBoundingClientRect(), b = board.getBoundingClientRect();
      const k = b.width / 1000, cb = rotateBox(cellBox(index, n), rotation);
      const cell = { x: b.left - s.left + cb.x * k, y: b.top - s.top + cb.y * k, w: cb.w * k, h: cb.h * k };
      const pw = el.offsetWidth, ph = el.offsetHeight, gap = 8;
      const minX = b.left - s.left + gap, maxX = b.right - s.left - pw - gap;
      const minY = b.top - s.top + gap, maxY = Math.max(minY, b.bottom - s.top - ph - gap);
      const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
      let left: number, top: number;
      if (cb.side === 0 || cb.side === 2) {
        left = clamp(cell.x + cell.w / 2 - pw / 2, minX, maxX);
        top = cb.side === 0 ? cell.y - ph - gap : cell.y + cell.h + gap;
      } else {
        top = clamp(cell.y + cell.h / 2 - ph / 2, minY, maxY);
        left = cb.side === 1 ? cell.x + cell.w + gap : cell.x - pw - gap;
      }
      top = clamp(top, minY, maxY);
      left = clamp(left, minX, maxX);
      const ox = clamp(cell.x + cell.w / 2 - left, 0, pw), oy = clamp(cell.y + cell.h / 2 - top, 0, ph);
      setPos({ left, top, origin: `${ox}px ${oy}px` });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el); ro.observe(board);
    return () => ro.disconnect();
  }, [ref, index, n, rotation]);
  return pos;
}

function BankChip({ size }: { size: number }) {
  return <span className="chip bank-chip" style={{ width: size, height: size }} aria-hidden><Icon name="bank" size={Math.round(size * 0.7)} strokeWidth={2} /></span>;
}

/** who stands on this space, as the same badges as in the colour group; jail splits inmates and visitors */
function HereRow({ setup, game, index }: { setup: Setup; game: Game; index: number }) {
  const players = setup.scenario.players.map((p, i) => ({ p, i })).filter(({ p }) => p.pos === index);
  if (!players.length) return null;
  const max = game.rules.jail.maxRollAttempts;
  const { t } = useI18n();
  const badge = ({ p, i }: (typeof players)[number], meta?: string, title?: string) => (
    <span key={i} className="owner-badge" style={{ background: playerColor(i) }} title={title ?? p.name}>
      <TokenIcon id={tokenOf(setup, i)} size={13} hole={playerColor(i)} />{p.name}
      {meta && <span className="badge-meta">{meta}</span>}
    </span>
  );
  const group = (label: string, list: typeof players, jailed = false) => list.length > 0 && (
    <div className="deed-here-group">
      <span className="caption">{label}</span>
      <div className="badge-row">
        {list.map((x) => (jailed && max
          ? badge(x, `${x.p.jailTurns ?? 0}/${max}`, t('deed.tries', { name: x.p.name, used: x.p.jailTurns ?? 0, max }))
          : badge(x)))}
      </div>
    </div>
  );
  const sp = game.ed.spaces[index];
  return (
    <div className="deed-here">
      {sp.type === 'jail'
        ? <>{group(t('deed.inJail'), players.filter(({ p }) => p.inJail), true)}{group(t('deed.visiting'), players.filter(({ p }) => !p.inJail))}</>
        : group(t('deed.onSpace'), players)}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="deed-fact"><span className="caption">{label}</span><strong className="num">{value}</strong></div>;
}

function RentTable({ game, sp, level, depot, owned }: { game: Game; sp: Space; level: number; depot: boolean; owned: boolean }) {
  const { allButOne, all } = game.rules.unimprovedMultiplier;
  const { t, tp, money } = useI18n();
  const fmtM = (n: number) => money(game.ed, n);
  let rows: { icon: React.ReactNode; label: string; value: string; on: boolean }[] = [];
  if (sp.type === 'street') {
    rows = sp.rent!.map((r, k) => ({
      icon: <LevelIcon level={k} size={k >= 5 ? 18 : 13} />,
      label: k === 0 ? t('deed.site') : levelName(t, k),
      value: fmtM(r), on: owned && k === level,
    }));
  }
  if (sp.type === 'station') {
    const n = owned ? game.ownedIn(game.s.owner[sp.index], 'station') : 0;
    rows = sp.rent!.map((r, k) => ({
      icon: <span className="deed-count">{k + 1}</span>, label: tp('deed.stations', k + 1),
      value: depot ? fmtM(r * 2) : game.ed.supply.depots ? t('deed.withDepot', { amount: fmtM(r), depot: fmtM(r * 2) }) : fmtM(r), on: owned && k + 1 === n,
    }));
  }
  if (sp.type === 'utility') {
    const n = owned ? game.ownedIn(game.s.owner[sp.index], 'utility') : 0;
    rows = sp.utilityMultiplier!.map((m, k) => ({
      icon: <span className="deed-count">{k + 1}</span>, label: tp('deed.utilities', k + 1), value: t('deed.dice', { m }), on: owned && k + 1 === n,
    }));
  }
  return (
    <div className="deed-rent">
      <table className="table">
        <tbody>
          {rows.map((r, k) => (
            <tr key={k} data-on={r.on}>
              <td className="deed-icon">{r.icon}</td>
              <td>{r.label}</td>
              <td className="n">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sp.type === 'street' && (
        <p className="caption">{t('deed.unimproved', { partial: allButOne > 1 ? t('deed.partial', { m: allButOne }) : '', all })}</p>
      )}
    </div>
  );
}

function GroupList({ setup, game, group, index }: { setup: Setup; game: Game; group: string; index: number }) {
  const members = game.members[group] ?? [];
  if (members.length < 2) return null;
  const sc = setup.scenario;
  const { t, lang } = useI18n();
  return (
    <div className="deed-group">
      <span className="caption">{group === 'station' ? t('deed.allStations') : group === 'utility' ? t('deed.allUtilities') : t('deed.colourGroup')}</span>
      <ul>
        {members.map((i) => {
          const p = sc.properties.find((x) => x.space === i);
          return (
            <li key={i} data-self={i === index}>
              <span className="deed-dot" style={{ background: GROUP_COLORS[game.ed.spaces[i].group ?? ''] ?? 'var(--fg-faint)' }} />
              <span className="deed-gname">{spaceName(game.ed, i, lang)}</span>
              {p && (p.level ?? 0) > 0 && <LevelIcon level={p.level!} size={p.level! >= 5 ? 14 : 10} />}
              {p?.depot && <DepotIcon size={13} />}
              {p?.mortgaged && <span className="caption warn">{t('deed.mortgagedShort')}</span>}
              {p ? (
                <span className="owner-badge" style={{ background: playerColor(p.owner) }}>
                  <TokenIcon id={tokenOf(setup, p.owner)} size={13} hole={playerColor(p.owner)} />{sc.players[p.owner]?.name}
                </span>
              ) : <span className="owner-badge bank"><Icon name="bank" size={12} strokeWidth={2} />{t('common.bank')}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SpecialSpace({ setup, game, sp, onChange }: { setup: Setup; game: Game; sp: Space; onChange: (s: Setup) => void }) {
  const sc = setup.scenario;
  const ed = game.ed;
  const total = ed.decks.bus.length;
  const left = sc.busTicketsLeft ?? total;
  const setBus = (v: number) => onChange({ ...setup, scenario: { ...sc, busTicketsLeft: Math.max(0, Math.min(total, v)) } });
  const held = sc.players.map((p, i) => ({ p, i })).filter(({ p }) => (p.busTickets ?? 0) > 0);
  const tr = useI18n();
  const { t } = tr;
  return (
    <>
      <p className="deed-text">{describe(sp, game, tr)}</p>
      {(sp.type === 'bus_ticket' || sp.type === 'birthday_gift') && total > 0 && (
        <div className="deed-box">
          <div className="deed-box-row">
            <span className="label">{t('deed.busStack')}</span>
            <span className="stepper">
              <button className="btn btn-sm btn-icon" onClick={() => setBus(left - 1)} disabled={left <= 0} aria-label={t('deed.busLess')}>−</button>
              <strong className="num">{left}</strong>
              <button className="btn btn-sm btn-icon" onClick={() => setBus(left + 1)} disabled={left >= total} aria-label={t('deed.busMore')}><Icon name="plus" size={14} /></button>
            </span>
          </div>
          <div className="ticket-meter" aria-hidden>
            {Array.from({ length: total }, (_, k) => <span key={k} data-on={k < left} />)}
          </div>
          <p className="caption">
            {left === 0 ? t('deed.busGone') : t('deed.busLeft', { left, total })}
            {held.length > 0 && t('deed.busHeld', { list: held.map(({ p }) => `${p.name} ${p.busTickets}`).join(', ') })}
          </p>
        </div>
      )}
      {sp.type === 'free_parking' && (
        <div className="deed-box">
          <div className="deed-box-row">
            <span className="label">{t('deed.pot')}</span>
            <span className="money" style={{ width: 120 }}><span>{tr.currency(ed)}</span>
              <input className="input" type="number" min={0} step={10} value={sc.pot}
                onChange={(e) => onChange({ ...setup, scenario: { ...sc, pot: Math.max(0, Number(e.target.value) || 0) } })} />
            </span>
          </div>
          <p className="caption">{game.rules.freeParkingPot ? t('deed.potOn') : t('deed.potOff')}</p>
        </div>
      )}
    </>
  );
}

function describe(sp: Space, game: Game, { t, money }: ReturnType<typeof useI18n>) {
  const r = game.rules;
  const fmtM = (n: number) => money(game.ed, n);
  switch (sp.type) {
    case 'tax': return t('space.tax', { amount: fmtM(sp.amount!), pot: r.freeParkingPot ? t('space.taxPot') : '' });
    case 'chance': return t('space.chance');
    case 'community_chest': return t('space.community_chest');
    case 'auction': return (r.auctionSpaceOptional ? t('space.auctionOptional') : t('space.auctionMust')) + t('space.auctionNone');
    case 'birthday_gift': return t('space.gift', { amount: fmtM(sp.amount ?? 100) });
    case 'bus_ticket': return t('space.bus');
    case 'go_to_jail': return t('space.goToJail');
    case 'free_parking': return t('space.freeParking');
    case 'go': return t('space.go', { amount: fmtM(r.goSalary), land: r.goLandTotal ? t('space.goLand', { amount: fmtM(r.goLandTotal) }) : '' });
    case 'jail': return t('space.jail', { amount: fmtM(r.jail.fine) });
    default: return '';
  }
}
