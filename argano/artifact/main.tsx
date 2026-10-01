// The standalone page of the two tools made for Argano: the choice and check of the geared machine, and the
// installation entered once, simulated in 3D, with its drawing set. The app's own components and engines run in the
// browser; nothing leaves the page and nothing is stored (the language and the tab are remembered on this device).
import { StrictMode, useCallback, useEffect, useState, type MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider, useTranslations } from 'use-intl';
import appIt from '../messages/it.json';
import appEn from '../messages/en.json';
import appBg from '../messages/bg.json';
import calcIt from '../messages/calc/it.json';
import calcEn from '../messages/calc/en.json';
import calcBg from '../messages/calc/bg.json';
import { PRESETS } from '@/calc/presets';
import { defaultLift, type LiftDerived, type LiftInputs } from '@/lib/lift';
import Calculator from '@/components/calc/Calculator';
import LiftWorkspace from '@/components/lift/LiftWorkspace';
import Sheets from './Sheets';

type Locale = 'it' | 'en' | 'bg';
type Tab = 'calcolo' | 'progetto';
const LOCALES: readonly Locale[] = ['it', 'en', 'bg'];
const MESSAGES = { it: { ...appIt, calc: calcIt }, en: { ...appEn, calc: calcEn }, bg: { ...appBg, calc: calcBg } } as const;

// the page's own words (the tools speak through the app's messages)
const SHELL: Record<Locale, { sub: string; tabs: Record<Tab, string>; calcTitle: string; calcLead: string; local: string; sheetsLead: string }> = {
  it: {
    sub: 'argano geared · progetto dell’impianto',
    tabs: { calcolo: 'Calcolo dell’argano', progetto: 'Progetto e simulazione 3D' },
    calcTitle: 'Scelta e verifica dell’argano geared',
    calcLead: 'Aderenza, funi, motore, freno, soccorso e albero, con l’argano esistente a confronto e la proposta di un argano nuovo. I risultati si aggiornano mentre scrivi.',
    local: 'Tutto si calcola nel tuo browser: nessun dato esce da questa pagina e niente viene salvato.',
    sheetsLead: 'Le tavole del progetto qui sopra, disegnate dal vivo con lo stesso nucleo del PDF dell’applicazione: un set non emesso, senza numero né logo.',
  },
  en: {
    sub: 'geared machine · installation design',
    tabs: { calcolo: 'Machine check', progetto: 'Design and 3D simulation' },
    calcTitle: 'Choice and check of the geared machine',
    calcLead: 'Traction, ropes, motor, brake, rescue and shaft, with the existing machine compared and a new machine proposed. The results update as you type.',
    local: 'Everything is computed in your browser: no data leaves this page and nothing is saved.',
    sheetsLead: 'The sheets of the design above, drawn live by the same kernel as the app’s PDF: an unissued set, without number or logo.',
  },
  bg: {
    sub: 'редукторна машина · проект на асансьора',
    tabs: { calcolo: 'Изчисление на машината', progetto: 'Проект и 3D симулация' },
    calcTitle: 'Избор и проверка на редукторната машина',
    calcLead: 'Сцепление, въжета, мотор, спирачка, евакуация и вал, със сравнение със старата машина и предложение за нова. Резултатите се обновяват, докато пишете.',
    local: 'Всичко се смята във вашия браузър: никакви данни не напускат страницата и нищо не се записва.',
    sheetsLead: 'Листовете на проекта отгоре, нарисувани на живо със същото ядро като PDF-а на приложението: неиздаден комплект, без номер и лого.',
  },
};

const isLocale = (x: unknown): x is Locale => typeof x === 'string' && (LOCALES as readonly string[]).includes(x);
const isTab = (x: unknown): x is Tab => x === 'calcolo' || x === 'progetto';

/** A per-device convenience: storage may be missing or refuse (private windows, previews). */
function remembered(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function remember(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* the page works without it */ }
}

function Mark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#1d3271" />
      <circle cx="32" cy="26" r="14" fill="none" stroke="#ffffff" strokeWidth="4" />
      <circle cx="32" cy="26" r="3.5" fill="#ffffff" />
      <path d="M18 26v24M46 26v14" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
      <rect x="11" y="46" width="14" height="10" rx="2" fill="#ffffff" />
      <rect x="41" y="38" width="10" height="12" rx="2" fill="#9db1ff" />
    </svg>
  );
}

function Tools({ locale, setLocale }: { locale: Locale; setLocale(l: Locale): void }) {
  const S = SHELL[locale], tl = useTranslations('lift'), tcm = useTranslations('common');
  const first = (): Tab => { const h = location.hash.slice(1); if (isTab(h)) return h; const r = remembered('argano.tab'); return isTab(r) ? r : 'calcolo'; };
  const [tab, setTab] = useState<Tab>(first);
  // a tool mounts the first time it is opened and then stays, with its data, while the other one is shown
  const [opened, setOpened] = useState<Record<Tab, boolean>>(() => ({ calcolo: tab === 'calcolo', progetto: tab === 'progetto' }));
  const [design, setDesign] = useState<{ inputs: LiftInputs; derived: LiftDerived } | null>(null);
  const onDerived = useCallback((inputs: LiftInputs, derived: LiftDerived) => setDesign({ inputs, derived }), []);
  const open = (next: Tab) => (e: MouseEvent<HTMLAnchorElement>): void => {
    e.preventDefault();
    setTab(next);
    setOpened((o) => ({ ...o, [next]: true }));
    remember('argano.tab', next);
    try { history.replaceState(null, '', `#${next}`); } catch { /* the hash is a convenience */ }
  };
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  return (
    <>
      <header className="topbar ar-top">
        <div className="inner">
          <a className="brand" href="#calcolo" onClick={open('calcolo')}><Mark /><b>Argano</b><span>{S.sub}</span></a>
          <nav className="nav ar-tabs" aria-label="Argano">
            {(['calcolo', 'progetto'] as const).map((k) => (
              <a key={k} href={`#${k}`} aria-current={tab === k ? 'page' : undefined} onClick={open(k)}>{S.tabs[k]}</a>
            ))}
          </nav>
          <nav className="langs" aria-label={tcm('language')}>
            {LOCALES.map((l) => (
              <a key={l} href={`#${tab}`} lang={l} aria-current={l === locale ? 'true' : undefined}
                onClick={(e) => { e.preventDefault(); setLocale(l); }}>{l.toUpperCase()}</a>
            ))}
          </nav>
        </div>
      </header>
      <main className="page page-wide">
        <div className="page-head">
          <div className="titles">
            <h1>{tab === 'calcolo' ? S.calcTitle : tl('workTitle')}</h1>
            <p className="lead">{tab === 'calcolo' ? S.calcLead : tl('workLead')}</p>
            <p className="note ar-local">{S.local}</p>
          </div>
        </div>
        {opened.calcolo ? (
          <div hidden={tab !== 'calcolo'}>
            <Calculator projectId="" initial={PRESETS.B} preset="B" brand="Argano" />
          </div>
        ) : null}
        {opened.progetto ? (
          <div hidden={tab !== 'progetto'} className="ar-lift">
            <LiftWorkspace projectId="" initial={defaultLift()} onDerived={onDerived} />
            {design ? <Sheets inputs={design.inputs} derived={design.derived} lead={S.sheetsLead} /> : null}
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
  const [locale, setLocale] = useState<Locale>(() => { const r = remembered('argano.lang'); return isLocale(r) ? r : 'it'; });
  const choose = (l: Locale): void => { setLocale(l); remember('argano.lang', l); };
  return (
    <IntlProvider locale={locale} messages={MESSAGES[locale]} timeZone="Europe/Rome">
      <Tools locale={locale} setLocale={choose} />
    </IntlProvider>
  );
}

const el = document.getElementById('argano');
if (el) createRoot(el).render(<StrictMode><Root /></StrictMode>);
