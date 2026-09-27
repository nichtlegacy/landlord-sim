import { useCallback, useEffect, useMemo, useState } from 'react';
import { editionName } from '../engine/edition';
import { PROFILES } from '../engine/policy';
import { Board, BoardTools } from './Board';
import { previewGame, warnings } from './edit';
import { LANGS, profileName, scenarioLabel, useI18n, type Key } from './i18n';
import { Icon } from './icons';
import { EDITIONS, loadSetup, saveSetup, setupKey, tokenOf, type Setup } from './model';
import { ReplayView } from './ReplayView';
import { ResultsView } from './ResultsView';
import { ResultSummary } from './ResultSummary';
import { AgreementsCard } from './AgreementsCard';
import { PlayersPanel, RulesCard, SimControls, TableCard } from './SetupPanels';
import { SpacePopover } from './SpacePopover';
import { decodeSetup } from './share';
import { useSimulation } from './useSimulation';

type Tab = 'state' | 'result' | 'replay';
const TABS: [Tab, Key, string][] = [['state', 'app.tabs.state', 'board'], ['result', 'app.tabs.result', 'chart'], ['replay', 'app.tabs.replay', 'replay']];

type Theme = 'light' | 'dark';
const THEME_KEY = 'landlord:theme';

/** light unless dark was chosen; index.html applies it before the first paint */
function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')];
}

function useHashTab(): [Tab, (t: Tab) => void] {
  const read = () => (TABS.find(([t]) => `#${t}` === location.hash)?.[0] ?? 'state');
  const [tab, setTab] = useState<Tab>(read);
  useEffect(() => {
    const on = () => setTab(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [tab, (t) => { history.replaceState(null, '', `#${t}`); setTab(t); window.scrollTo({ top: 0 }); }];
}

export function App() {
  const [setup, setSetupRaw] = useState<Setup>(loadSetup);
  const [tab, setTab] = useHashTab();
  const [theme, toggleTheme] = useTheme();
  const { t, tp, lang, setLang } = useI18n();
  const [selected, setSelected] = useState<number | null>(null);
  const [zoom, setZoom] = useState(false);
  const sim = useSimulation();
  // board rotation in quarter turns, remembered per browser; counts up so each turn goes clockwise
  const [rotation, setRotation] = useState(() => Number(localStorage.getItem('landlord:rotation')) || 0);
  const rotate = () => setRotation((r) => { const next = r + 1; localStorage.setItem('landlord:rotation', String(next % 4)); return next; });

  // shared link (?s=...), read once so StrictMode's second effect run sees it too
  const [shareParam] = useState(() => new URLSearchParams(location.search).get('s'));
  const [shareError, setShareError] = useState<string | null>(null);
  const setSetup = useCallback((s: Setup) => { setSetupRaw(s); saveSetup(s); setShareError(null); }, []);
  const key = useMemo(() => setupKey(setup), [setup]);
  const stale = !!sim.result && sim.result.key !== key;
  const game = useMemo(() => previewGame(setup), [setup, lang]); // lang: its error text is translated
  const ed = EDITIONS[setup.editionId].edition;
  const names = setup.scenario.players.map((p) => p.name);
  const tokens = names.map((_, i) => tokenOf(setup, i));

  // page load: reuse the last simulation cached on the server instead of running again
  // a shared link replaces the stored setup
  useEffect(() => {
    const load = (s: Setup) => { if (!('error' in previewGame(s))) sim.load(s); };
    if (shareParam === null) { load(setup); return; }
    const url = new URL(location.href);
    url.searchParams.delete('s');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    decodeSetup(shareParam).then(
      (s) => { setSetup(s); load(s); },
      (e: unknown) => { setShareError(t('app.shareError', { error: e instanceof Error ? e.message : String(e) })); load(setup); },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = () => { if (!('error' in game)) sim.run(setup); };
  const caption = `${editionName(ed, lang)} · ${setup.houseRules.length ? tp('app.houseRules', setup.houseRules.length) : t('app.officialRules')} · ${[...new Set(setup.profiles)].map((p) => profileName(t, p, PROFILES[p].label)).join('/')}`;

  const view = useMemo(() => {
    const n = ed.spaces.length;
    const v = { owner: new Array(n).fill(-1), level: new Array(n).fill(0), depot: new Array(n).fill(false), mortgaged: new Array(n).fill(false) };
    for (const p of setup.scenario.properties) {
      v.owner[p.space] = p.owner; v.level[p.space] = p.level ?? 0; v.depot[p.space] = !!p.depot; v.mortgaged[p.space] = !!p.mortgaged;
    }
    return {
      ...v,
      pos: setup.scenario.players.map((p) => p.pos),
      inJail: setup.scenario.players.map((p) => !!p.inJail),
      out: setup.scenario.players.map(() => false),
    };
  }, [setup, ed]);

  const warn = [...(shareError ? [{ text: shareError }] : []), ...('error' in game ? [{ text: game.error }] : warnings(setup, game))];
  const summary = (
    <ResultSummary names={sim.result && !sim.live ? sim.result.setup.scenario.players.map((p) => p.name) : names}
      tokens={sim.result && !sim.live ? sim.result.setup.scenario.players.map((_, i) => tokenOf(sim.result!.setup, i)) : tokens}
      out={names.map(() => false)} stats={sim.result?.stats ?? null} live={sim.live} stale={stale}
      error={sim.error} caption={caption} onRun={run} onCancel={sim.cancel}
      controls={<SimControls setup={setup} onChange={setSetup} />} />
  );

  return (
    <div className="shell">
      <header className="header">
        <a className="brand" href="#state" onClick={(e) => { e.preventDefault(); setTab('state'); }}>
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 32 32" width="28" height="28"><path d="M8 15.5 16 8.5l8 7M10.5 14v9.5h11V14" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /><rect x="14.3" y="17.5" width="3.4" height="6" rx=".6" fill="#fff" /></svg>
          </span>
          <span>
            Landlord
            <span className="brand-sub">{editionName(ed, lang)} · {scenarioLabel(t, setup.scenario)}</span>
          </span>
        </a>
        <span className="header-spacer" />
        <div className="segmented lang-switch" role="group" aria-label={t('app.lang')}>
          {LANGS.map((l) => (
            <button key={l} lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
          ))}
        </div>
        <nav className="tabs" role="tablist" aria-label={t('app.view')}>
          {TABS.map(([id, label, icon]) => (
            <button key={id} className="tab" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              <Icon name={icon} size={16} />{t(label)}
            </button>
          ))}
        </nav>
        <button className="btn btn-ghost theme-btn" onClick={toggleTheme} aria-pressed={theme === 'dark'}
          aria-label={theme === 'dark' ? t('app.themeLight') : t('app.themeDark')} title={theme === 'dark' ? t('app.themeLight') : t('app.themeDark')}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
      </header>

      {tab === 'state' && (
        <>
        <main className="layout">
          <div className="board-stage">
            <div className="board-scroller" data-zoom={zoom}>
              <Board edition={ed} view={view} names={names} tokens={tokens} selected={selected} pot={setup.scenario.pot} busLeft={setup.scenario.busTicketsLeft} rotation={rotation}
                onSelect={(i) => setSelected(selected === i ? null : i)} />
            </div>
            {selected !== null && !('error' in game) && (
              <SpacePopover setup={setup} game={game} index={selected} onChange={setSetup} onClose={() => setSelected(null)} rotation={rotation} />
            )}
            <BoardTools hint={t('app.boardHint')} onRotate={rotate} zoom={zoom} onZoom={() => setZoom(!zoom)} />
            {warn.length > 0 && (
              <div className="section" style={{ marginTop: 16, gap: 6 }}>
                {warn.map((w, k) => <p key={k} className={`caption${w.level === 'info' ? '' : ' warn'}`}>{w.text}</p>)}
              </div>
            )}
          </div>
          <div className="side">
            {summary}
            <hr className="rule" />
            <PlayersPanel setup={setup} onChange={setSetup} />
          </div>
        </main>
        <div className="settings" aria-label={t('app.settings')}>
          <RulesCard setup={setup} onChange={setSetup} />
          <div className="settings-stack">
            <AgreementsCard setup={setup} onChange={setSetup} />
            <TableCard setup={setup} onChange={setSetup} />
          </div>
        </div>
        </>
      )}

      {tab === 'result' && (
        <main>
          <ResultsView setup={sim.result?.setup ?? setup} current={setup} onChange={setSetup} stats={sim.result?.stats ?? null} stale={stale} onRun={run} running={!!sim.live} />
        </main>
      )}

      {tab === 'replay' && (
        <main>
          <ReplayView setup={sim.result?.setup ?? setup} stats={sim.result?.stats ?? null} rotation={rotation} onRotate={rotate} />
        </main>
      )}
    </div>
  );
}
