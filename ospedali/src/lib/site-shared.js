// @ts-check
// Споделени чисти помощници и константи за генератора на сайта, ползвани от
// много render модули (regioni/appalti/inchiesta/legal/fornitori) и от
// build-site.js. Изнесени дословно от build-site.js — само местене, без промяна
// на логика (пази 1:1 генерирания сайт).

import { esc } from './format.js';
import { anniConCe, CE_FORENSICS } from './dataset.js';
import { siteUrl } from './site-ui.js';

/** @typedef {import('./dataset.js').Ente} Ente */
/** @typedef {import('./dataset.js').SerieAnno} SerieAnno */

// Валидна италианска P.IVA: 11 цифри, не всички еднакви (00000000000 минава
// контролната сума, но е плейсхолдър), с коректна контролна цифра (Luhn-подобна).
// Пази профилите на изпълнителите от боклучави CF-ове от източника.
/**
 * @param {string} cf
 * @returns {boolean}
 */
export function pIvaValida(cf) {
  if (!/^[0-9]{11}$/.test(cf)) return false;
  if (/^(\d)\1{10}$/.test(cf)) return false;
  let somma = 0;
  for (let i = 0; i < 11; i++) {
    let n = cf.charCodeAt(i) - 48;
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    somma += n;
  }
  return somma % 10 === 0;
}

/** @type {Record<string, string>} */
export const REGOLE_LABEL = {
  disavanzo_grave: 'Disavanzo grave',
  disavanzo_persistente: 'Disavanzo persistente',
  patrimonio_netto_negativo: 'Patrimonio netto negativo',
  debiti_oltre_attivo: 'Debiti oltre l’attivo',
  squilibrio_strutturale: 'Squilibrio costi/ricavi',
  salto_ricavi: 'Variazione anomala ricavi',
  salto_costi: 'Variazione anomala costi',
  personale_elevato: 'Incidenza personale elevata',
  crescita_debiti: 'Crescita dell’indebitamento',
  buco_rendicontazione: 'Buco nella rendicontazione',
  risultato_arrotondato: 'Risultato “troppo tondo”',
};

// Региони под „piano di rientro" (оздравителен план) към 07.2026 — проверено
// от salute.gov.it/tema/piani-di-rientro (комисарствани: Calabria, Molise).
// Регионите на SSN (20 административни региона). Ключ = страница/файл; `istat` =
// код за географската карта (ISTAT граници); `prefissi` = кодовете codice_regione
// от финансите (Трентино-Алто Адидже обединява двете авт. провинции 041+042);
// `anac` = имената в ANAC регионалния изглед (за join). Карта = истинска
// географска (inline SVG от ISTAT граници, CC BY 4.0), не схематична.
/** @type {Record<string, import('./models.js').RegioneMeta>} */
export const REGIONI = {
  '010': { abbr: 'PIE', nome: 'Piemonte', istat: '01', prefissi: ['010'], anac: ['PIEMONTE'] },
  '020': { abbr: 'VDA', nome: "Valle d'Aosta", istat: '02', prefissi: ['020'], anac: ["VALLE D'AOSTA"] },
  '030': { abbr: 'LOM', nome: 'Lombardia', istat: '03', prefissi: ['030'], anac: ['LOMBARDIA'] },
  taa: { abbr: 'TAA', nome: 'Trentino-Alto Adige / Südtirol', istat: '04', prefissi: ['041', '042'], anac: ['PROVINCIA AUTONOMA DI BOLZANO', 'PROVINCIA AUTONOMA DI TRENTO'] },
  '050': { abbr: 'VEN', nome: 'Veneto', istat: '05', prefissi: ['050'], anac: ['VENETO'] },
  '060': { abbr: 'FVG', nome: 'Friuli-Venezia Giulia', istat: '06', prefissi: ['060'], anac: ['FRIULI VENEZIA GIULIA'] },
  '070': { abbr: 'LIG', nome: 'Liguria', istat: '07', prefissi: ['070'], anac: ['LIGURIA'] },
  '080': { abbr: 'EMR', nome: 'Emilia-Romagna', istat: '08', prefissi: ['080'], anac: ['EMILIA ROMAGNA'] },
  '090': { abbr: 'TOS', nome: 'Toscana', istat: '09', prefissi: ['090'], anac: ['TOSCANA'] },
  '100': { abbr: 'UMB', nome: 'Umbria', istat: '10', prefissi: ['100'], anac: ['UMBRIA'] },
  '110': { abbr: 'MAR', nome: 'Marche', istat: '11', prefissi: ['110'], anac: ['MARCHE'] },
  '120': { abbr: 'LAZ', nome: 'Lazio', istat: '12', prefissi: ['120'], anac: ['LAZIO'] },
  '130': { abbr: 'ABR', nome: 'Abruzzo', istat: '13', prefissi: ['130'], anac: ['ABRUZZO'] },
  '140': { abbr: 'MOL', nome: 'Molise', istat: '14', prefissi: ['140'], anac: ['MOLISE'] },
  '150': { abbr: 'CAM', nome: 'Campania', istat: '15', prefissi: ['150'], anac: ['CAMPANIA'] },
  '160': { abbr: 'PUG', nome: 'Puglia', istat: '16', prefissi: ['160'], anac: ['PUGLIA'] },
  '170': { abbr: 'BAS', nome: 'Basilicata', istat: '17', prefissi: ['170'], anac: ['BASILICATA'] },
  '180': { abbr: 'CAL', nome: 'Calabria', istat: '18', prefissi: ['180'], anac: ['CALABRIA'] },
  '190': { abbr: 'SIC', nome: 'Sicilia', istat: '19', prefissi: ['190'], anac: ['SICILIA'] },
  '200': { abbr: 'SAR', nome: 'Sardegna', istat: '20', prefissi: ['200'], anac: ['SARDEGNA'] },
};
// Региони под „piano di rientro" (оздравителен план) към 07.2026 — проверено
// от salute.gov.it/tema/piani-di-rientro (комисарствани: Calabria, Molise).
/** @type {Record<string, string>} */
export const PIANO_RIENTRO = {
  '130': 'piano', '180': 'commissariata', '150': 'piano', '120': 'piano',
  '140': 'commissariata', '160': 'piano', '190': 'piano',
};

// codice_regione (3 цифри) → ключ на региона (Трентино: 041/042 → 'taa')
/** @type {Record<string, string>} */
export const REG_KEY = {};
for (const [key, m] of Object.entries(REGIONI)) for (const p of m.prefissi) REG_KEY[p] = key;

/**
 * Последната година с CE данни и нейната серия за структурата.
 * @param {Ente} ente
 * @returns {{ anno: number|null, y: SerieAnno }}
 */
export function ultimoCe(ente) {
  const anni = anniConCe(ente);
  return anni.length ? { anno: anni.at(-1) ?? null, y: ente.serie.get(anni.at(-1) ?? 0) ?? {} } : { anno: null, y: {} };
}

// Дата на снапшота на данните (от validazione) — за Article схемата, видимите
// „Dati aggiornati al…" редове и sitemap lastmod. Задава се от build-site.js чрез
// setDataSnapshot() в точния момент (преди рендерите, които го ползват).
let DATA_SNAPSHOT = '';
/**
 * @param {string} v
 * @returns {void}
 */
export function setDataSnapshot(v) {
  DATA_SNAPSHOT = v;
}

// Article JSON-LD за разследващите страници (E-E-A-T: автор, дата, източници)
// Етикет за диапазон години: [2023,2024,2025] → „2023–2025" (не join на всички).
/**
 * @param {number[]|null|undefined} a
 * @returns {string}
 */
export function rangeAnni(a) {
  if (!a || !a.length) return '';
  return a.length === 1 ? String(a[0]) : `${a[0]}–${a[a.length - 1]}`;
}

/**
 * @param {string} titolo
 * @param {string} descrizione
 * @param {string} percorso
 * @returns {Record<string, unknown>|null}
 */
export function articleLd(titolo, descrizione, percorso) {
  const su = siteUrl();
  if (!su) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: titolo,
    description: descrizione,
    inLanguage: 'it',
    datePublished: DATA_SNAPSHOT,
    dateModified: DATA_SNAPSHOT,
    mainEntityOfPage: `${su}/${percorso}`,
    author: { '@type': 'Organization', name: 'Carbon Stealth VCC', url: 'https://carbonstealth.eu' },
    publisher: { '@id': `${su}/#org` },
    isBasedOn: ['https://dati.anticorruzione.it/opendata', 'https://openbdap.rgs.mef.gov.it/it/SSN/Analizza', 'https://www.dati.salute.gov.it/'],
  };
}

// Видим ред за свежест на данните (AEO/E-E-A-T)
export function rigaAggiornamento() {
  return DATA_SNAPSHOT
    ? `<p class="small muted">Dati aggiornati al ${esc(DATA_SNAPSHOT)} · Fonti: ANAC, BDAP/RGS-MEF, Ministero della Salute.</p>`
    : '';
}

// Комбиниран граф Article + BreadcrumbList за подстраниците на „Approfondimenti“.
/**
 * @param {string} titolo
 * @param {string} descrizione
 * @param {string} percorso
 * @param {string} nome
 * @returns {Record<string, unknown>|null}
 */
export function pagLd(titolo, descrizione, percorso, nome) {
  const a = articleLd(titolo, descrizione, percorso);
  const b = briciole([['Home', '/'], ['Approfondimenti', 'approfondimenti.html'], [nome, percorso]]);
  const nodi = [a, b].filter(Boolean);
  return nodi.length ? { '@context': 'https://schema.org', '@graph': nodi } : null;
}

// BreadcrumbList JSON-LD (за дълбоките страници)
/**
 * @param {Array<[string, string]>} items двойки [име, път]
 * @returns {Record<string, unknown>|null}
 */
export function briciole(items) {
  const su = siteUrl();
  if (!su) return null;
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([nome, percorso], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: nome,
      item: percorso === '/' ? `${su}/` : `${su}/${percorso}`,
    })),
  };
}

export const FOR_LABEL = Object.fromEntries(CE_FORENSICS.map((c) => [c.key, c.label]));

/**
 * @param {string} desc
 * @returns {boolean}
 */
export function isDetailLine(desc) {
  const d = desc.trim();
  return (
    /^[A-Z]\)(\s|$)/.test(d) ||
    /^[A-Z]\.\d+\)(\s|$)/i.test(d) ||
    /^[A-Z]\.\d+\.[A-Z]\)(\s|$)/i.test(d) ||
    /^totale/i.test(d) ||
    /^risultato/i.test(d)
  );
}
/**
 * @param {string} desc
 * @returns {boolean}
 */
export function isTopLevelSp(desc) {
  const d = desc.trim();
  return /^[A-G]\)\s/.test(d) || /totale/i.test(d);
}
