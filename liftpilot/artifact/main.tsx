// The standalone page of the two tools of LiftPilot: the choice and check of the geared machine, and the
// installation entered once, simulated in 3D, with its drawing set. The app's own components and engines run in the
// browser; nothing leaves the page and nothing is stored (the tab is remembered on this device). Italian only.
import { StrictMode, useCallback, useRef, useState, type MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider, useTranslations } from 'use-intl';
import appIt from '../messages/it.json';
import calcIt from '../messages/calc/it.json';
import { PRESETS } from '@/calc/presets';
import { defaultLift, type LiftDerived, type LiftInputs } from '@/lib/lift';
import Calculator from '@/components/calc/Calculator';
import LiftWorkspace, { type WorkspaceApi } from '@/components/lift/LiftWorkspace';
import { LOGO_COMPACT as LOGO } from '@/lib/brand';
import { PANEV_LIST_PRICE } from '@/lib/catalog/panev-prices';
import Sheets from './Sheets';

// The standalone page shows Panev's 2026 list prices of its articles (public, VAT excluded): no company list here.
const PANEV_PRICES: Readonly<Record<string, number>> = Object.fromEntries(Object.entries(PANEV_LIST_PRICE).map(([code, eur]) => [`panev:${code}`, Math.round(eur * 100)]));

type Tab = 'calcolo' | 'progetto';
const MESSAGES = { ...appIt, calc: calcIt };

// the page's own words (the tools speak through the app's messages)
const SHELL: { sub: string; tabs: Record<Tab, string>; calcTitle: string; calcLead: string; local: string; sheetsLead: string } = {
  sub: 'argano geared · progetto dell’impianto',
  tabs: { calcolo: 'Calcolo dell’argano', progetto: 'Progetto e simulazione 3D' },
  calcTitle: 'Scelta e verifica dell’argano geared',
  calcLead: 'Aderenza, funi, motore, freno, soccorso e albero, con l’argano esistente a confronto e la proposta di un argano nuovo. I risultati si aggiornano mentre scrivi.',
  local: 'Tutto si calcola nel tuo browser: nessun dato esce da questa pagina e niente viene salvato.',
  sheetsLead: 'Le tavole del progetto qui sopra, disegnate dal vivo con lo stesso nucleo del PDF dell’applicazione: un set non emesso, senza numero né logo. Anche qui ogni quota si cambia con un clic.',
};
const isTab = (x: unknown): x is Tab => x === 'calcolo' || x === 'progetto';

/** A per-device convenience: storage may be missing or refuse (private windows, previews). */
function remembered(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function remember(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* the page works without it */ }
}

/** The page's files sit beside it: the site's absolute paths of the logo become relative. */
const beside = (s: string): string => s.replace(/(^|, )\//g, '$1');

function Tools() {
  const tl = useTranslations('lift'), tcm = useTranslations('common');
  const first = (): Tab => { const h = location.hash.slice(1); if (isTab(h)) return h; const r = remembered('liftpilot.tab'); return isTab(r) ? r : 'calcolo'; };
  const [tab, setTab] = useState<Tab>(first);
  // a tool mounts the first time it is opened and then stays, with its data, while the other one is shown
  const [opened, setOpened] = useState<Record<Tab, boolean>>(() => ({ calcolo: tab === 'calcolo', progetto: tab === 'progetto' }));
  const [design, setDesign] = useState<{ inputs: LiftInputs; derived: LiftDerived } | null>(null);
  const onDerived = useCallback((inputs: LiftInputs, derived: LiftDerived) => setDesign({ inputs, derived }), []);
  const work = useRef<WorkspaceApi>(null);
  const open = (next: Tab) => (e: MouseEvent<HTMLAnchorElement>): void => {
    e.preventDefault();
    setTab(next);
    setOpened((o) => ({ ...o, [next]: true }));
    remember('liftpilot.tab', next);
    try { history.replaceState(null, '', `#${next}`); } catch { /* the hash is a convenience */ }
  };
  return (
    <>
      <header className="topbar ar-top">
        <div className="inner">
          <a className="brand" href="#calcolo" onClick={open('calcolo')}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a static page without Next.js */}
            <img src={beside(LOGO.src)} srcSet={beside(LOGO.srcSet)} width={LOGO.width} height={LOGO.height} alt="LiftPilot" />
            <span>{SHELL.sub}</span>
          </a>
          <nav className="nav ar-tabs" aria-label="LiftPilot">
            {(['calcolo', 'progetto'] as const).map((k) => (
              <a key={k} href={`#${k}`} aria-current={tab === k ? 'page' : undefined} onClick={open(k)}>{SHELL.tabs[k]}</a>
            ))}
          </nav>
        </div>
      </header>
      <main className="page page-wide">
        <div className="page-head">
          <div className="titles">
            <h1>{tab === 'calcolo' ? SHELL.calcTitle : tl('workTitle')}</h1>
            <p className="lead">{tab === 'calcolo' ? SHELL.calcLead : tl('workLead')}</p>
            <p className="note ar-local">{SHELL.local}</p>
          </div>
        </div>
        {opened.calcolo ? (
          <div hidden={tab !== 'calcolo'}>
            <Calculator projectId="" initial={PRESETS.B} preset="B" brand="LiftPilot" />
          </div>
        ) : null}
        {opened.progetto ? (
          <div hidden={tab !== 'progetto'} className="ar-lift">
            <LiftWorkspace projectId="" initial={defaultLift()} onDerived={onDerived} api={work} prices={PANEV_PRICES} />
            {design ? <Sheets inputs={design.inputs} derived={design.derived} lead={SHELL.sheetsLead}
              onEdit={(e, length) => work.current?.edit(e, length) ?? { min: null, max: null }} /> : null}
          </div>
        ) : null}
      </main>
      <footer className="site-footer">
        <div className="inner">
          <span>{tcm('footerNote')}</span>
          <span>Created and Designed by <a href="https://carbonstealth.eu" target="_blank" rel="noopener">Carbon Stealth VCC</a></span>
        </div>
      </footer>
    </>
  );
}

function Root() {
  return (
    <IntlProvider locale="it" messages={MESSAGES} timeZone="Europe/Rome">
      <Tools />
    </IntlProvider>
  );
}

// the page has no <html> of its own (a static host or an Artifact wraps it): its language is set here
document.documentElement.lang = 'it';
const el = document.getElementById('liftpilot');
if (el) createRoot(el).render(<StrictMode><Root /></StrictMode>);
