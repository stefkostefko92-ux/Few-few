import type { Capability } from '../auth/roles.js';

/**
 * Менюто на портала (собственикът, 10 ноември 2026 — проучването на менюто, избрано: групите, един „Nuovo“,
 * лентата долу на телефона и колоната на таблета). ЕДИНСТВЕНИЯТ списък: страничната лента, лентата долу,
 * страницата `/nuovo` и „Pagine“ в търсенето идват оттук. Групите са по това, какво е нещото (уредбата,
 * изчисленията, документите), не по отдела; създаването е действие — в „Nuovo“, не между страниците
 * (Apple HIG, Tab bars; NN/g, Menu-Design Checklist 2024). Чисто, без база.
 */

export interface VoceMenu {
  href: string;
  /** Ключът на надписа в речника. */
  key: string;
  icon: string;
  /** Брой за значката (новите заявки) — само ако е над нула. */
  count?: number;
  /** Кратко описание — на `/nuovo` и в търсенето. */
  descKey?: string;
}

export interface GruppoMenu {
  key: string;
  voci: VoceMenu[];
}

export interface Menu {
  gruppi: GruppoMenu[];
  /** Какво може да създаде човекът — „Nuovo“ и страницата `/nuovo`. */
  nuovo: VoceMenu[];
  /** Лентата долу (телефон) и колоната (таблет): до пет, „Menu“ е винаги последна. */
  rapidi: VoceMenu[];
}

type Can = (capability: Capability) => boolean;

interface Definizione extends VoceMenu {
  cap: Capability;
}

const GRUPPI: ReadonlyArray<{ key: string; voci: readonly Definizione[] }> = [
  {
    key: 'impianti',
    voci: [
      { href: '/schede', key: 'nav.schede', icon: 'sheet', cap: 'schede:read' },
      // Пратените поръчки към доставчиците (точка C2; routes/ordini-invio.ts).
      { href: '/ordini', key: 'nav.ordini', icon: 'mail', cap: 'schede:read' },
    ],
  },
  {
    key: 'calcoli',
    voci: [
      { href: '/calcolo-argano', key: 'nav.calcoloArgano', icon: 'calc', cap: 'schede:read' },
      {
        href: '/calcolo-limitatore',
        key: 'nav.calcoloLimitatore',
        icon: 'gauge',
        cap: 'schede:read',
      },
    ],
  },
  {
    key: 'documenti',
    voci: [
      { href: '/interventi', key: 'nav.interventi', icon: 'wrench', cap: 'interventi:read' },
      { href: '/buoni', key: 'nav.buoni', icon: 'buono', cap: 'interventi:read' },
      { href: '/verbali', key: 'nav.verbali', icon: 'sign', cap: 'interventi:read' },
      { href: '/cartelli', key: 'nav.cartelli', icon: 'stop', cap: 'interventi:read' },
    ],
  },
  {
    key: 'amministrazione',
    voci: [
      { href: '/utenti', key: 'nav.utenti', icon: 'users', cap: 'users:manage' },
      { href: '/impostazioni', key: 'nav.impostazioni', icon: 'settings', cap: 'aziende:settings' },
      { href: '/registro', key: 'nav.registro', icon: 'log', cap: 'audit:view' },
      { href: '/cestino', key: 'nav.cestino', icon: 'trash', cap: 'schede:trash' },
    ],
  },
  {
    key: 'master',
    voci: [
      { href: '/master', key: 'nav.console', icon: 'grid', cap: 'aziende:manage' },
      { href: '/aziende', key: 'nav.aziende', icon: 'building', cap: 'aziende:manage' },
      { href: '/richieste', key: 'requests.nav', icon: 'inbox', cap: 'requests:manage' },
      { href: '/master/contratti', key: 'nav.contratti', icon: 'seal', cap: 'aziende:manage' },
      {
        href: '/master/comunicazioni',
        key: 'nav.comunicazioni',
        icon: 'megaphone',
        cap: 'aziende:manage',
      },
      { href: '/master/verifica', key: 'nav.verifica', icon: 'shield', cap: 'aziende:manage' },
      {
        href: '/master/registri',
        key: 'nav.trattamenti',
        icon: 'clipboard',
        cap: 'aziende:manage',
      },
      { href: '/master/violazioni', key: 'nav.violazioni', icon: 'alert', cap: 'aziende:manage' },
    ],
  },
];

/** Какво се създава — в реда, в който се ползва в работата. */
const NUOVO: readonly Definizione[] = [
  {
    href: '/schede/nuova',
    key: 'nuovo.scheda',
    descKey: 'nuovo.schedaDesc',
    icon: 'sheet',
    cap: 'schede:write',
  },
  {
    href: '/interventi/nuovo',
    key: 'nuovo.intervento',
    descKey: 'nuovo.interventoDesc',
    icon: 'wrench',
    cap: 'interventi:write',
  },
  {
    href: '/buoni/nuovo',
    key: 'nuovo.buono',
    descKey: 'nuovo.buonoDesc',
    icon: 'buono',
    cap: 'interventi:write',
  },
  {
    href: '/verbali/nuovo',
    key: 'nuovo.verbale',
    descKey: 'nuovo.verbaleDesc',
    icon: 'sign',
    cap: 'interventi:write',
  },
  {
    href: '/cartelli/nuovo',
    key: 'nuovo.cartello',
    descKey: 'nuovo.cartelloDesc',
    icon: 'stop',
    cap: 'interventi:write',
  },
  {
    href: '/calcolo-argano/nuovo',
    key: 'nuovo.argano',
    descKey: 'nuovo.arganoDesc',
    icon: 'calc',
    cap: 'schede:write',
  },
  {
    href: '/calcolo-limitatore/nuovo',
    key: 'nuovo.limitatore',
    descKey: 'nuovo.limitatoreDesc',
    icon: 'gauge',
    cap: 'schede:write',
  },
];

const pulisci = ({ cap: _cap, ...voce }: Definizione): VoceMenu => voce;

/** Менюто на човека: само каквото може (проверката на всяка страница остава на сървъра). */
export function menuPer(can: Can, nuoveRichieste = 0): Menu {
  const gruppi = GRUPPI.map((gruppo) => ({
    key: gruppo.key,
    voci: gruppo.voci
      .filter((voce) => can(voce.cap))
      .map((voce) =>
        voce.href === '/richieste' && nuoveRichieste > 0
          ? { ...pulisci(voce), count: nuoveRichieste }
          : pulisci(voce),
      ),
  })).filter((gruppo) => gruppo.voci.length > 0);
  const nuovo = NUOVO.filter((voce) => can(voce.cap)).map(pulisci);
  const rapidi: VoceMenu[] = [];
  if (can('schede:read')) rapidi.push({ href: '/schede', key: 'nav.schede', icon: 'sheet' });
  if (can('interventi:read'))
    rapidi.push({ href: '/interventi', key: 'nav.interventi', icon: 'wrench' });
  if (nuovo.length > 0) rapidi.push({ href: '/nuovo', key: 'nav.nuovo', icon: 'plus' });
  rapidi.push({ href: '/cerca', key: 'nav.cerca', icon: 'search' });
  return { gruppi, nuovo, rapidi };
}

/**
 * Текущата точка между `hrefs`: най-дългият адрес, в който е страницата („/master/contratti“ —
 * „Contratti“, не „Console“; „/schede/<id>“ — „Schede“).
 */
export function correnteDi(hrefs: readonly string[], path: string): string | undefined {
  return hrefs
    .filter((href) => path === href || path.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

/** Текущата точка на лентата долу: създаването е „Nuovo“, иначе — най-дългият адрес. */
export function rapidoCorrente(menu: Menu, path: string): string | undefined {
  if (path === '/nuovo' || menu.nuovo.some((voce) => voce.href === path)) return '/nuovo';
  return correnteDi(
    menu.rapidi.map((voce) => voce.href),
    path,
  );
}
