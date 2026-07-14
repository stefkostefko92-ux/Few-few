// Генерира статичен сайт на италиански от финансовите данни и сигналите:
//  site/index.html          — начало: национални KPI + топ сигнали
//  site/strutture.html      — всички структури с филтър/търсене (vanilla JS)
//  site/segnalazioni.html   — всички сигнали с филтри
//  site/metodologia.html    — метод, източници, disclaimer
//  site/struttura/<cod>.html — детайл за структура (SVG графики + финанси + сигнали)
// Нула зависимости, нула външни ресурси.

import { join } from 'node:path';
import { mkdir, writeFile, rm, readFile, stat, copyFile } from 'node:fs/promises';
import { SITE_DIR, ROOT } from './lib/paths.js';
import { loadDataset, tipoEnte, anniConCe, postiLettoEnte, ricoveriEnte, CE_INDICATORS, SP_INDICATORS, CE_FORENSICS } from './lib/dataset.js';
import { readJson } from './lib/http.js';
import { SEGNALAZIONI_FILE, DATA_DIR } from './lib/paths.js';
import { join as pjoin } from 'node:path';
import { matchAutoritaEnti } from './lib/match.js';
import { euroIt, euroCompact, numeroIt, percentualeIt, slugify, esc } from './lib/format.js';
import { page, kpi, badge, lineChart, barChart, hbars, setSiteUrl, siteUrl } from './lib/site-ui.js';
import { VIEWBOX, REGIONI_GEO } from './lib/italia-geo.js';
import { eSocietaDiCapitali } from './coi.js';
import {
  classificaCpv, CPV_LABELS, renderTendenze, renderTopContratti, renderCategorie, renderDove,
  renderGlossario, renderGuida, renderPnrr, renderStorie, renderStoria, STORIE,
  renderAggiornamenti, renderApprofondimenti,
  renderPagamenti, renderPersonale, renderMobilita,
  renderFineAnno, renderConfronta, renderApi, renderAccessibilita, renderStorico,
} from './approfondimenti.js';
// Нови източници (all-11) — всеки в отделен модул-страница
import { renderApparecchiature } from './pagina-apparecchiature.js';
import { renderSdo } from './pagina-sdo.js';
import { renderAggiudicazioni } from './pagina-aggiudicazioni.js';
import { renderTed } from './pagina-ted.js';
import { renderConsulenze } from './pagina-perlapa.js';
import { renderPnrrSalute } from './pagina-pnrr-salute.js';
import { renderSiope } from './pagina-siope.js';
import { renderPne } from './pagina-pne.js';
import { renderCordate } from './pagina-cordate.js';
import { renderSegnaliGare } from './pagina-segnali-gare.js';

const FORENSICS_FILE = pjoin(DATA_DIR, 'forensics.json');
const APPALTI_FILE = pjoin(DATA_DIR, 'appalti.json');
const AGGIU_FILE = pjoin(DATA_DIR, 'aggiudicatari.json');
const VALIDAZIONE_FILE = pjoin(DATA_DIR, 'validazione.json');
const CONTRATTI_DIR = pjoin(DATA_DIR, 'contratti');

// Валидна италианска P.IVA: 11 цифри, не всички еднакви (00000000000 минава
// контролната сума, но е плейсхолдър), с коректна контролна цифра (Luhn-подобна).
// Пази профилите на изпълнителите от боклучави CF-ове от източника.
function pIvaValida(cf) {
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

const REGOLE_LABEL = {
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

// Регионите на SSN (20 административни региона). Ключ = страница/файл; `istat` =
// код за географската карта (ISTAT граници); `prefissi` = кодовете codice_regione
// от финансите (Трентино-Алто Адидже обединява двете авт. провинции 041+042);
// `anac` = имената в ANAC регионалния изглед (за join). Карта = истинска
// географска (inline SVG от ISTAT граници, CC BY 4.0), не схематична.
const REGIONI = {
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
const PIANO_RIENTRO = {
  '130': 'piano', '180': 'commissariata', '150': 'piano', '120': 'piano',
  '140': 'commissariata', '160': 'piano', '190': 'piano',
};

// codice_regione (3 цифри) → ключ на региона (Трентино: 041/042 → 'taa')
const REG_KEY = {};
for (const [key, m] of Object.entries(REGIONI)) for (const p of m.prefissi) REG_KEY[p] = key;

function ultimoCe(ente) {
  const anni = anniConCe(ente);
  return anni.length ? { anno: anni.at(-1), y: ente.serie.get(anni.at(-1)) } : { anno: null, y: {} };
}

// Дата на снапшота на данните (от validazione) — за Article схемата, видимите
// „Dati aggiornati al…" редове и sitemap lastmod. Задава се в main().
let DATA_SNAPSHOT = '';

// Article JSON-LD за разследващите страници (E-E-A-T: автор, дата, източници)
// Етикет за диапазон години: [2023,2024,2025] → „2023–2025" (не join на всички).
function rangeAnni(a) {
  if (!a || !a.length) return '';
  return a.length === 1 ? String(a[0]) : `${a[0]}–${a[a.length - 1]}`;
}

function articleLd(titolo, descrizione, percorso) {
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
function rigaAggiornamento() {
  return DATA_SNAPSHOT
    ? `<p class="small muted">Dati aggiornati al ${esc(DATA_SNAPSHOT)} · Fonti: ANAC, BDAP/RGS-MEF, Ministero della Salute.</p>`
    : '';
}

// Комбиниран граф Article + BreadcrumbList за подстраниците на „Approfondimenti“.
function pagLd(titolo, descrizione, percorso, nome) {
  const a = articleLd(titolo, descrizione, percorso);
  const b = briciole([['Home', '/'], ['Approfondimenti', 'approfondimenti.html'], [nome, percorso]]);
  const nodi = [a, b].filter(Boolean);
  return nodi.length ? { '@context': 'https://schema.org', '@graph': nodi } : null;
}

// BreadcrumbList JSON-LD (за дълбоките страници)
function briciole(items) {
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

async function main() {
  const config = await readJson(join(ROOT, 'config.json')).catch(() => ({}));
  setSiteUrl(config.siteUrl || '');
  const { enti, anagrafica, ultimoAnnoCe } = await loadDataset();
  const struttureByCod = new Map(anagrafica.strutture.map((s) => [s.codice, s]));
  const segn = await readJson(SEGNALAZIONI_FILE).catch(() => {
    throw new Error('няма segnalazioni.json — пусни първо `npm run analyze`');
  });
  const segnByCod = new Map(segn.enti.map((e) => [e.codice, e]));
  const forense = await readJson(FORENSICS_FILE).catch(() => {
    throw new Error('няма forensics.json — пусни първо `npm run forensics`');
  });
  const forByCod = new Map(forense.enti.map((e) => [e.codice, e]));

  // ANAC поръчки (по избор — ако липсват, разделите просто не се показват)
  const appalti = await readJson(APPALTI_FILE).catch(() => null);
  let appByCod = new Map();
  let appMatch = null;
  if (appalti) {
    const { byCf, byCodice } = matchAutoritaEnti(
      enti.map((e) => ({ codice: e.codice, denominazione: e.denominazione, regione: e.regione })),
      appalti.autorita.map((a) => ({ cf: a.cf, den: a.den, reg: a.reg }))
    );
    const autByCf = new Map(appalti.autorita.map((a) => [a.cf, a]));
    // изпълнители/участници (по избор)
    const aggiu = await readJson(AGGIU_FILE).catch(() => null);
    const aggPerCf = aggiu ? aggiu.perCf : {};
    for (const [codice, cf] of byCodice) {
      const a = autByCf.get(cf);
      if (a) appByCod.set(codice, { ...a, aggiu: aggPerCf[cf] || null });
    }
    appMatch = { abbinate: byCodice.size, totali: enti.length, aggiu, autByCf };
    // национална медиана на дела „senza gara“ по БРОЙ сред свързаните болници (за флаг)
    const quote = [...appByCod.values()].map((a) => a.quotaSenzaGaraNum).filter((v) => v != null).sort((a, b) => a - b);
    appMatch.medianaSenzaGaraNum = quote.length ? quote[Math.floor(quote.length / 2)] : null;
    void byCf;
  }

  // индикатори „конфликт на интереси" (по избор — генерира се от `npm run coi`)
  const coi = await readJson(pjoin(DATA_DIR, 'coi.json')).catch(() => null);
  const coiByCf = new Map();
  if (coi) for (const p of coi.coppie) {
    if (!coiByCf.has(p.cf)) coiByCf.set(p.cf, []);
    coiByCf.get(p.cf).push(p);
  }

  await rm(SITE_DIR, { recursive: true, force: true });
  await mkdir(join(SITE_DIR, 'struttura'), { recursive: true });
  await mkdir(join(SITE_DIR, 'contratti'), { recursive: true });

  // Общ индекс за клиентско филтриране + връзки
  const slugByCod = new Map(enti.map((e) => [e.codice, slugify(e.denominazione)]));
  const href = (cod) => `struttura/${cod}-${slugByCod.get(cod)}.html`;

  // ---- Национални агрегати за последната година ----
  let totRicavi = 0;
  let totCosti = 0;
  let totRisultato = 0;
  let inPerdita = 0;
  let conDati = 0;
  for (const ente of enti) {
    const { y } = ultimoCe(ente);
    if (y.valoreProduzione != null) {
      conDati++;
      totRicavi += y.valoreProduzione;
      totCosti += y.costiProduzione || 0;
      if (y.risultatoEsercizio != null) {
        totRisultato += y.risultatoEsercizio;
        if (y.risultatoEsercizio < 0) inPerdita++;
      }
    }
  }

  await writeFile(join(SITE_DIR, 'index.html'), renderHome({ enti, segn, forense, ultimoAnnoCe, totRicavi, totCosti, totRisultato, inPerdita, conDati, href, segnByCod }));
  const conCordate = !!(await readJson(pjoin(DATA_DIR, 'cordate.json')).catch(() => null));
  const conSegGare = !!(await readJson(pjoin(DATA_DIR, 'segnali-gare.json')).catch(() => null));
  await writeFile(join(SITE_DIR, 'inchiesta.html'), renderInchiesta({ forense, appalti, appMatch, href, conCordate, conSegGare }));
  if (coi) await writeFile(join(SITE_DIR, 'conflitti.html'), renderConflitti({ coi, href }));
  await writeFile(join(SITE_DIR, 'classifiche.html'), renderClassifiche({ forense, href }));
  if (appalti) await writeFile(join(SITE_DIR, 'appalti.html'), renderAppalti({ appalti, appByCod, appMatch, enti, href }));
  await writeFile(join(SITE_DIR, 'strutture.html'), renderStrutture({ enti, ultimoAnnoCe, href, segnByCod, ultimoCe }));
  await writeFile(join(SITE_DIR, 'segnalazioni.html'), renderSegnalazioni({ segn, href }));
  await writeFile(join(SITE_DIR, 'metodologia.html'), renderMetodologia({ segn, forense, appalti, appMatch, ultimoAnnoCe }));
  await writeFile(join(SITE_DIR, 'note-legali.html'), renderNoteLegali({ titolare: config.titolare || {} }));
  await writeFile(join(SITE_DIR, 'privacy.html'), renderPrivacy({ titolare: config.titolare || {}, hosting: config.hosting || {} }));
  const validaz = await readJson(VALIDAZIONE_FILE).catch(() => null);
  DATA_SNAPSHOT = validaz && validaz.generatoIl ? validaz.generatoIl.slice(0, 10) : '';
  if (validaz) await writeFile(join(SITE_DIR, 'verifiche.html'), renderVerifiche({ validaz, appMatch }));

  let conContratti = 0;
  const catCode = { competitiva: 'c', quadro: 'q', diretto: 'd', negoziataSenza: 'n', negoziata: 'g', altro: 'a' };
  const tuttiContratti = []; // глобален индекс за търсачката
  const catAgg = new Map(); // CPV макрокатегория → агрегат (за „Dove vanno i soldi")
  const topCand = []; // кандидати за „i 100 contratti più grandi" (пълни полета)
  const mesiAgg = { nazionale: new Array(12).fill(0), perEnte: new Map() }; // преки възлагания по месец (bunching di fine anno)

  // Benchmark €/легло и €/приемане: национални медиани (пре-пас преди рендера)
  const cplTutti = [];
  const cprTutti = [];
  for (const e of enti) {
    const y = ultimoCe(e).y;
    if (!y.costiProduzione) continue;
    const letti = postiLettoEnte(e, anagrafica);
    const ric = ricoveriEnte(e, anagrafica);
    if (letti > 0) cplTutti.push(y.costiProduzione / letti);
    if (ric > 0) cprTutti.push(y.costiProduzione / ric);
  }
  const mediana = (a) => (a.length ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
  const bench = { cplMed: mediana(cplTutti), cprMed: mediana(cprTutti) };
  const aziendeIdx = {}; // codice → [nome, regione]
  const fornAgg = new Map(); // cf → профил на изпълнителя (през всички болници)

  // Нови източници (all-11) — зареждат се тук (преди цикъла за структурите), за да
  // захранят и панела „La tua regione" във всеки профил. Всеки по избор.
  const popolazione = await readJson(pjoin(DATA_DIR, 'popolazione.json')).catch(() => ({ regioni: {}, italia: 0, anno: null }));
  const nomeReg = (k) => (REGIONI[k] ? REGIONI[k].nome : k);
  const regHref = (k) => (REGIONI[k] ? `regione/${k}.html` : null);
  const apparecchiature = await readJson(pjoin(DATA_DIR, 'apparecchiature.json')).catch(() => null);
  const sdo = await readJson(pjoin(DATA_DIR, 'sdo.json')).catch(() => null);
  const siope = await readJson(pjoin(DATA_DIR, 'siope.json')).catch(() => null);
  const pnrrSalute = await readJson(pjoin(DATA_DIR, 'pnrr-salute.json')).catch(() => null);

  // Регионален контекст per ключ (за панела в профила на болницата) — 100% надежден
  // join (регион), за разлика от кодовете на отделните структури.
  const regCtx = {};
  for (const key of Object.keys(REGIONI)) {
    const pop = popolazione.regioni[key] || 0;
    const a = apparecchiature && apparecchiature.perRegione[key];
    const s = sdo && sdo.perRegione[key];
    const si = siope && siope.perRegione[key];
    const pn = pnrrSalute && pnrrSalute.perRegione[key];
    regCtx[key] = {
      nome: nomeReg(key),
      href: regHref(key),
      tacPerMln: a && pop ? (a.cat.TAC || 0) / pop * 1e6 : null,
      robot: a ? a.cat.ROB || 0 : null,
      ricoveriPer1000: s && pop ? s.dimissioni / pop * 1000 : null,
      siopeDic: si ? si.dicSuMedia : null,
      pnrrProCapite: pn && pop ? pn.finanziamentoPnrr / pop : null,
    };
  }

  for (const ente of enti) {
    const fileCod = `${ente.codice}-${slugByCod.get(ente.codice)}`;
    // Пълен опис на договорите (ако е наличен): CSV + inline данни
    let contratti = null;
    try {
      contratti = JSON.parse(await readFile(join(CONTRATTI_DIR, `${ente.codice}.json`), 'utf8'));
    } catch {
      /* няма договори за тази структура */
    }
    if (contratti && contratti.length) {
      await writeFile(join(SITE_DIR, 'contratti', `${ente.codice}.csv`), contrattiCsv(ente, contratti));
      aziendeIdx[ente.codice] = [ente.denominazione, ente.regione];
      for (const c of contratti) {
        tuttiContratti.push([c.cig, ente.codice, c.data, c.importo, catCode[c.categoria] || 'a', (c.fornitore || '').slice(0, 45), (c.oggetto || '').slice(0, 90)]);
        // CPV макрокатегории („Dove vanno i soldi")
        const catCpv = classificaCpv(c.cpv);
        let ca = catAgg.get(catCpv);
        if (!ca) {
          ca = { n: 0, importo: 0, senzaGara: 0, forn: new Map() };
          catAgg.set(catCpv, ca);
        }
        ca.n++;
        ca.importo += c.importo;
        if (c.categoria === 'diretto' || c.categoria === 'negoziataSenza') ca.senzaGara++;
        if (c.fornitore && c.fornitoreCf && eSocietaDiCapitali(c.fornitore)) {
          const cf = ca.forn.get(c.fornitoreCf) || { cf: c.fornitoreCf, den: c.fornitore, importo: 0 };
          cf.importo += c.importo;
          ca.forn.set(c.fornitoreCf, cf);
        }
        // декемврийска треска: разпределение на ПРЕКИТЕ възлагания по месец
        if (c.categoria === 'diretto' && /^\d{4}-\d{2}/.test(c.data || '')) {
          const mese = Number(c.data.slice(5, 7)) - 1;
          if (mese >= 0 && mese < 12) {
            mesiAgg.nazionale[mese]++;
            let em = mesiAgg.perEnte.get(ente.codice);
            if (!em) mesiAgg.perEnte.set(ente.codice, (em = new Array(12).fill(0)));
            em[mese]++;
          }
        }
        // кандидати за топ 100 (пълни полета, само материалните)
        if (c.importo >= 5_000_000) topCand.push({ cig: c.cig, codice: ente.codice, data: c.data, importo: c.importo, oggetto: c.oggetto, fornitore: c.fornitoreAzienda ? c.fornitore : null, categoria: c.categoria });
        if (c.fornitoreCf && pIvaValida(c.fornitoreCf)) {
          let g = fornAgg.get(c.fornitoreCf);
          if (!g) {
            g = { cf: c.fornitoreCf, den: c.fornitore, valore: 0, n: 0, senzaGara: 0, perOsp: new Map(), top: [] };
            fornAgg.set(c.fornitoreCf, g);
          }
          g.valore += c.importo;
          g.n++;
          if (c.categoria === 'diretto' || c.categoria === 'negoziataSenza') g.senzaGara++;
          const o = g.perOsp.get(ente.codice) || { valore: 0, n: 0 };
          o.valore += c.importo;
          o.n++;
          g.perOsp.set(ente.codice, o);
          g.top.push({ cig: c.cig, codice: ente.codice, data: c.data, oggetto: c.oggetto, importo: c.importo, categoria: c.categoria });
        }
      }
      conContratti++;
    }
    await writeFile(
      join(SITE_DIR, 'struttura', `${fileCod}.html`),
      renderStruttura({ ente, struttureByCod, anagrafica, seg: segnByCod.get(ente.codice), forse: forByCod.get(ente.codice), app: appByCod.get(ente.codice), contratti, appMatch, ultimoAnnoCe, bench, reg: regCtx[REG_KEY[ente.codice.slice(0, 3)]] })
    );
  }
  // Глобален индекс + страница за търсене през всички договори
  let paginaCerca = 0;
  if (tuttiContratti.length) {
    tuttiContratti.sort((a, b) => b[3] - a[3]); // по сума, за да е топ-N смислен
    await writeFile(
      join(SITE_DIR, 'contratti-tutti.json'),
      JSON.stringify({ generatoIl: new Date().toISOString().slice(0, 10), aziende: aziendeIdx, righe: tuttiContratti })
    );
    await writeFile(join(SITE_DIR, 'cerca.html'), renderCerca({ n: tuttiContratti.length, aziende: Object.keys(aziendeIdx).length }));
    paginaCerca = 1;
  }

  // Профили на изпълнителите („segui il fornitore“)
  let paginaForn = 0;
  const fornituraCfs = [];
  if (fornAgg.size) {
    await mkdir(join(SITE_DIR, 'fornitore'), { recursive: true });
    const fornList = [...fornAgg.values()].sort((a, b) => b.valore - a.valore);
    // индекс (всички фирми) + профил-страници за материалните
    const idxRows = [];
    for (const f of fornList) {
      const materiale = f.valore >= 500_000 || f.n >= 3;
      const haPagina = materiale;
      if (haPagina) {
        f.top.sort((a, b) => b.importo - a.importo);
        // ditta individuale/società di persone (лични имена по конструкция):
        // без рискови флагове, noindex, извън sitemap (правен одит)
        const societa = eSocietaDiCapitali(f.den);
        await writeFile(join(SITE_DIR, 'fornitore', `${f.cf}.html`), renderFornitore({ f, aziendeIdx, societa, coppie: societa ? coiByCf.get(f.cf) || [] : [], strutturaHref: (cod) => `../struttura/${cod}-${slugByCod.get(cod)}.html` }));
        if (societa) fornituraCfs.push(f.cf);
        paginaForn++;
      }
      idxRows.push([f.cf, f.den, f.valore, f.n, f.perOsp.size, haPagina ? 1 : 0]);
    }
    await writeFile(join(SITE_DIR, 'fornitori.html'), renderFornitoriIndex({ righe: idxRows, totali: fornList.length }));
    paginaForn++;
  }

  // Регионални страници + географска карта на Италия (истински choropleth)
  const appRegByName = new Map((appalti ? appalti.regionale : []).map((r) => [r.reg, r]));
  const regAgg = new Map(); // regKey → агрегат
  for (const ente of enti) {
    const key = REG_KEY[ente.codice.slice(0, 3)];
    if (!key) continue;
    let g = regAgg.get(key);
    if (!g) {
      g = { key, valore: 0, risultato: 0, nInPerdita: 0, conCe: 0, enti: [] };
      regAgg.set(key, g);
    }
    const { y } = ultimoCe(ente);
    if (y.valoreProduzione != null) {
      g.valore += y.valoreProduzione;
      g.conCe++;
      if (y.risultatoEsercizio != null) {
        g.risultato += y.risultatoEsercizio;
        if (y.risultatoEsercizio < 0) g.nInPerdita++;
      }
    }
    g.enti.push(ente);
  }
  await mkdir(join(SITE_DIR, 'regione'), { recursive: true });
  const regioniData = [];
  for (const [key, meta] of Object.entries(REGIONI)) {
    const g = regAgg.get(key);
    if (!g) continue;
    const appReg = mergeAppRows(meta.anac.map((n) => appRegByName.get(n)).filter(Boolean));
    const senzaGaraPct = appReg && appReg.n ? (appReg.cat.diretto.n + appReg.cat.negoziataSenza.n) / appReg.n : null;
    await writeFile(
      join(SITE_DIR, 'regione', `${key}.html`),
      renderRegione({ key, meta, g, appReg, senzaGaraPct, segnByCod, ultimoAnnoCe, slugByCod })
    );
    regioniData.push({ key, istat: meta.istat, abbr: meta.abbr, nome: meta.nome, senzaGaraPct, nEnti: g.enti.length, valore: g.valore, risultato: g.risultato, appN: appReg ? appReg.n : 0 });
  }
  await writeFile(join(SITE_DIR, 'regioni.html'), renderRegioniIndex({ regioniData }));

  // ---------- Approfondimenti: тенденции, топ 100, категории, dove, PNRR, storie… ----------
  // 1) Тенденции: национални суми по година + растеж на разходите по регион
  const perAnno = {};
  for (const ente of enti) {
    for (const [anno, y] of ente.serie) {
      if (y.valoreProduzione == null) continue;
      const t = perAnno[anno] || (perAnno[anno] = { valore: 0, costi: 0, personale: 0, risultato: 0 });
      t.valore += y.valoreProduzione;
      t.costi += y.costiProduzione || 0;
      t.personale += y.costoPersonale || 0;
      t.risultato += y.risultatoEsercizio || 0;
    }
  }
  const anniTutti = Object.keys(perAnno).map(Number).sort((a, b) => a - b);
  const regCosti = new Map(); // key → {prima, dopo}
  for (const ente of enti) {
    const key = REG_KEY[ente.codice.slice(0, 3)];
    if (!key) continue;
    const g = regCosti.get(key) || { prima: 0, dopo: 0 };
    const yPrima = ente.serie.get(anniTutti[0]);
    const yDopo = ente.serie.get(ultimoAnnoCe);
    if (yPrima && yPrima.costiProduzione) g.prima += yPrima.costiProduzione;
    if (yDopo && yDopo.costiProduzione) g.dopo += yDopo.costiProduzione;
    regCosti.set(key, g);
  }
  const regioniCrescita = [...regCosti.entries()]
    .filter(([, g]) => g.prima > 0 && g.dopo > 0)
    .map(([key, g]) => ({ key, nome: REGIONI[key].nome, prima: g.prima, dopo: g.dopo, crescita: g.dopo / g.prima - 1 }))
    .sort((a, b) => b.crescita - a.crescita);
  await writeFile(join(SITE_DIR, 'tendenze.html'), renderTendenze({ perAnno, regioniCrescita, ultimoAnnoCe }));

  // 2) Топ 100 договора (пълни полета)
  topCand.sort((a, b) => b.importo - a.importo);
  const top100 = topCand.slice(0, 100);
  await writeFile(join(SITE_DIR, 'top-contratti.html'), renderTopContratti({ top: top100, aziendeIdx, href }));

  // 3) Разходни категории (CPV)
  const totCategorie = [...catAgg.values()].reduce((s, c) => s + c.importo, 0);
  await writeFile(join(SITE_DIR, 'categorie.html'), renderCategorie({ cats: Object.fromEntries(catAgg), totImporto: totCategorie }));

  // 5) Trova la tua struttura: комуна → структура → болница (последната година per структура)
  const perStruttura = new Map();
  for (const s of anagrafica.strutture) {
    const prev = perStruttura.get(s.codice);
    if (!prev || s.anno > prev.anno) perStruttura.set(s.codice, s);
  }
  const byCodEnte = new Map(enti.map((e) => [e.codice, e]));
  const doveRighe = [...perStruttura.values()]
    .filter((s) => s.comune)
    .map((s) => {
      const ente = byCodEnte.get(s.codice) || byCodEnte.get(`${s.codiceRegione}${s.codiceAsl}`);
      return {
        comune: s.comune,
        provincia: s.provincia || '',
        nome: s.denominazione,
        tipo: s.tipo || '',
        ente: ente ? ente.denominazione : s.asl || '—',
        href: ente ? href(ente.codice) : null,
        letti: s.postiLetto || 0,
      };
    })
    .sort((a, b) => a.comune.localeCompare(b.comune, 'it'));
  await writeFile(join(SITE_DIR, 'dove.html'), renderDove({ righe: doveRighe }));

  // 6+7) Глосар/FAQ + гражданско ръководство
  await writeFile(join(SITE_DIR, 'glossario.html'), renderGlossario());
  await writeFile(join(SITE_DIR, 'guida-verifica.html'), renderGuida());

  // 11) PNRR по региони (от ANAC флага, ако има appalti)
  if (appalti) {
    const pnrrRighe = Object.entries(REGIONI)
      .map(([key, meta]) => {
        const appReg = mergeAppRows(meta.anac.map((n) => appRegByName.get(n)).filter(Boolean));
        return appReg ? { key, nome: meta.nome, importo: appReg.importo, pnrrImporto: appReg.pnrrImporto || 0 } : null;
      })
      .filter(Boolean);
    await writeFile(join(SITE_DIR, 'pnrr.html'), renderPnrr({ regionale: pnrrRighe, href }));
  }

  // 13) Storie + 14) Aggiornamenti + hub
  await mkdir(join(SITE_DIR, 'storia'), { recursive: true });
  for (const s of STORIE) await writeFile(join(SITE_DIR, 'storia', `${s.slug}.html`), renderStoria(s));
  await writeFile(join(SITE_DIR, 'storie.html'), renderStorie());
  await writeFile(join(SITE_DIR, 'aggiornamenti.html'), renderAggiornamenti({ date: {} }));
  // 8/9/12) Новите източници: плащания (RGS/PCC), персонал (Conto Annuale),
  // mobilità (от CE) — всичките по избор (страницата се пропуска без данните)
  const tp = await readJson(pjoin(DATA_DIR, 'tempi-pagamento.json')).catch(() => null);
  if (tp) await writeFile(join(SITE_DIR, 'pagamenti.html'), renderPagamenti({ tp }));
  const pers = await readJson(pjoin(DATA_DIR, 'personale.json')).catch(() => null);
  if (pers) {
    const aziendeNomi = new Map(enti.map((e) => [e.codice, e.denominazione]));
    await writeFile(join(SITE_DIR, 'personale.html'), renderPersonale({ pers, aziendeNomi, href }));
  }
  const mob = await readJson(pjoin(DATA_DIR, 'mobilita.json')).catch(() => null);
  if (mob) {
    const nome2key = new Map(enti.map((e) => [e.regione, REG_KEY[e.codice.slice(0, 3)]]));
    await writeFile(join(SITE_DIR, 'mobilita.html'), renderMobilita({ mob, regKeyByNome: (n) => nome2key.get(n) || null }));
  }

  // --- Нови източници (all-11) — данните са заредени по-горе; тук само страниците ---
  if (apparecchiature) await writeFile(join(SITE_DIR, 'apparecchiature.html'), renderApparecchiature({ app: apparecchiature, popolazione, nomeReg, jsonld: pagLd('La dotazione tecnologica degli ospedali', 'Grandi apparecchiature diagnostiche e terapeutiche per milione di abitanti, regione per regione.', 'apparecchiature.html', 'Dotazione tecnologica') }));
  if (sdo) await writeFile(join(SITE_DIR, 'sdo.html'), renderSdo({ sdo, popolazione, nomeReg, jsonld: pagLd('I ricoveri negli ospedali italiani', 'Volumi di dimissioni ospedaliere per regione dalle schede di dimissione (SDO).', 'sdo.html', 'Ricoveri (SDO)') }));

  const aggiu = await readJson(pjoin(DATA_DIR, 'aggiudicazioni.json')).catch(() => null);
  if (aggiu) await writeFile(join(SITE_DIR, 'aggiudicazioni.html'), renderAggiudicazioni({ agg: aggiu, jsonld: pagLd('Quanti partecipano davvero alle gare della sanità', 'Numero di offerenti, ribassi e affidamenti a offerente unico dai dati ANAC.', 'aggiudicazioni.html', 'Concorrenza nelle gare') }));

  const ted = await readJson(pjoin(DATA_DIR, 'ted.json')).catch(() => null);
  if (ted) await writeFile(join(SITE_DIR, 'ted.html'), renderTed({ ted, jsonld: pagLd('Le gare europee della sanità italiana', 'Offerenti per lotto nelle gare sopra-soglia UE pubblicate su TED.', 'ted.html', 'Gare europee (TED)') }));

  const cons = await readJson(pjoin(DATA_DIR, 'consulenze.json')).catch(() => null);
  if (cons) await writeFile(join(SITE_DIR, 'consulenze.html'), renderConsulenze({ cons, jsonld: pagLd('Le consulenze esterne della sanità', 'Spesa e numero di incarichi di consulenza esterna delle aziende sanitarie, per azienda.', 'consulenze.html', 'Consulenze esterne') }));

  if (pnrrSalute) await writeFile(join(SITE_DIR, 'pnrr-salute.html'), renderPnrrSalute({ pnrr: pnrrSalute, popolazione, nomeReg, href: regHref, jsonld: pagLd('Il PNRR della sanità (Missione 6)', 'Fondi e progetti della Missione 6 del PNRR per la sanità, regione per regione.', 'pnrr-salute.html', 'PNRR sanità') }));
  if (siope) await writeFile(join(SITE_DIR, 'siope.html'), renderSiope({ siope, nomeReg, jsonld: pagLd('La cassa della sanità mese per mese', 'Flussi di cassa SIOPE delle aziende sanitarie e concentrazione dei pagamenti a fine anno.', 'siope.html', 'Cassa (SIOPE)') }));

  const cordate = await readJson(pjoin(DATA_DIR, 'cordate.json')).catch(() => null);
  if (cordate) await writeFile(join(SITE_DIR, 'cordate.html'), renderCordate({ cordate, jsonld: pagLd('Chi si presenta insieme alle gare', 'Coppie di società che concorrono insieme dove una vince e l’altra mai: un indicatore da verificare.', 'cordate.html', 'Cordate nelle gare') }));

  const segGare = await readJson(pjoin(DATA_DIR, 'segnali-gare.json')).catch(() => null);
  if (segGare) await writeFile(join(SITE_DIR, 'segnali-gare.html'), renderSegnaliGare({ seg: segGare, jsonld: pagLd('Sei indicatori sulle gare della sanità', 'Frazionamento, soglie UE, tempi troppo brevi: indicatori di rischio sulle gare, non prove.', 'segnali-gare.html', 'Indicatori sulle gare') }));

  // PNE (esiti clinici) — разход на глава per регион за кръстоската „soldi vs esiti"
  const pne = await readJson(pjoin(DATA_DIR, 'pne.json')).catch(() => null);
  if (pne) {
    const costiPerAbitante = {};
    for (const [key, g] of regCosti) {
      const popReg = popolazione.regioni && popolazione.regioni[key];
      if (g.dopo > 0 && popReg) costiPerAbitante[key] = g.dopo / popReg;
    }
    await writeFile(join(SITE_DIR, 'pne.html'), renderPne({ pne, costiPerAbitante, nomeReg }));
  }

  // Декемврийска треска (bunching): класация по dic/средно (мин 120 преки)
  const bunchRighe = [...mesiAgg.perEnte.entries()]
    .map(([cod, mm]) => {
      const totale = mm.reduce((a, b) => a + b, 0);
      const media = totale / 12;
      return { cod, totale, dicembre: mm[11], rapporto: media ? mm[11] / media : 0 };
    })
    .filter((r) => r.totale >= 120)
    .sort((a, b) => b.rapporto - a.rapporto)
    .slice(0, 15)
    .map((r) => {
      const e = enti.find((x) => x.codice === r.cod);
      return { ...r, nome: e ? e.denominazione : r.cod, regione: e ? e.regione : '', href: href(r.cod) };
    });
  await writeFile(join(SITE_DIR, 'fine-anno.html'), renderFineAnno({ mesi: mesiAgg.nazionale, perEnteRighe: bunchRighe }));

  // Confronta: компактен per-ente датасет за клиентското сравнение
  const confrontaDati = enti
    .map((e) => {
      const { anno: an, y } = ultimoCe(e);
      if (y.valoreProduzione == null) return null;
      const letti = postiLettoEnte(e, anagrafica);
      const pe = pers && pers.perEnte[e.codice];
      const app = appByCod.get(e.codice);
      const seg = segnByCod.get(e.codice);
      return {
        n: e.denominazione.slice(0, 60), r: e.regione, h: href(e.codice), an,
        v: y.valoreProduzione, c: y.costiProduzione ?? null, ri: y.risultatoEsercizio ?? null, cp: y.costoPersonale ?? null,
        pl: letti || null, cpl: letti && y.costiProduzione ? Math.round(y.costiProduzione / letti) : null,
        dip: pe ? pe.totale : null, med: pe ? pe.medici : null, qf: pe ? pe.quotaFlessibili : null,
        na: app ? app.n : null, sg: app && app.quotaSenzaGaraNum != null ? app.quotaSenzaGaraNum : null,
        ns: seg ? seg.segnalazioni.length : 0,
      };
    })
    .filter(Boolean);
  await writeFile(join(SITE_DIR, 'confronta.html'), renderConfronta({ datiJson: JSON.stringify(confrontaDati) }));

  // COVID ретроспекция (по избор — изисква data/storico.json от npm run storico)
  const sto = await readJson(pjoin(DATA_DIR, 'storico.json')).catch(() => null);
  if (sto) await writeFile(join(SITE_DIR, 'storico.html'), renderStorico({ st: sto }));

  // API документация + декларация за достъпност
  await writeFile(join(SITE_DIR, 'api.html'), renderApi({ su: siteUrl() }));
  await writeFile(join(SITE_DIR, 'accessibilita.html'), renderAccessibilita());

  // RSS: глобален фийд (storie + aggiornamenti) + per-болница (сигналите ѝ)
  const su0 = siteUrl();
  if (su0) {
    const rfc = (d) => new Date(d).toUTCString();
    const buildDate = rfc(segn.generatoIl || Date.now());
    const item = (t, link, desc, date) =>
      `<item><title>${esc(t)}</title><link>${esc(link)}</link><guid>${esc(link)}</guid><pubDate>${date}</pubDate><description>${esc(desc)}</description></item>`;
    const globItems = STORIE.map((st) => item(st.titolo, `${su0}/storia/${st.slug}.html`, st.sommario, buildDate)).join('\n');
    const feed = (title, link, items) =>
      `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${esc(title)}</title><link>${esc(link)}</link><description>Ospedali Trasparenti — dati e indicatori sulla sanità pubblica italiana</description><language>it</language><lastBuildDate>${buildDate}</lastBuildDate>\n${items}\n</channel></rss>\n`;
    await writeFile(join(SITE_DIR, 'feed.xml'), feed('Ospedali Trasparenti — storie e aggiornamenti', `${su0}/`, globItems));
    await mkdir(join(SITE_DIR, 'feed'), { recursive: true });
    for (const e of enti) {
      const seg = segnByCod.get(e.codice);
      if (!seg || !seg.segnalazioni.length) continue;
      const items = seg.segnalazioni
        .map((sg) => item(`${sg.titolo} — ${e.denominazione}`, `${su0}/${href(e.codice)}`, sg.testo || sg.titolo, buildDate))
        .join('\n');
      await writeFile(join(SITE_DIR, 'feed', `${e.codice}.xml`), feed(`Segnalazioni — ${e.denominazione}`, `${su0}/${href(e.codice)}`, items));
    }
  }

  await writeFile(
    join(SITE_DIR, 'approfondimenti.html'),
    renderApprofondimenti({
      nTop: top100.length, totCategorie, nStrutture: doveRighe.length,
      conNuovi: {
        pagamenti: !!tp, personale: !!pers, mobilita: !!mob, fineAnno: true, confronta: true, api: true, storico: !!sto,
        apparecchiature: !!apparecchiature, sdo: !!sdo, aggiudicazioni: !!aggiu, ted: !!ted, consulenze: !!cons,
        pnrrSalute: !!pnrrSalute, siope: !!siope, cordate: !!cordate, segnaliGare: !!segGare,
        pne: !!(await readJson(pjoin(DATA_DIR, 'pne.json')).catch(() => null)),
      },
    })
  );

  // Hub за отворени данни: копира машинно-четимите датасети в site/dati/ и събира
  // размерите им, за да ги публикува за повторно ползване (open data).
  await mkdir(join(SITE_DIR, 'dati'), { recursive: true });
  const DATASET_DEFS = [
    ['segnalazioni.json', 'JSON', 'Segnalazioni contabili automatiche', 'Anomalie sui bilanci CE/SP con regola, gravità e numeri citati.', 'BDAP — RGS/MEF (IODL 2.0)'],
    ['forensics.json', 'JSON', 'Inchiesta: deficit di sistema e anomalie di spesa', 'Ricostruzione del disavanzo (aziende + GSA) e anomalie di costo con benchmark tra pari.', 'BDAP — RGS/MEF (IODL 2.0)'],
    ['appalti.json', 'JSON', 'Appalti ANAC aggregati', 'Aggregati per regione e per ente: procedure, quota senza gara, frazionamento, proroghe.', 'ANAC (CC BY 4.0)'],
    ['aggiudicatari.json', 'JSON', 'Fornitori, concentrazione, offerente unico', 'Chi incassa: fornitori per ente, concentrazione, gare a un solo partecipante (dato parziale).', 'ANAC (CC BY 4.0)'],
    ['anagrafica.json', 'JSON', 'Anagrafe delle strutture ospedaliere', 'Posti letto, personale, ricoveri per struttura (modello HSP).', 'Ministero della Salute'],
    ['contratti-indice.json', 'JSON', 'Indice dei contratti per struttura', 'Numero e valore dei contratti collegati a ciascuna azienda sanitaria.', 'ANAC (CC BY 4.0)'],
    ['coi.json', 'JSON', 'Relazioni ricorrenti azienda–fornitore', 'Coppie con affidamenti diretti ripetuti, dipendenza o esclusiva: indicatori, non prove.', 'ANAC (CC BY 4.0)'],
    ['mobilita.json', 'JSON', 'Mobilità sanitaria per regione', 'Spesa per cure fuori regione (canali pubblico/privato) dai bilanci CE, per anno.', 'BDAP — RGS/MEF (IODL 2.0)'],
    ['personale.json', 'JSON', 'Personale del comparto sanità', 'Dipendenti, medici e lavoro flessibile per azienda (Conto Annuale).', 'BDAP — RGS/MEF (IODL 2.0)'],
    ['tempi-pagamento.json', 'JSON', 'Tempi di pagamento enti SSN', 'Serie nazionale PCC/RGS 2019–2025 (estrazione dal PDF ufficiale).', 'RGS/MEF'],
    ['aggiudicazioni.json', 'JSON', 'Aggiudicazioni: offerenti, ribassi, ritardi', 'Numero di offerenti, ribasso e stati di avanzamento per i CIG sanitari (arricchimento ANAC).', 'ANAC — BDNCP (CC BY-SA 4.0)'],
    ['cordate.json', 'JSON', 'Cordate di offerenti (possibile cover bidding)', 'Coppie di imprese che concorrono spesso insieme dove una vince e l’altra mai: indicatore, non prova.', 'ANAC — BDNCP (CC BY-SA 4.0)'],
    ['segnali-gare.json', 'JSON', 'Indicatori di rischio sulle gare', 'Termini brevi, importi sotto soglia UE, frazionamento, ribassi nulli, inviti a vuoto, subappalto: per committente.', 'ANAC — BDNCP (CC BY / CC BY-SA 4.0)'],
    ['ted.json', 'JSON', 'Offerte per gara (TED — UE)', 'Numero di offerenti nelle gare sopra-soglia della sanità italiana (CPV 33*/85*), era eForms.', 'TED — UE (riuso libero, Dec. 2011/833/UE)'],
    ['apparecchiature.json', 'JSON', 'Dotazione tecnologica per struttura', 'Grandi apparecchiature (TAC, RMN, PET, acceleratori, robot) per struttura e regione.', 'Ministero della Salute (IODL 2.0)'],
    ['sdo.json', 'JSON', 'Volumi di attività (SDO)', 'Ricoveri per struttura e regione (schede di dimissione ospedaliera 2022).', 'Ministero della Salute (IODL 2.0)'],
    ['consulenze.json', 'JSON', 'Consulenze esterne (aggregato)', 'Spesa per incarichi di consulenza per azienda sanitaria, senza nomi di persone (PerlaPA).', 'Dip. Funzione Pubblica (CC BY 4.0)'],
    ['pnrr-salute.json', 'JSON', 'PNRR Missione 6 (Salute) per regione', 'Fondi PNRR e progetti M6C1/M6C2 per regione (Case/Ospedali di Comunità, ammodernamento).', 'OpenPNRR/Openpolis su dati ReGiS (ODbL 1.0)'],
    ['siope.json', 'JSON', 'Pagamenti per cassa (SIOPE)', 'Spesa sanitaria per cassa per regione e codice economico, con stagionalità di dicembre.', 'RGS/MEF — SIOPE (CC BY 3.0)'],
    ['pne.json', 'JSON', 'Esiti clinici per regione (PNE)', 'Indicatori di esito PNE selezionati, aggregati per regione (elaborazione propria su dati AGENAS).', 'AGENAS — PNE'],
    ['popolazione.json', 'JSON', 'Popolazione residente per regione', 'Popolazione Istat per la normalizzazione pro capite di spesa e dotazione.', 'Istat (CC BY)'],
    ['validazione.json', 'JSON', 'Controlli di consistenza e provenienza', 'Identità contabili verificate, copertura e impronta SHA-256 delle fonti.', 'Elaborazione propria'],
  ];
  const datasets = [];
  for (const [file, fmt, titolo, descr, licenza] of DATASET_DEFS) {
    const src = pjoin(DATA_DIR, file);
    if (!(await stat(src).catch(() => null))) continue;
    await copyFile(src, join(SITE_DIR, 'dati', file));
    const { size } = await stat(join(SITE_DIR, 'dati', file));
    datasets.push({ href: `dati/${file}`, fmt, titolo, descr, licenza, bytes: size });
  }
  // Вече обслужвани от сайта големи изгледи (не се копират наново)
  if (paginaCerca) {
    const { size } = await stat(join(SITE_DIR, 'contratti-tutti.json'));
    datasets.push({ href: 'contratti-tutti.json', fmt: 'JSON', titolo: 'Registro completo dei contratti', descr: `Tutti i ${numeroIt(tuttiContratti.length)} contratti collegati, in un unico file (usato dal motore di ricerca).`, licenza: 'ANAC (CC BY 4.0)', bytes: size });
  }
  if (conContratti) {
    datasets.push({ href: 'contratti/', fmt: 'CSV', titolo: 'Contratti per struttura (CSV)', descr: `Un file CSV per ciascuna delle ${numeroIt(conContratti)} strutture collegate: contratti/&lt;codice&gt;.csv.`, licenza: 'ANAC (CC BY 4.0)', bytes: null });
  }
  datasets.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
  await writeFile(join(SITE_DIR, 'dati.html'), renderDati({ datasets, validaz, generatoIl: (validaz && validaz.generatoIl) || new Date().toISOString() }));

  // Откриваемост: sitemap.xml + robots.txt (само при зададен siteUrl)
  const su = siteUrl();
  if (su) {
    const oggi = new Date().toISOString().slice(0, 10);
    const paths = [
      'index.html',
      'inchiesta.html',
      'classifiche.html',
      'regioni.html',
      'strutture.html',
      'segnalazioni.html',
      'dati.html',
      'metodologia.html',
      'note-legali.html',
      'privacy.html',
      ...(appalti ? ['appalti.html'] : []),
      ...(coi ? ['conflitti.html'] : []),
      ...(validaz ? ['verifiche.html'] : []),
      ...(paginaCerca ? ['cerca.html'] : []),
      ...(paginaForn ? ['fornitori.html'] : []),
      'approfondimenti.html',
      'tendenze.html',
      'top-contratti.html',
      'categorie.html',
      'dove.html',
      'glossario.html',
      'guida-verifica.html',
      ...(appalti ? ['pnrr.html'] : []),
      'storie.html',
      'aggiornamenti.html',
      'pagamenti.html',
      'personale.html',
      'mobilita.html',
      'fine-anno.html',
      ...(sto ? ['storico.html'] : []),
      ...(apparecchiature ? ['apparecchiature.html'] : []),
      ...(sdo ? ['sdo.html'] : []),
      ...(aggiu ? ['aggiudicazioni.html'] : []),
      ...(ted ? ['ted.html'] : []),
      ...(cons ? ['consulenze.html'] : []),
      ...(pnrrSalute ? ['pnrr-salute.html'] : []),
      ...((await stat(join(SITE_DIR, 'siope.html')).catch(() => null)) ? ['siope.html'] : []),
      ...((await stat(join(SITE_DIR, 'pne.html')).catch(() => null)) ? ['pne.html'] : []),
      ...(cordate ? ['cordate.html'] : []),
      ...(segGare ? ['segnali-gare.html'] : []),
      'confronta.html',
      'api.html',
      'accessibilita.html',
      ...STORIE.map((s) => `storia/${s.slug}.html`),
      ...regioniData.map((r) => `regione/${r.key}.html`),
      ...enti.map((e) => `struttura/${e.codice}-${slugByCod.get(e.codice)}.html`),
      ...fornituraCfs.map((cf) => `fornitore/${cf}.html`),
    ];
    const prio = (p) => (p === 'index.html' ? '1.0' : p.includes('/') ? '0.6' : '0.8');
    // lastmod = датата на снапшота на ДАННИТЕ (не на билда) — иначе всеки билд
    // „подновява" 4400 адреса и lastmod губи доверие (SEO одит)
    const lastmod = (validaz && validaz.generatoIl ? validaz.generatoIl : new Date().toISOString()).slice(0, 10);
    void oggi;
    const urls = paths
      .map((p) => `<url><loc>${esc(`${su}/${p}`)}</loc><lastmod>${lastmod}</lastmod><priority>${prio(p)}</priority></url>`)
      .join('\n');
    await writeFile(
      join(SITE_DIR, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
    );
    // allow-all е съзнателно: гражданска цел → искаме и AI асистентите да ни
    // намират и цитират (извличащи + обучаващи ботове са допуснати нарочно)
    await writeFile(
      join(SITE_DIR, 'robots.txt'),
      `# Ospedali Trasparenti — dati aperti sulla sanità pubblica italiana.\n# L'accesso è consentito a tutti i crawler, inclusi i bot AI (ricerca e training):\n# la finalità civica del progetto è massimizzare la diffusione dei dati.\nUser-agent: *\nAllow: /\n\nSitemap: ${su}/sitemap.xml\n`
    );
    // llms.txt — карта за AI асистентите (Claude/Perplexity я четат)
    await writeFile(
      join(SITE_DIR, 'llms.txt'),
      `# Ospedali Trasparenti\n\n> Conti, bilanci e appalti degli ospedali pubblici italiani da open data ufficiali\n> (ANAC, BDAP/RGS-MEF, Ministero della Salute). Indicatori di rischio, non prove.\n\n## Pagine principali\n\n- [Inchiesta: dove vanno i soldi](${su}/inchiesta.html): il deficit «vero» del sistema e le anomalie di spesa\n- [Relazioni ricorrenti e possibili conflitti d'interesse](${su}/conflitti.html): coppie azienda–fornitore da verificare\n- [Appalti della sanità](${su}/appalti.html): quota senza gara per regione e per azienda\n- [Fornitori del SSN](${su}/fornitori.html): chi incassa i soldi della sanità\n- [Regioni a confronto](${su}/regioni.html): carta d'Italia della quota senza gara\n- [Metodologia e fonti](${su}/metodologia.html): come calcoliamo ogni indicatore\n- [Dati aperti](${su}/dati.html): dataset scaricabili (JSON/CSV) con licenze\n- [Il decennio della sanità 2012-2024](${su}/tendenze.html): tendenze di ricavi, costi e personale\n- [Dove vanno i soldi: categorie di spesa](${su}/categorie.html): farmaci, pulizie, energia con i primi fornitori\n- [I 100 contratti più grandi](${su}/top-contratti.html)\n- [Glossario e FAQ](${su}/glossario.html): affidamento diretto, CIG, GSA, accordi quadro\n- [Come verificare un appalto](${su}/guida-verifica.html): guida pratica con accesso civico FOIA\n- [Il PNRR nella sanità](${su}/pnrr.html)\n- [Le storie nei dati](${su}/storie.html)\n\n## Indicatori sulle gare e approfondimenti\n\n${[
        cordate && `- [Chi si presenta insieme alle gare](${su}/cordate.html): coppie di società che concorrono insieme, una vince e l'altra mai`,
        segGare && `- [Sei indicatori sulle gare](${su}/segnali-gare.html): frazionamento, soglie UE, tempi troppo brevi`,
        aggiu && `- [Quanti partecipano davvero alle gare](${su}/aggiudicazioni.html): offerenti per gara e ribassi (ANAC)`,
        ted && `- [Le gare europee della sanità](${su}/ted.html): offerenti per lotto sopra-soglia UE (TED)`,
        cons && `- [Le consulenze esterne della sanità](${su}/consulenze.html): spesa per incarichi esterni, aggregata per azienda`,
        apparecchiature && `- [La dotazione tecnologica](${su}/apparecchiature.html): grandi apparecchiature per milione di abitanti`,
        siope && `- [La cassa della sanità mese per mese](${su}/siope.html): flussi SIOPE e concentrazione a fine anno`,
        pnrrSalute && `- [Il PNRR della sanità (Missione 6)](${su}/pnrr-salute.html): fondi e progetti per regione`,
        sdo && `- [I ricoveri negli ospedali](${su}/sdo.html): volumi di dimissione per regione`,
        sto && `- [Il decennio delle gare 2019-2024](${su}/storico.html): come la pandemia ha cambiato gli appalti`,
      ]
        .filter(Boolean)
        .join('\n')}\n\n## Nota\n\nGli indicatori sono elaborazioni statistiche automatiche su dati ufficiali:\npiste da verificare, non prove né accuse.\n`
    );
    console.log(`Sitemap: ${paths.length} адреса → sitemap.xml + robots.txt + llms.txt (${su})`);
  }
  // OG картата (мета изображение за споделяния) — статичен асет
  await copyFile(pjoin(ROOT, 'assets', 'og.png'), join(SITE_DIR, 'og.png')).catch(() => {});
  // Логото (прозрачен PNG, фонът махнат) — марка в хедъра на всяка страница
  await copyFile(pjoin(ROOT, 'assets', 'logo.png'), join(SITE_DIR, 'logo.png')).catch(() => {});
  // Favicon-и (иконата от логото) — .ico + PNG размери + apple-touch
  for (const f of ['favicon.ico', 'favicon-32.png', 'favicon-16.png', 'apple-touch-icon.png']) {
    await copyFile(pjoin(ROOT, 'assets', f), join(SITE_DIR, f)).catch(() => {});
  }

  // 404 — за несъществуващи адреси и за страници, скрити от админ панела
  await writeFile(
    join(SITE_DIR, '404.html'),
    page({
      title: 'Pagina non trovata',
      active: '',
      noindex: true,
      description: 'La pagina richiesta non esiste o non è più disponibile.',
      body: `<h1>Pagina non trovata</h1>
<p class="lead">La pagina che cerchi non esiste o non è più disponibile.</p>
<p><a href="index.html">← Torna alla home</a> · <a href="strutture.html">Cerca una struttura</a> ·
<a href="dati.html">Dati aperti</a></p>`,
    })
  );

  console.log(`Готово: ${enti.length + (appalti ? 13 : 12) + (coi ? 1 : 0) + regioniData.length + paginaCerca + paginaForn} страници (${conContratti} с опис, ${paginaForn} за изпълнители, ${regioniData.length} региона, ${numeroIt(tuttiContratti.length)} договора) → ${SITE_DIR}`);
}

// ---------- HOME ----------
function renderHome({ enti, segn, forense, ultimoAnnoCe, totRicavi, totCosti, totRisultato, inPerdita, conDati, href, segnByCod }) {
  const sis = forense.sistema.perAnno[ultimoAnnoCe];
  const top = segn.enti.slice(0, 12);
  const rows = top
    .map((e) => {
      const segCount = e.segnalazioni.length;
      return `<tr>
        <td><a href="${href(e.codice)}">${esc(e.denominazione)}</a><div class="small muted">${esc(e.regione)}</div></td>
        <td>${badge(e.gravitaMax)}</td>
        <td class="num">${segCount}</td>
        <td class="small">${esc(e.segnalazioni[0].titolo)}</td>
      </tr>`;
    })
    .join('');

  const body = `
<h1>I conti degli ospedali pubblici italiani, in chiaro</h1>
<p class="lead">Quanto incassano e quanto spendono le aziende sanitarie e ospedaliere del
Servizio Sanitario Nazionale — struttura per struttura, anno per anno — con l’evidenza automatica
delle situazioni contabili che meritano un approfondimento. Dati ufficiali <em>open data</em> di RGS/MEF
e Ministero della Salute.</p>

<div class="grid kpis" style="margin-top:22px">
  ${kpi(`Strutture con bilancio (${ultimoAnnoCe})`, numeroIt(conDati))}
  ${kpi('Valore della produzione', euroCompact(totRicavi))}
  ${kpi('Risultato d’esercizio aggregato', euroCompact(totRisultato), totRisultato < 0 ? 'neg' : 'pos')}
  ${kpi('Strutture in perdita', `${numeroIt(inPerdita)} / ${numeroIt(conDati)}`, inPerdita > conDati / 2 ? 'neg' : '')}
</div>

<div class="note" style="margin-top:22px"><strong>«Non è possibile che ogni ospedale sia in perdita.»</strong>
Giusto: nel ${ultimoAnnoCe}, ${sis.aziendeInUtile} aziende su ${sis.aziende} chiudono in utile o pareggio, e il rosso
delle altre è in gran parte coperto dalla Gestione Sanitaria Accentrata regionale. La domanda vera è <em>dove</em>
finiscono i soldi. → <a href="inchiesta.html">Leggi l’inchiesta</a> · <a href="classifiche.html">Le classifiche di spesa</a></div>

<h2>Strutture da tenere d’occhio</h2>
<p class="muted small">Ordinate per numero e gravità delle segnalazioni automatiche. Non sono giudizi:
sono anomalie contabili da verificare. <a href="segnalazioni.html">Tutte le segnalazioni →</a></p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Struttura</th><th scope="col">Gravità</th><th class="num" scope="col">Segn.</th><th scope="col">Prima segnalazione</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>

<div class="grid kpis" style="margin-top:26px">
  ${kpi('Segnalazioni totali', numeroIt(segn.totaleSegnalazioni))}
  ${kpi('Gravità alta', numeroIt(segn.perGravita.alta), 'neg')}
  ${kpi('Strutture segnalate', `${numeroIt(segn.entiConSegnalazioni)} / ${numeroIt(enti.length)}`)}
  ${kpi('Anno più recente', String(ultimoAnnoCe))}
</div>

<p style="margin-top:24px"><a class="chip" href="strutture.html">Esplora tutte le ${numeroIt(enti.length)} strutture →</a>
<a class="chip" href="metodologia.html">Come funziona →</a></p>
`;
  const su = siteUrl();
  const jsonld = su
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            '@id': `${su}/#org`,
            name: 'Ospedali Trasparenti',
            url: `${su}/`,
            logo: `${su}/logo.png`,
            description: 'Progetto di trasparenza civica sui conti e gli appalti degli ospedali pubblici italiani.',
            parentOrganization: { '@type': 'Organization', name: 'Carbon Stealth VCC', url: 'https://carbonstealth.eu' },
            sameAs: ['https://carbonstealth.eu'],
            knowsAbout: [
              'sanità pubblica italiana',
              'appalti pubblici della sanità',
              'bilanci delle aziende sanitarie',
              'affidamenti diretti ASL',
              'trasparenza della spesa sanitaria',
              'dati aperti ANAC',
              'modelli CE/SP BDAP',
            ],
          },
          {
            '@type': 'WebSite',
            '@id': `${su}/#website`,
            url: `${su}/`,
            name: 'Ospedali Trasparenti',
            inLanguage: 'it',
            publisher: { '@id': `${su}/#org` },
            potentialAction: {
              '@type': 'SearchAction',
              target: { '@type': 'EntryPoint', urlTemplate: `${su}/cerca.html?q={search_term_string}` },
              'query-input': 'required name=search_term_string',
            },
          },
        ],
      }
    : null;
  return page({
    title: 'I conti della sanità pubblica italiana, in chiaro — Ospedali Trasparenti',
    description: 'Entrate e spese delle strutture della sanità pubblica italiana, con segnalazione automatica delle anomalie contabili e degli appalti senza gara. Dati open data ANAC, RGS/MEF e Ministero della Salute.',
    active: 'index.html',
    canonical: '/', // canonical към корена на домейна, не /index.html
    jsonld,
    body,
  });
}

// ---------- STRUTTURE (con filtro) ----------
function renderStrutture({ enti, ultimoAnnoCe, href, segnByCod, ultimoCe }) {
  const regioni = [...new Set(enti.map((e) => e.regione))].sort();
  const rows = enti
    .map((e) => {
      const { y } = ultimoCe(e);
      const s = segnByCod.get(e.codice);
      const ris = y.risultatoEsercizio;
      const g = s ? s.gravitaMax : '';
      return `<tr data-regione="${esc(e.regione)}" data-grav="${g}" data-nome="${esc(e.denominazione.toLowerCase())}">
      <td><a href="${href(e.codice)}">${esc(e.denominazione)}</a><div class="small muted">${esc(e.regione)} · ${esc(tipoEnte(e.codEnte, e.anag))}</div></td>
      <td class="num">${euroCompact(y.valoreProduzione)}</td>
      <td class="num ${ris < 0 ? 'neg' : ris > 0 ? 'pos' : ''}">${euroCompact(ris)}</td>
      <td>${s ? badge(s.gravitaMax) + ` <span class="small muted">${s.segnalazioni.length}</span>` : '<span class="small muted">—</span>'}</td>
    </tr>`;
    })
    .join('');
  const opts = regioni.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('');

  const body = `
<h1>Tutte le strutture</h1>
<p class="lead">Le ${numeroIt(enti.length)} aziende del SSN con bilancio nei modelli CE/SP.
Cerca per nome, filtra per regione o per gravità delle segnalazioni. Valori dell’ultimo esercizio disponibile (${ultimoAnnoCe}).</p>
<div class="controls">
  <input type="search" id="q" placeholder="Cerca per nome…" aria-label="Cerca">
  <select id="reg" aria-label="Regione"><option value="">Tutte le regioni</option>${opts}</select>
  <select id="grav" aria-label="Gravità">
    <option value="">Qualsiasi segnalazione</option>
    <option value="alta">Solo gravità alta</option>
    <option value="media">Media o alta</option>
    <option value="__seg">Con segnalazioni</option>
    <option value="__none">Senza segnalazioni</option>
  </select>
</div>
<p class="small muted" id="count"></p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Struttura</th><th class="num" scope="col">Valore produzione</th><th class="num" scope="col">Risultato</th><th scope="col">Segnalazioni</th></tr></thead>
  <tbody id="rows">${rows}</tbody>
</table></div>
<script>
(function(){
  var q=document.getElementById('q'),reg=document.getElementById('reg'),
      grav=document.getElementById('grav'),count=document.getElementById('count'),
      rows=[].slice.call(document.querySelectorAll('#rows tr'));
  var rank={alta:3,media:2,bassa:1,'':0};
  function apply(){
    var t=q.value.trim().toLowerCase(),r=reg.value,g=grav.value,n=0;
    rows.forEach(function(row){
      var ok=true;
      if(t&&row.dataset.nome.indexOf(t)<0)ok=false;
      if(r&&row.dataset.regione!==r)ok=false;
      var gv=row.dataset.grav;
      if(g==='alta'&&gv!=='alta')ok=false;
      else if(g==='media'&&rank[gv]<2)ok=false;
      else if(g==='__seg'&&!gv)ok=false;
      else if(g==='__none'&&gv)ok=false;
      row.classList.toggle('hidden',!ok);
      if(ok)n++;
    });
    count.textContent=n+' strutture';
  }
  q.addEventListener('input',apply);reg.addEventListener('change',apply);grav.addEventListener('change',apply);
  apply();
})();
</script>
`;
  return page({
    title: 'Tutte le strutture — Ospedali Trasparenti',
    description: 'Elenco filtrabile delle aziende sanitarie e ospedaliere pubbliche italiane con valore della produzione e risultato d’esercizio.',
    active: 'strutture.html',
    body,
  });
}

// ---------- SEGNALAZIONI ----------
function renderSegnalazioni({ segn, href }) {
  const regoleOpts = Object.entries(segn.perRegola)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<option value="${k}">${esc(REGOLE_LABEL[k] || k)} (${n})</option>`)
    .join('');
  const regioni = [...new Set(segn.enti.map((e) => e.regione))].sort();
  const regioniOpts = regioni.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('');

  const cards = segn.enti
    .flatMap((e) =>
      e.segnalazioni.map(
        (s) => `<div class="seg ${s.gravita}" data-grav="${s.gravita}" data-reg="${esc(e.regione)}" data-regola="${s.regola}" data-nome="${esc(e.denominazione.toLowerCase())}">
        <div class="t">${badge(s.gravita)} <span>${esc(s.titolo)}</span></div>
        <div class="d">${esc(s.dettaglio)}</div>
        <div class="small" style="margin-top:6px"><a href="${href(e.codice)}">${esc(e.denominazione)}</a> · <span class="muted">${esc(e.regione)}</span></div>
      </div>`
      )
    )
    .join('');

  const body = `
<h1>Segnalazioni</h1>
<p class="lead">${numeroIt(segn.totaleSegnalazioni)} indicatori automatici su ${numeroIt(segn.entiConSegnalazioni)} strutture.
Ogni segnalazione cita i numeri di bilancio da cui deriva. <strong>Sono spie, non verdetti</strong>: un’anomalia
può avere spiegazioni legittime (fusioni, finanziamenti straordinari, cambi di perimetro).</p>
<div class="grid kpis">
  ${kpi('Gravità alta', numeroIt(segn.perGravita.alta), 'neg')}
  ${kpi('Gravità media', numeroIt(segn.perGravita.media))}
  ${kpi('Gravità bassa', numeroIt(segn.perGravita.bassa))}
</div>
<div class="controls">
  <input type="search" id="q" placeholder="Cerca struttura…" aria-label="Cerca">
  <select id="reg" aria-label="Regione"><option value="">Tutte le regioni</option>${regioniOpts}</select>
  <select id="grav" aria-label="Gravità"><option value="">Tutte le gravità</option>
    <option value="alta">Alta</option><option value="media">Media</option><option value="bassa">Bassa</option></select>
  <select id="regola" aria-label="Tipo"><option value="">Tutti i tipi</option>${regoleOpts}</select>
</div>
<p class="small muted" id="count"></p>
<div id="list">${cards}</div>
<script>
(function(){
  var q=document.getElementById('q'),reg=document.getElementById('reg'),grav=document.getElementById('grav'),
      regola=document.getElementById('regola'),count=document.getElementById('count'),
      cards=[].slice.call(document.querySelectorAll('#list .seg'));
  function apply(){
    var t=q.value.trim().toLowerCase(),r=reg.value,g=grav.value,rg=regola.value,n=0;
    cards.forEach(function(c){
      var ok=true;
      if(t&&c.dataset.nome.indexOf(t)<0)ok=false;
      if(r&&c.dataset.reg!==r)ok=false;
      if(g&&c.dataset.grav!==g)ok=false;
      if(rg&&c.dataset.regola!==rg)ok=false;
      c.classList.toggle('hidden',!ok);if(ok)n++;
    });
    count.textContent=n+' segnalazioni';
  }
  [q,reg,grav,regola].forEach(function(el){el.addEventListener('input',apply);el.addEventListener('change',apply);});
  apply();
})();
</script>
`;
  return page({
    title: 'Segnalazioni — Ospedali Trasparenti',
    description: 'Anomalie contabili automatiche negli ospedali pubblici italiani: disavanzi, patrimonio netto negativo, salti anomali di costi e ricavi.',
    active: 'segnalazioni.html',
    body,
  });
}

// ---------- METODOLOGIA ----------
function renderMetodologia({ segn, forense, appalti, appMatch, ultimoAnnoCe }) {
  const regole = [
    ['disavanzo_grave', 'Disavanzo grave', 'Alta', `Risultato d’esercizio inferiore al −${percentualeIt(segn.soglie.disavanzoGrave)} del valore della produzione nell’ultimo anno.`],
    ['patrimonio_netto_negativo', 'Patrimonio netto negativo', 'Alta', 'Patrimonio netto negativo nell’ultimo stato patrimoniale: potenziale squilibrio patrimoniale.'],
    ['debiti_oltre_attivo', 'Debiti oltre l’attivo', 'Alta', 'I debiti superano il totale dell’attivo.'],
    ['disavanzo_persistente', 'Disavanzo persistente', 'Media', 'Risultato negativo in quasi tutti gli ultimi 5 esercizi.'],
    ['squilibrio_strutturale', 'Squilibrio costi/ricavi', 'Media', 'Costi della produzione superiori ai ricavi per almeno 3 esercizi recenti.'],
    ['salto_costi', 'Variazione anomala dei costi', 'Media', `Variazione dei costi superiore al ${percentualeIt(segn.soglie.saltoCosti)} da un anno all’altro.`],
    ['salto_ricavi', 'Variazione anomala dei ricavi', 'Bassa', `Variazione dei ricavi superiore al ${percentualeIt(segn.soglie.saltoRicavi)} da un anno all’altro.`],
    ['personale_elevato', 'Incidenza del personale elevata', 'Bassa', 'Costo del personale sul valore della produzione oltre il 90° percentile nazionale.'],
    ['crescita_debiti', 'Crescita dell’indebitamento', 'Bassa', `Debiti in crescita di oltre il ${percentualeIt(segn.soglie.crescitaDebiti)} sul periodo.`],
    ['buco_rendicontazione', 'Buco nella rendicontazione', 'Bassa', 'Anni mancanti nel mezzo della serie CE.'],
    ['risultato_arrotondato', 'Risultato “troppo tondo”', 'Bassa', 'Risultato d’esercizio esattamente multiplo di 100.000 €: possibile scrittura di pareggio.'],
  ];
  const rows = regole
    .map(([, t, g, d]) => `<tr><td>${esc(t)}</td><td>${badge(g.toLowerCase())}</td><td class="small">${esc(d)}</td></tr>`)
    .join('');
  const body = `
<h1>Metodologia e fonti</h1>
<div class="note">Le segnalazioni sono <strong>indicatori automatici, non accuse</strong>. Segnalano situazioni contabili
che meritano un approfondimento; possono avere spiegazioni pienamente legittime (fusioni di aziende, finanziamenti
straordinari, cambi di perimetro, ripiani regionali). Vanno sempre verificate sulle fonti ufficiali.</div>

<h2>Da dove vengono i dati</h2>
<ul>
  <li><strong>BDAP Open Data (RGS/MEF)</strong> — modelli <em>CE</em> (Conto Economico) e <em>SP</em> (Stato Patrimoniale)
  degli enti del SSN, per singola azienda, dal 2012 al ${ultimoAnnoCe}. Fonte:
  <a href="https://openbdap.rgs.mef.gov.it/it/SSN/Analizza">openbdap.rgs.mef.gov.it</a>.</li>
  <li><strong>Ministero della Salute</strong> — anagrafica delle strutture di ricovero (posti letto, personale, ricoveri).
  Fonte: <a href="https://www.dati.salute.gov.it/">dati.salute.gov.it</a>.</li>
</ul>
<p class="small muted">L’unità di analisi è l’<em>ente SSN</em> (il soggetto giuridico): le aziende ospedaliere autonome
hanno un proprio bilancio; gli ospedali a gestione diretta rientrano nel bilancio della loro ASL. I codici 000 (gestione
sanitaria accentrata regionale) e 999 (consolidato regionale) sono esclusi perché non sono ospedali.</p>

<h2>Le regole di segnalazione</h2>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Regola</th><th scope="col">Gravità</th><th scope="col">Quando scatta</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>

<h2>L’inchiesta «follow the money»</h2>
<p>Oltre alle segnalazioni contabili, analizziamo il <strong>dettaglio dei costi</strong> (modello CE, sezione B) per
le voci più esposte a inefficienza e opacità: acquisti di beni, acquisti di servizi, consulenze e lavoro interinale,
servizi non sanitari (pulizia, mensa, riscaldamento, rifiuti), manutenzioni esternalizzate, godimento di beni di terzi
(affitti/noleggi) e acquisto di prestazioni sanitarie da privati.</p>
<ul class="small">
  <li>Ogni voce è <strong>normalizzata</strong> come quota dei costi della produzione e, dove disponibile, per posto letto (anagrafe del Ministero della Salute).</li>
  <li>Ogni struttura è confrontata anzitutto con il proprio <strong>gruppo di aziende simili</strong> (per tipo —
  ospedaliera / territoriale / altro — e dimensione di spesa), e con la distribuzione nazionale quando il gruppo è
  troppo piccolo: così un piccolo IRCCS non è misurato con il metro di una grande ASL. Statistiche robuste (mediana,
  90° percentile, z-score su mediana e MAD).</li>
  <li>Scatta un segnale se la voce supera il 90° percentile con z&gt;2 <em>e</em> l’importo è materiale (≥ 1 mln €), o se raddoppia da un anno all’altro (+60% e &gt; 2 mln €).</li>
  <li>Il «rosso» di sistema è ricostruito sommando il risultato delle aziende e quello della Gestione Sanitaria Accentrata regionale (GSA, codice 000), che copre gran parte dei disavanzi.</li>
</ul>
${appalti ? `<h3>Gli appalti (ANAC)</h3>
<p>Incrociamo i bilanci con la <strong>Banca Dati Nazionale dei Contratti Pubblici</strong> (ANAC), gare sopra
40.000 € pubblicate negli anni ${rangeAnni(appalti.anni)}. Isoliamo gli enti sanitari e calcoliamo la
<strong>quota di valore affidata senza gara</strong> (affidamento diretto + negoziata senza pubblicazione),
escludendo gli acquisti in adesione ad accordi quadro/convenzioni, già messi a gara a monte.</p>
<ul class="small">
  <li>Confronto tra regioni sempre disponibile (chiave: sezione regionale ANAC).</li>
  <li>Collegamento al singolo bilancio solo con corrispondenza <strong>esatta e non ambigua</strong> di
  denominazione e regione: ${appMatch ? `${appMatch.abbinate} aziende su ${appMatch.totali}` : 'una parte'} abbinate,
  per evitare attribuzioni errate. Per le altre restano i dati regionali.</li>
  <li>Un’alta quota senza gara non prova un illecito: sotto soglia è legittima. Segnala dove guardare.</li>
</ul>
<h3>Fornitori e offerente unico</h3>
<ul class="small">
  <li>Incrociamo i CIG sanitari con gli <strong>aggiudicatari</strong> (chi vince) e i <strong>partecipanti</strong> ANAC.</li>
  <li>La banca dati dei partecipanti è <strong>parziale</strong> (copre circa metà delle gare e talvolta registra solo
  l’aggiudicatario): la quota di «offerente unico registrato» è <strong>indicativa e un limite superiore</strong>.
  I raggruppamenti di imprese (RTI) sono conteggiati come più offerte.</li>
  <li>Nelle classifiche dei fornitori nominiamo solo le <strong>imprese</strong> (partita IVA a 11 cifre): gli operatori
  <strong>persone fisiche non sono nominati</strong> (tutela dei dati personali).</li>
  <li>Essere un grande fornitore, o vincere in un mercato ristretto, <strong>è legittimo</strong> e non è di per sé anomalia.</li>
</ul>
<p class="small muted">Prossimo passo: individuare vincitori ricorrenti sullo stesso ente e possibili
frazionamenti sistematici.</p>` : `<p class="small muted">Prossimo passo possibile: incrocio con gli appalti
pubblici (ANAC) per risalire ai singoli contratti, ai fornitori e alle gare a offerta unica.</p>`}

<h2>Limiti</h2>
<ul class="small">
  <li>I dati sono di cassa/competenza da consuntivo: variazioni di perimetro possono generare falsi positivi.</li>
  <li>Le soglie sono volutamente prudenti per ridurre il rumore; alcune anomalie reali possono non emergere.</li>
  <li>Un’anomalia di spesa <strong>non è prova di illecito</strong>: indica dove conviene approfondire.</li>
  <li>Il progetto è a scopo di trasparenza civica e non sostituisce le fonti ufficiali né la Corte dei conti.</li>
</ul>
<h2>Domande frequenti</h2>
<h3>Cos’è un affidamento diretto?</h3>
<p>L’affidamento diretto è l’assegnazione di un contratto pubblico a un operatore scelto dall’amministrazione
<strong>senza gara</strong>. Il Codice dei contratti (d.lgs. 36/2023) lo consente sotto le soglie di legge
(per servizi e forniture 140.000 €), con obbligo di motivazione e con il <strong>principio di rotazione</strong>
(art. 49): non si può riaffidare ripetutamente allo stesso operatore senza giustificazione. Nel 2023–24 circa la metà
dei contratti sanitari registrati in ANAC è stata assegnata con affidamento diretto o procedura negoziata senza
pubblicazione: per questo il sito ne misura la quota per ogni azienda e regione.</p>
<h3>Cos’è la Gestione Sanitaria Accentrata (GSA)?</h3>
<p>La GSA è la contabilità sanitaria gestita <strong>direttamente dalla Regione</strong> (codice azienda 000), fuori
dai bilanci delle singole aziende. Copre quote di finanziamento e ripiani: per questo il «rosso» delle aziende non è
il disavanzo vero del sistema — va sommato al risultato della GSA. È il cuore della nostra
<a href="inchiesta.html">inchiesta sul deficit</a>.</p>
<h3>Quanto spende la sanità pubblica italiana?</h3>
<p>Nel 2024 il valore della produzione delle aziende del Servizio Sanitario Nazionale tracciate in BDAP supera i
<strong>240 miliardi di euro</strong>. La spesa è rendicontata nei modelli CE (conto economico) di ogni azienda,
pubblicati dalla Ragioneria Generale dello Stato e rielaborati da questo sito, struttura per struttura.</p>
<h3>Un indicatore di anomalia significa che c’è un illecito?</h3>
<p><strong>No.</strong> Gli indicatori sono elaborazioni statistiche automatiche su dati ufficiali: segnalano dove
conviene approfondire, non dimostrano irregolarità. Un’alta quota senza gara o una relazione ricorrente possono avere
spiegazioni pienamente legittime (brevetti, monopoli tecnici, convenzioni). La verifica spetta alle autorità
competenti (Corte dei conti, ANAC).</p>

<p class="small muted">Elaborazione automatica open source di Carbon Stealth VCC.</p>
`;
  const suM = siteUrl();
  const faqLd = suM
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          ['Cos’è un affidamento diretto?', 'L’assegnazione di un contratto pubblico senza gara, consentita sotto le soglie di legge (140.000 € per servizi e forniture) con obbligo di motivazione e principio di rotazione (art. 49, d.lgs. 36/2023). Nel 2023–24 circa la metà dei contratti sanitari in ANAC è stata assegnata così.'],
          ['Cos’è la Gestione Sanitaria Accentrata (GSA)?', 'La contabilità sanitaria gestita direttamente dalla Regione (codice 000), fuori dai bilanci delle aziende: copre finanziamenti e ripiani, quindi il disavanzo vero del sistema è aziende + GSA.'],
          ['Quanto spende la sanità pubblica italiana?', 'Nel 2024 il valore della produzione delle aziende del SSN tracciate in BDAP supera i 240 miliardi di euro, rendicontati nei modelli CE pubblicati dalla Ragioneria Generale dello Stato.'],
          ['Un indicatore di anomalia significa che c’è un illecito?', 'No: gli indicatori sono elaborazioni statistiche automatiche che segnalano dove approfondire, non prove di irregolarità. La verifica spetta a Corte dei conti e ANAC.'],
        ].map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
      }
    : null;
  return page({
    title: 'Metodologia — Ospedali Trasparenti',
    description: 'Fonti ufficiali e regole di segnalazione automatica delle anomalie contabili degli ospedali pubblici italiani. Cos’è un affidamento diretto, cos’è la GSA, quanto spende il SSN.',
    active: 'metodologia.html',
    jsonld: faqLd,
    body,
  });
}

// ---------- DETTAGLIO STRUTTURA ----------
function renderStruttura({ ente, struttureByCod, anagrafica, seg, forse, app, contratti, appMatch, ultimoAnnoCe, bench = {}, reg = null }) {
  const anag = ente.anag;
  const anni = [...ente.serie.keys()].sort((a, b) => a - b);
  const val = (k) => anni.map((a) => [a, ente.serie.get(a)[k]]).filter(([, v]) => v != null);
  const { anno: annoUlt, y: yUlt } = ultimoCe(ente);

  const chartCR = lineChart(
    [
      { label: 'Valore della produzione', color: 'var(--brand)', points: val('valoreProduzione') },
      { label: 'Costi della produzione', color: 'var(--neg)', points: val('costiProduzione') },
    ],
    { caption: 'Ricavi e costi della produzione per anno (€)' }
  );
  const chartRis = barChart(val('risultatoEsercizio'), { caption: 'Risultato d’esercizio per anno (€)' });

  // KPI за последната година
  const ris = yUlt.risultatoEsercizio;
  const kpis = `<div class="grid kpis">
    ${kpi(`Valore produzione (${annoUlt ?? '—'})`, euroIt(yUlt.valoreProduzione))}
    ${kpi('Costi produzione', euroIt(yUlt.costiProduzione))}
    ${kpi('Risultato d’esercizio', euroIt(ris), ris < 0 ? 'neg' : ris > 0 ? 'pos' : '')}
    ${kpi('Costo del personale', euroIt(yUlt.costoPersonale))}
  </div>`;

  // Benchmark €/легло и €/приемане срещу националната медиана (ако има анаграфика)
  const lettiB = postiLettoEnte(ente, anagrafica);
  const ricB = ricoveriEnte(ente, anagrafica);
  let benchBlk = '';
  if (yUlt.costiProduzione && (lettiB > 0 || ricB > 0) && (bench.cplMed || bench.cprMed)) {
    const cpl = lettiB > 0 ? yUlt.costiProduzione / lettiB : null;
    const cpr = ricB > 0 ? yUlt.costiProduzione / ricB : null;
    const cella = (v, med, lab) =>
      v && med
        ? kpi(lab, `${euroCompact(v)} <span class="small muted">(mediana ${euroCompact(med)})</span>`, v > med * 1.5 ? 'neg' : '')
        : '';
    benchBlk = `<h2>Quanto costa, in proporzione</h2>
  <div class="grid kpis">${cella(cpl, bench.cplMed, 'Costi per posto letto')}${cella(cpr, bench.cprMed, 'Costi per ricovero')}</div>
  <p class="small muted">Costi della produzione (${annoUlt}) rapportati a posti letto e ricoveri dell'anagrafe ospedaliera,
  confrontati con la mediana nazionale. Le ASL territoriali spendono anche fuori dagli ospedali (territorio, farmaceutica
  convenzionata): il confronto è indicativo, più solido tra aziende dello stesso tipo.</p>`;
  }

  // Панел „La tua regione" — свързва болницата с регионалните анализи (100% надежден
  // регионален join; кодовете на отделните структури между министерските датасети
  // не съвпадат, затова тук е регионалният контекст, не собствената дотация).
  let regBlk = '';
  if (reg && reg.href) {
    const f1 = (x) => (x == null ? null : x.toLocaleString('it-IT', { maximumFractionDigits: 1 }));
    const cardReg = (href, lab, val) =>
      val == null ? '' : `<a class="seg media" href="${href}" style="text-decoration:none"><div class="t">${lab}</div><div class="d"><strong>${val}</strong></div></a>`;
    const celle = [
      cardReg('apparecchiature.html', 'Dotazione tecnologica', reg.tacPerMln != null ? `${f1(reg.tacPerMln)} TC/mln${reg.robot ? ` · ${reg.robot} robot` : ''}` : null),
      cardReg('sdo.html', 'Volumi di ricovero', reg.ricoveriPer1000 != null ? `${f1(reg.ricoveriPer1000)} ric./1.000 ab.` : null),
      cardReg('siope.html', 'Cassa di dicembre', reg.siopeDic != null ? `${reg.siopeDic.toLocaleString('it-IT', { maximumFractionDigits: 2 })}× il mese medio` : null),
      cardReg('pnrr-salute.html', 'PNRR Missione 6', reg.pnrrProCapite != null ? `${euroIt(Math.round(reg.pnrrProCapite))}/ab.` : null),
    ].filter(Boolean).join('');
    if (celle) {
      regBlk = `<h2>La regione: ${esc(reg.nome)}</h2>
  <p class="small muted">Indicatori della regione a cui appartiene questa azienda (dato regionale, non della singola struttura). Approfondisci in <a href="${reg.href}">${esc(reg.nome)}</a>.</p>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">${celle}</div>`;
    }
  }

  // Оперативен профил
  const own = struttureByCod.get(ente.codice);
  const presidi = anagrafica.strutture.filter(
    (s) => s.codiceRegione === ente.codReg && s.codiceAsl === ente.codEnte && s.codice !== ente.codice
  );
  const opRows = own ? [own] : presidi;
  const opTable = opRows.length
    ? `<h2>Profilo operativo <span class="small muted">(anagrafe ospedaliera, ${opRows[0].anno})</span></h2>
       <div class="tablewrap"><table>
       <thead><tr><th scope="col">Ospedale</th><th class="num" scope="col">Posti letto</th><th class="num" scope="col">Personale</th><th class="num" scope="col">di cui medici</th><th class="num" scope="col">Ricoveri</th><th class="num" scope="col">Giornate</th></tr></thead>
       <tbody>${opRows
         .map(
           (s) => `<tr><td>${esc(s.denominazione)}<div class="small muted">${esc(s.comune)} (${esc(s.provincia)})</div></td>
           <td class="num">${numeroIt(s.postiLetto)}</td><td class="num">${numeroIt(s.personale)}</td>
           <td class="num">${numeroIt(s.medici)}</td><td class="num">${numeroIt(s.ricoveri)}</td><td class="num">${numeroIt(s.giornateDegenza)}</td></tr>`
         )
         .join('')}</tbody></table></div>`
    : '';

  // Таблица показатели по години
  const indicators = [...CE_INDICATORS, ...SP_INDICATORS];
  const finTable = `<h2>Indicatori per anno</h2>
    <div class="tablewrap"><table>
    <thead><tr><th scope="col">Anno</th>${indicators.map((i) => `<th class="num" scope="col">${esc(i.label)}</th>`).join('')}</tr></thead>
    <tbody>${anni
      .map((a) => {
        const y = ente.serie.get(a);
        return `<tr><td>${a}</td>${indicators
          .map((i) => {
            const v = y[i.key];
            const cls = i.key === 'risultatoEsercizio' && v != null ? (v < 0 ? 'neg' : 'pos') : '';
            return `<td class="num ${cls}">${euroIt(v)}</td>`;
          })
          .join('')}</tr>`;
      })
      .join('')}</tbody></table></div>`;

  // „Dove vanno i soldi“ — разходен разбор + форензик флагове
  let soldiBlock = '';
  if (forse && forse.cat && Object.keys(forse.cat).length) {
    const flaggedCats = new Set(forse.flags.map((f) => f.categoria));
    const items = CE_FORENSICS.map((c) => forse.cat[c.key] && ({
      label: FOR_LABEL[c.key],
      valore: forse.cat[c.key].valore,
      quota: forse.cat[c.key].quotaCosti,
      flag: flaggedCats.has(c.key),
    }))
      .filter(Boolean)
      .sort((a, b) => b.quota - a.quota);
    const flagList = forse.flags.length
      ? `<h3>Segnali «follow the money» <span class="small muted">(${forse.flags.length})</span></h3>` +
        forse.flags
          .map(
            (f) => `<div class="seg alta"><div class="t"><span class="badge alta">!</span> <span>${esc(f.label)}</span></div>
            <div class="d">${esc(f.testo)}</div></div>`
          )
          .join('')
      : '';
    const peerTxt = forse.peer
      ? ` · confronto con aziende simili (${esc(forse.peer.replace('|', ', '))})`
      : '';
    soldiBlock = `<h2>Dove vanno i soldi <span class="small muted">(${forse.anno}, quota dei costi della produzione${peerTxt})</span></h2>
      <div class="card">${hbars(items, { fmt: euroCompact, maxLabel: 'Composizione della spesa per categoria' })}</div>
      ${flagList}`;
  }

  // Сигнали
  const segBlock = seg
    ? `<h2>Segnalazioni <span class="small muted">(${seg.segnalazioni.length})</span></h2>${seg.segnalazioni
        .map(
          (s) => `<div class="seg ${s.gravita}"><div class="t">${badge(s.gravita)} <span>${esc(s.titolo)}</span></div>
          <div class="d">${esc(s.dettaglio)}</div></div>`
        )
        .join('')}`
    : `<h2>Segnalazioni</h2><p class="note">Nessuna anomalia rilevata dai controlli automatici sui dati disponibili.</p>`;

  // Подробен CE (последна година)
  const ceRows = ente.ceUltimo
    .filter((v) => isDetailLine(v.desc) && v.importo !== 0)
    .map((v) => `<tr><td>${esc(v.desc)}</td><td class="num">${euroIt(v.importo)}</td></tr>`)
    .join('');
  const ceBlock = ceRows
    ? `<h2>Conto economico dettagliato <span class="small muted">(${ente.ceUltimoAnno})</span></h2>
       <div class="tablewrap"><table><thead><tr><th scope="col">Voce</th><th class="num" scope="col">Importo</th></tr></thead><tbody>${ceRows}</tbody></table></div>`
    : '';

  const spRows = ente.spUltimo
    .filter((v) => isTopLevelSp(v.desc) && v.importo !== 0)
    .map((v) => `<tr><td>${esc(v.desc)}</td><td class="num">${euroIt(v.importo)}</td></tr>`)
    .join('');
  const spBlock = spRows
    ? `<h2>Stato patrimoniale <span class="small muted">(${ente.spUltimoAnno})</span></h2>
       <div class="tablewrap"><table><thead><tr><th scope="col">Voce</th><th class="num" scope="col">Importo</th></tr></thead><tbody>${spRows}</tbody></table></div>`
    : '';

  const meta = [
    `<span class="chip">${esc(ente.regione)}</span>`,
    `<span class="chip">${esc(tipoEnte(ente.codEnte, anag))}</span>`,
    anag && anag.comune ? `<span class="chip">${esc(anag.comune)} (${esc(anag.provincia)})</span>` : '',
    `<span class="chip">codice ${esc(ente.codice)}</span>`,
    seg ? `${badge(seg.gravitaMax)}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = `
<a class="backlink" href="../strutture.html">← Tutte le strutture</a>
<h1>${esc(ente.denominazione)}</h1>
<p>${meta}</p>
${anag && anag.indirizzo ? `<p class="muted small">${esc(anag.indirizzo)}${anag.comune ? ', ' + esc(anag.comune) : ''}</p>` : ''}

${kpis}
${benchBlk}
${segBlock}

<h2>Andamento economico</h2>
<div class="grid" style="grid-template-columns:1fr">
  <div class="card">${chartCR}</div>
  <div class="card">${chartRis}</div>
</div>

${soldiBlock}
${appaltiBlock(app, appMatch)}
${contrattiBlock(ente, contratti)}
${opTable}
${regBlk}
${finTable}
${ceBlock}
${spBlock}

<p class="small muted" style="margin-top:26px">Fonte: <a href="https://openbdap.rgs.mef.gov.it/it/SSN/Analizza">BDAP — RGS/MEF</a>
(modelli CE/SP del SSN) e <a href="https://www.dati.salute.gov.it/">dati.salute.gov.it</a>. Importi in euro dai consuntivi.</p>
`;
  const percorso = `struttura/${ente.codice}-${slugify(ente.denominazione)}.html`;
  const su = siteUrl();
  // entity граф за дългата опашка („bilancio <болница>"): breadcrumb + субект
  const jsonld = su
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          briciole([['Home', '/'], ['Strutture', 'strutture.html'], [ente.denominazione, percorso]]),
          {
            '@type': 'GovernmentOrganization',
            name: ente.denominazione,
            address: { '@type': 'PostalAddress', addressRegion: ente.regione, addressCountry: 'IT' },
            subjectOf: {
              '@type': 'Dataset',
              name: `Bilancio e appalti — ${ente.denominazione}`,
              temporalCoverage: '2012/2024',
              license: 'https://creativecommons.org/licenses/by/4.0/',
              url: `${su}/${percorso}`,
            },
          },
        ],
      }
    : null;
  return page({
    title: `${ente.denominazione} — Ospedali Trasparenti`,
    description: `Bilancio, entrate, spese e segnalazioni contabili di ${ente.denominazione} (${ente.regione}).`,
    active: 'strutture.html',
    rel: '../',
    canonical: percorso,
    jsonld,
    body,
  });
}

const FOR_LABEL = Object.fromEntries(CE_FORENSICS.map((c) => [c.key, c.label]));

// ---------- DATI E VERIFICHE ----------
function renderVerifiche({ validaz, appMatch }) {
  const c = validaz.consistenzaCE;
  const cov = validaz.copertura;
  const provRows = validaz.provenance
    .map(
      (p) => `<tr><td>${esc(p.file)}</td><td class="num">${p.righe != null ? numeroIt(p.righe) : '—'}</td>
      <td class="num">${numeroIt(Math.round(p.bytes / 1024))} KB</td><td class="small" style="font-family:monospace">${esc(p.sha256)}</td></tr>`
    )
    .join('');
  const body = `
<h1>Dati e verifiche</h1>
<p class="lead">Per essere credibili, i numeri devono essere <strong>verificabili e riproducibili</strong>. Qui
pubblichiamo i controlli automatici di consistenza, la copertura dei dati e la «carta d’identità» (impronta) di ogni
file di origine.</p>

<div class="grid kpis">
  ${kpi('Identità contabili CE superate', percentualeIt(c.quotaSuperata), (c.quotaSuperata || 0) > 0.99 ? 'pos' : '')}
  ${kpi('Aziende con bilancio (CE)', `${numeroIt(cov.conCE)} / ${numeroIt(cov.entiTotali)}`)}
  ${kpi('Abbinate agli appalti ANAC', `${numeroIt(cov.conAppaltiANAC)} / ${numeroIt(cov.entiTotali)}`)}
  ${kpi('Con dati sui fornitori', `${numeroIt(cov.conAggiudicatari ?? 0)} / ${numeroIt(cov.entiTotali)}`)}
</div>

<h2>Consistenza contabile</h2>
<p class="muted small">Su ogni bilancio verifichiamo le identità del modello CE: <em>risultato prima delle imposte
= valore − costi ± proventi/oneri finanziari ± rettifiche ± straordinari</em>; <em>risultato d’esercizio = risultato
prima delle imposte − imposte</em> (tolleranza 0,1%).</p>
<p><strong>${numeroIt(c.superate)} su ${numeroIt(c.identitaVerificate)}</strong> bilanci-anno superano entrambe le
identità (${percentualeIt(c.quotaSuperata)}). Gli scarti residui derivano da riclassificazioni nella fonte, non
dall’estrazione. ${c.fallite.length ? `Casi non quadrati: ${c.fallite.map((f) => `${esc(f.codice)}/${f.anno}`).join(', ')}.` : ''}</p>

<h2>Controlli di plausibilità</h2>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Controllo</th><th class="num" scope="col">Violazioni</th></tr></thead>
  <tbody>
    <tr><td>Valore della produzione negativo</td><td class="num">${numeroIt(validaz.sanita.valoreNegativo)}</td></tr>
    <tr><td>Costi della produzione negativi</td><td class="num">${numeroIt(validaz.sanita.costiNegativi)}</td></tr>
    <tr><td>Debiti negativi</td><td class="num">${numeroIt(validaz.sanita.debitiNegativi)}</td></tr>
    <tr><td>Disavanzo superiore ai ricavi</td><td class="num">${numeroIt(validaz.sanita.deficitOltreRicavi)}</td></tr>
  </tbody>
</table></div>

<h2>Copertura per fonte</h2>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Dato</th><th class="num" scope="col">Aziende</th></tr></thead>
  <tbody>
    <tr><td>Conto economico (CE)</td><td class="num">${numeroIt(cov.conCE)} / ${numeroIt(cov.entiTotali)}</td></tr>
    <tr><td>Stato patrimoniale (SP)</td><td class="num">${numeroIt(cov.conSP)} / ${numeroIt(cov.entiTotali)}</td></tr>
    <tr><td>Anagrafe ospedaliera</td><td class="num">${numeroIt(cov.conAnagrafe)} / ${numeroIt(cov.entiTotali)}</td></tr>
    <tr><td>Appalti ANAC (abbinamento esatto)</td><td class="num">${numeroIt(cov.conAppaltiANAC)} / ${numeroIt(cov.entiTotali)}</td></tr>
    <tr><td>Fornitori (aggiudicatari)</td><td class="num">${numeroIt(cov.conAggiudicatari ?? 0)} / ${numeroIt(cov.entiTotali)}</td></tr>
  </tbody>
</table></div>
<p class="small muted">L’abbinamento agli appalti è volutamente conservativo (solo corrispondenze esatte e non ambigue):
meglio una scheda senza appalti che un’attribuzione errata. Il confronto tra regioni copre invece il 100% degli enti.</p>

<h2>Provenienza dei dati (impronta)</h2>
<p class="muted small">Dimensione, numero di righe e impronta SHA-256 (prime 16 cifre) di ogni file di origine, per
consentire la verifica e la riproduzione dei risultati.</p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">File</th><th class="num" scope="col">Righe</th><th class="num" scope="col">Dimensione</th><th scope="col">SHA-256</th></tr></thead>
  <tbody>${provRows}</tbody>
</table></div>
<p class="small muted">Generato il ${esc(validaz.generatoIl.slice(0, 10))}. L’intero pipeline è open source e
rieseguibile con <code>npm run all</code>.</p>
`;
  return page({
    title: 'Dati e verifiche — Ospedali Trasparenti',
    description: 'Controlli di consistenza contabile, copertura dei dati e impronta delle fonti: numeri verificabili e riproducibili.',
    active: 'verifiche.html',
    body,
  });
}

// ---------- REGIONI (страници + схематична карта) ----------
// Цветова скала за дела „senza gara“: светло → тъмночервено (ColorBrewer Reds).
function scalaRossi(t) {
  const stops = [
    [0.0, [255, 245, 240]],
    [0.25, [252, 187, 161]],
    [0.5, [252, 146, 114]],
    [0.75, [222, 45, 38]],
    [1.0, [153, 0, 13]],
  ];
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const f = (x - a) / (b - a || 1);
      const c = ca.map((v, j) => Math.round(v + (cb[j] - v) * f));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return 'rgb(153,0,13)';
}

// Обединява няколко ANAC регионални реда (за Трентино: Болцано + Тренто).
function mergeAppRows(rows) {
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];
  const out = { reg: rows[0].reg, n: 0, importo: 0, cat: {}, band40: 0, band140: 0, prorogaN: 0, urgenzaN: 0, pnrrImporto: 0 };
  for (const r of rows) {
    out.n += r.n || 0;
    out.importo += r.importo || 0;
    out.band40 += r.band40 || 0;
    out.band140 += r.band140 || 0;
    out.prorogaN += r.prorogaN || 0;
    out.urgenzaN += r.urgenzaN || 0;
    out.pnrrImporto += r.pnrrImporto || 0;
    for (const [k, v] of Object.entries(r.cat || {})) {
      if (!out.cat[k]) out.cat[k] = { n: 0, importo: 0 };
      out.cat[k].n += v.n || 0;
      out.cat[k].importo += v.importo || 0;
    }
  }
  return out;
}

// Ръчно нагласени котви на етикетите (viewBox 0 0 1000 1298). Изходна точка:
// ПЛОЩНИЯТ центроид на най-големия ринг (не средно на върховете — крайбрежната
// детайлност го дърпа), после визуални корекции. Малките/тънките региони
// (VdA, Liguria, Molise) са с ИЗНЕСЕН етикет + водеща линия, като в
// професионалната картография.
const MAP_LABELS = {
  '01': { x: 105, y: 230 }, // Piemonte
  '02': { fuori: { tx: 68, ty: 94, lx1: 66, ly1: 104, lx2: 64, ly2: 138 } }, // Valle d'Aosta
  '03': { x: 264, y: 168 }, // Lombardia
  '04': { x: 391, y: 82 }, // Trentino-Alto Adige
  '05': { x: 447, y: 168 }, // Veneto
  '06': { x: 545, y: 102 }, // Friuli-VG
  '07': { fuori: { tx: 148, ty: 415, lx1: 152, ly1: 400, lx2: 170, ly2: 348 } }, // Liguria
  '08': { x: 371, y: 290 }, // Emilia-Romagna
  '09': { x: 375, y: 412 }, // Toscana
  '10': { x: 486, y: 470 }, // Umbria
  '11': { x: 562, y: 406 }, // Marche
  '12': { x: 508, y: 577 }, // Lazio
  '13': { x: 614, y: 540 }, // Abruzzo
  '14': { fuori: { tx: 748, ty: 528, lx1: 728, ly1: 536, lx2: 688, ly2: 574 } }, // Molise
  '15': { x: 686, y: 702 }, // Campania
  '16': { x: 866, y: 692 }, // Puglia
  '17': { x: 798, y: 744 }, // Basilicata
  '18': { x: 834, y: 874 }, // Calabria
  '19': { x: 630, y: 1066 }, // Sicilia
  '20': { x: 202, y: 786 }, // Sardegna
};

// WCAG relative luminance на "rgb(r,g,b)" — за избора бял/тъмен текст на етикета.
function luminanza(rgb) {
  const m = rgb.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!m) return 0.5;
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(+m[1]) + 0.7152 * lin(+m[2]) + 0.0722 * lin(+m[3]);
}

function cartogramma(regioniData) {
  const byKey = new Map(regioniData.map((r) => [r.key, r]));
  const vals = regioniData.filter((r) => r.senzaGaraPct != null).map((r) => r.senzaGaraPct);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const shapes = Object.entries(REGIONI)
    .map(([key, meta]) => {
      const d = REGIONI_GEO[meta.istat];
      if (!d) return '';
      const r = byKey.get(key);
      const pctv = r ? r.senzaGaraPct : null;
      const t = pctv != null && max > min ? (pctv - min) / (max - min) : null;
      const fill = t != null ? scalaRossi(t) : '#c9d2db';
      const pct = pctv != null ? `${Math.round(pctv * 100)}%` : 'n.d.';
      const label = `${meta.nome}: senza gara ${pct}${r ? `, ${r.nEnti} strutture` : ''}`;
      const pos = MAP_LABELS[meta.istat] || null;
      let etichetta = '';
      if (pos && pctv != null) {
        if (pos.fuori) {
          // изнесен етикет: една линия „ABBR · %“ в цвета на темата + водеща линия
          const f = pos.fuori;
          etichetta = `<line x1="${f.lx1}" y1="${f.ly1}" x2="${f.lx2}" y2="${f.ly2}" stroke="var(--muted)" stroke-width="1.4" pointer-events="none"></line>
        <text x="${f.tx}" y="${f.ty}" text-anchor="middle" font-size="26" font-weight="650" fill="var(--ink)" stroke="var(--bg)" stroke-width="5" paint-order="stroke" stroke-linejoin="round" pointer-events="none">${esc(meta.abbr)} ${pct}</text>`;
        } else {
          // вътрешен етикет: контурен ореол (paint-order:stroke) → четимо върху всеки цвят.
          // Бял или тъмен текст се избира по РЕАЛНАТА светимост (WCAG relative
          // luminance) на запълването — прагът по t греши на средните тонове.
          const chiaro = luminanza(fill) < 0.25;
          const testo = chiaro ? '#fff' : '#26313c';
          const alone = chiaro ? 'rgba(60,10,5,.55)' : 'rgba(255,255,255,.9)';
          etichetta = `<text x="${pos.x}" y="${pos.y - 5}" text-anchor="middle" font-size="30" font-weight="700" letter-spacing=".5" fill="${testo}" stroke="${alone}" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round" pointer-events="none">${esc(meta.abbr)}</text>
        <text x="${pos.x}" y="${pos.y + 21}" text-anchor="middle" font-size="24" font-weight="600" fill="${testo}" stroke="${alone}" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round" pointer-events="none">${pct}</text>`;
        }
      }
      return `<a href="regione/${key}.html" role="listitem"><title>${esc(label)}</title>
      <path d="${d}" fill="${fill}" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"></path>${etichetta}</a>`;
    })
    .join('\n');
  const legW = 220;
  const legStops = [0, 0.25, 0.5, 0.75, 1].map((s) => `<stop offset="${s * 100}%" stop-color="${scalaRossi(s)}"></stop>`).join('');
  return `<figure class="mapfig">
<svg viewBox="${VIEWBOX}" role="list" aria-label="Carta dell’Italia: quota di appalti senza gara per regione" class="italia">
${shapes}
</svg>
<div class="maplegend">
  <span class="small muted">Quota senza gara:</span>
  <svg width="${legW}" height="14" aria-hidden="true"><defs><linearGradient id="lg">${legStops}</linearGradient></defs><rect width="${legW}" height="14" rx="3" fill="url(#lg)"></rect></svg>
  <span class="small muted">${Math.round(min * 100)}% → ${Math.round(max * 100)}%</span>
</div>
<figcaption class="small muted">Ogni regione è colorata per <strong>quota di appalti aggiudicati senza gara</strong>
(affidamento diretto + negoziata senza pubblicazione, sul numero di contratti). Passa il mouse per i dettagli, clicca per
la scheda. Confini: © <a href="https://www.istat.it/">ISTAT</a> (CC BY 4.0); dati appalti: ANAC.</figcaption>
</figure>`;
}

function renderRegioniIndex({ regioniData }) {
  const ordinate = [...regioniData].filter((r) => r.senzaGaraPct != null).sort((a, b) => b.senzaGaraPct - a.senzaGaraPct);
  const rows = ordinate
    .map(
      (r) => `<tr>
      <td><a href="regione/${r.key}.html">${esc(r.nome)}</a></td>
      <td class="num">${percentualeIt(r.senzaGaraPct)}</td>
      <td class="num">${numeroIt(r.nEnti)}</td>
      <td class="num">${euroCompact(r.valore)}</td>
      <td class="num ${r.risultato < 0 ? 'neg' : 'pos'}">${euroCompact(r.risultato)}</td>
    </tr>`
    )
    .join('');
  const body = `
<h1>Le regioni a confronto</h1>
<p class="lead">La sanità è organizzata su base regionale: ogni Regione governa le proprie aziende. La carta mostra,
per regione, la <strong>quota di appalti senza gara</strong> — un indicatore di apertura del mercato, non una prova di
irregolarità. Clicca una regione per la scheda completa.</p>

${cartogramma(regioniData)}

<h2>Classifica per quota senza gara</h2>
<p class="muted small">Ordinate dalla quota più alta. Il «risultato» è la somma dei risultati d’esercizio delle sole
aziende (senza la Gestione Sanitaria Accentrata regionale), quindi non è il disavanzo «vero» della regione.</p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Regione</th><th class="num" scope="col">Senza gara</th><th class="num" scope="col">Strutture</th><th class="num" scope="col">Valore produzione</th><th class="num" scope="col">Risultato aziende</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<p class="small muted">La quota «senza gara» è calcolata sul 100% dei contratti ANAC di ogni sezione regionale
(dato robusto per il confronto tra regioni). Sette regioni sono in <strong>piano di rientro</strong> (Calabria e
Molise commissariate) — il contesto è indicato nelle rispettive schede. <a href="appalti.html">Dettaglio appalti →</a></p>
`;
  return page({
    title: 'Regioni a confronto — Ospedali Trasparenti',
    description: 'Carta schematica dell’Italia e classifica regionale della quota di appalti senza gara nella sanità pubblica. Dati ANAC.',
    active: 'regioni.html',
    body,
  });
}

function renderRegione({ key, meta, g, appReg, senzaGaraPct, segnByCod, ultimoAnnoCe, slugByCod }) {
  const hrefStrut = (cod) => `../struttura/${cod}-${slugByCod.get(cod)}.html`;
  // структури, подредени по брой/тежест на сигналите
  const gravOrd = { alta: 3, media: 2, bassa: 1 };
  const strutture = [...g.enti]
    .map((e) => {
      const s = segnByCod.get(e.codice);
      const { y } = ultimoCe(e);
      return { e, nSeg: s ? s.segnalazioni.length : 0, gravMax: s ? s.gravitaMax : null, valore: y.valoreProduzione, ris: y.risultatoEsercizio };
    })
    .sort((a, b) => (gravOrd[b.gravMax] || 0) - (gravOrd[a.gravMax] || 0) || b.nSeg - a.nSeg || (b.valore || 0) - (a.valore || 0));
  const rows = strutture
    .map(
      (r) => `<tr>
      <td><a href="${hrefStrut(r.e.codice)}">${esc(r.e.denominazione)}</a></td>
      <td>${r.gravMax ? badge(r.gravMax) : '<span class="small muted">—</span>'}</td>
      <td class="num">${r.nSeg || ''}</td>
      <td class="num">${r.valore != null ? euroCompact(r.valore) : '—'}</td>
      <td class="num ${r.ris < 0 ? 'neg' : 'pos'}">${r.ris != null ? euroCompact(r.ris) : '—'}</td>
    </tr>`
    )
    .join('');
  // разбивка на поръчките за региона
  let appaltiBlk = '';
  if (appReg) {
    const cat = appReg.cat;
    const ordine = [
      ['diretto', 'Affidamento diretto'],
      ['negoziataSenza', 'Negoziata senza pubblicazione'],
      ['negoziata', 'Negoziata con pubblicazione'],
      ['competitiva', 'Procedura aperta/competitiva'],
      ['quadro', 'Accordo quadro/convenzione'],
      ['altro', 'Altro'],
    ];
    const catRows = ordine
      .filter(([k]) => cat[k] && cat[k].n)
      .map(([k, lab]) => `<tr><td>${lab}</td><td class="num">${numeroIt(cat[k].n)}</td><td class="num">${euroCompact(cat[k].importo)}</td></tr>`)
      .join('');
    appaltiBlk = `
<h2>Appalti sanitari della regione</h2>
<div class="grid kpis">
  ${kpi('Contratti (sezione regionale)', numeroIt(appReg.n))}
  ${kpi('Valore complessivo', euroCompact(appReg.importo))}
  ${kpi('Quota senza gara', senzaGaraPct != null ? percentualeIt(senzaGaraPct) : '—', senzaGaraPct > 0.5 ? 'neg' : '')}
  ${kpi('Sotto soglia (frazionamento?)', numeroIt((appReg.band40 || 0) + (appReg.band140 || 0)))}
</div>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Tipo di procedura</th><th class="num" scope="col">Contratti</th><th class="num" scope="col">Valore</th></tr></thead>
  <tbody>${catRows}</tbody>
</table></div>
<p class="small muted">«Senza gara» = affidamento diretto + negoziata senza pubblicazione (esclusi gli accordi quadro,
già messi a gara a monte), sul numero di contratti. Gli affidamenti sotto soglia appena inferiori ai limiti di legge
(35–40k / 130–140k €) sono un possibile segnale di frazionamento, <strong>non una prova</strong>.</p>`;
  }
  const body = `
<p class="small muted"><a href="../regioni.html">← Tutte le regioni</a></p>
<h1>${esc(meta.nome)}</h1>
${PIANO_RIENTRO[key] ? `<div class="seg ${PIANO_RIENTRO[key] === 'commissariata' ? 'alta' : 'media'}"><div class="t"><span class="badge ${PIANO_RIENTRO[key] === 'commissariata' ? 'alta' : 'media'}">${PIANO_RIENTRO[key] === 'commissariata' ? 'Commissariata' : 'Piano di rientro'}</span></div><div class="d">La sanità di questa regione è sottoposta a <strong>piano di rientro</strong>${PIANO_RIENTRO[key] === 'commissariata' ? ' con <strong>commissariamento</strong>' : ''}: i conti sono sotto controllo del Ministero della Salute e del MEF. Contesto essenziale per leggere deficit e vincoli di spesa. <a href="https://www.salute.gov.it/new/it/tema/piani-di-rientro/" target="_blank" rel="noopener">Fonte ufficiale</a>.</div></div>` : ''}
<div class="grid kpis">
  ${kpi('Strutture con bilancio', `${numeroIt(g.conCe)} / ${numeroIt(g.enti.length)}`)}
  ${kpi(`Valore produzione (${ultimoAnnoCe})`, euroCompact(g.valore))}
  ${kpi('Risultato aziende (aggregato)', euroCompact(g.risultato), g.risultato < 0 ? 'neg' : 'pos')}
  ${kpi('Strutture in perdita', `${numeroIt(g.nInPerdita)} / ${numeroIt(g.conCe)}`, g.nInPerdita > g.conCe / 2 ? 'neg' : '')}
</div>
<div class="note"><strong>Nota.</strong> Il «risultato aziende» somma i soli conti economici delle aziende della regione;
non include la Gestione Sanitaria Accentrata (GSA), che a livello regionale copre gran parte dei disavanzi. È quindi un
dato di contesto, non il disavanzo «vero» della regione. → <a href="../inchiesta.html">L’inchiesta sul deficit</a></div>
${appaltiBlk}
<h2>Strutture della regione</h2>
<p class="muted small">Ordinate per gravità e numero delle segnalazioni contabili automatiche (indicatori, non accuse).</p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Struttura</th><th scope="col">Gravità</th><th class="num" scope="col">Segn.</th><th class="num" scope="col">Valore prod.</th><th class="num" scope="col">Risultato</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
`;
  const su = siteUrl();
  const jsonldReg = su
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          briciole([['Home', '/'], ['Regioni', 'regioni.html'], [meta.nome, `regione/${key}.html`]]),
          {
            '@type': 'Dataset',
            name: `Sanità pubblica in ${meta.nome}: conti e appalti`,
            spatialCoverage: { '@type': 'Place', name: meta.nome, address: { '@type': 'PostalAddress', addressCountry: 'IT' } },
            temporalCoverage: '2012/2024',
            license: 'https://creativecommons.org/licenses/by/4.0/',
            url: `${su}/regione/${key}.html`,
          },
        ],
      }
    : null;
  return page({
    title: `${esc(meta.nome)} — sanità pubblica — Ospedali Trasparenti`,
    description: `Conti e appalti delle aziende sanitarie e ospedaliere pubbliche in ${esc(meta.nome)}: valore della produzione, risultato, quota di appalti senza gara.`,
    active: 'regioni.html',
    rel: '../',
    canonical: `regione/${key}.html`,
    jsonld: jsonldReg,
    body,
  });
}

// ---------- RELAZIONI RICORRENTI (индикатори „конфликт на интереси") ----------
// Периметърът (брой болници с опис) идва от данните — не се хардкодва.
const coiFlagLabel = (perimetro) => ({
  rotazione: ['Rotazione', 'Affidamenti diretti ripetuti allo stesso fornitore: per gli affidamenti sotto soglia il principio di rotazione (art. 49, d.lgs. 36/2023) li limita espressamente.'],
  dipendenza: ['Dipendenza', `Il fornitore incassa quasi tutto il suo fatturato tracciato (nel perimetro delle ${perimetro} aziende collegate) da una sola azienda, con rapporti prevalentemente senza gara.`],
  esclusiva: ['Esclusiva', 'Relazione stabile senza concorrenza: molti contratti, quasi tutti senza gara.'],
});

function renderConflitti({ coi, href }) {
  const MAX_RIGHE = 200;
  const st = coi.statistiche;
  const perimetro = coi.perimetroAziende || Object.keys(coi.coppie.reduce((a, p) => ((a[p.codice] = 1), a), {})).length;
  const FLAG_LABEL = coiFlagLabel(perimetro);
  const rows = coi.coppie
    .slice(0, MAX_RIGHE)
    .map((p) => {
      const flags = p.flags.map((f) => `<span class="badge ${p.gravita === 'alta' ? 'alta' : 'media'}" title="${esc(FLAG_LABEL[f][1])}">${FLAG_LABEL[f][0]}</span>`).join(' ');
      const forn = `<a href="fornitore/${esc(p.cf)}.html">${esc(p.fornitore || p.cf)}</a>`;
      return `<tr data-t="${esc(`${p.denominazione} ${p.fornitore || ''}`.toLowerCase())}" data-f="${esc(p.flags.join(' '))}">
      <td><a href="${href(p.codice)}">${esc(p.denominazione)}</a><div class="small muted">${esc(p.regione)}</div></td>
      <td>${forn}</td>
      <td>${flags}</td>
      <td class="num">${numeroIt(p.n)}</td>
      <td class="num">${numeroIt(p.diretti)}</td>
      <td class="num">${euroCompact(p.valore)}</td>
      <td class="num">${percentualeIt(p.quotaSenzaGaraN)}</td>
      <td class="num">${percentualeIt(p.quotaFornitore)}</td>
    </tr>`;
    })
    .join('');
  const body = `
<h1>Relazioni ricorrenti — possibili conflitti d’interesse</h1>
<p class="lead">Quando la stessa azienda sanitaria affida ripetutamente, senza gara, allo stesso fornitore — o quando un
fornitore vive quasi solo di una singola azienda — la relazione merita una verifica. Qui incrociamo tutti i
${numeroIt(st.conFornitore)} contratti con fornitore identificato e segnaliamo le <strong>coppie azienda↔fornitore</strong>
che presentano indicatori di rischio riconosciuti.</p>
${rigaAggiornamento()}

<div class="note"><strong>Cosa NON è questa pagina.</strong> Gli open data non possono dimostrare un conflitto di
interessi: servirebbero gli assetti societari (Registro Imprese) e gli incarichi dei dirigenti (sezione «Amministrazione
Trasparente» di ogni azienda). Questi sono <strong>indicatori, non prove</strong> — e spesso hanno spiegazioni legittime:
i farmaci coperti da <strong>brevetto</strong> (es. case farmaceutiche) si acquistano per forza dal titolare, in esclusiva;
esistono monopoli tecnici, manutenzioni vincolate al costruttore, convenzioni. La rotazione degli affidamenti diretti è
però un <strong>obbligo di legge</strong> (art. 49, d.lgs. 36/2023): le eccezioni vanno motivate.</div>

<div class="grid kpis">
  ${kpi('Coppie segnalate', numeroIt(st.coppieSegnalate))}
  ${kpi('Rotazione da verificare', numeroIt(st.perFlag.rotazione), 'neg')}
  ${kpi('Dipendenza reciproca', numeroIt(st.perFlag.dipendenza))}
  ${kpi('Relazioni in esclusiva', numeroIt(st.perFlag.esclusiva))}
</div>

<h2>Gli indicatori</h2>
${Object.entries(FLAG_LABEL).map(([k, [lab, spieg]]) => `<div class="seg ${k === 'rotazione' ? 'alta' : 'media'}"><div class="t"><span class="badge ${k === 'rotazione' ? 'alta' : 'media'}">${lab}</span></div><div class="d">${spieg}</div></div>`).join('')}
<p class="small muted">Soglie: rotazione = ≥${coi.soglie.rotazioneDiretti} affidamenti diretti e ≥${euroCompact(coi.soglie.rotazioneValore)} alla stessa coppia;
dipendenza = fornitore ≥${euroCompact(coi.soglie.dipendenzaValoreForn)} con ≥${Math.round(coi.soglie.dipendenzaQuota * 100)}% del fatturato da una sola azienda e ≥${Math.round(coi.soglie.dipendenzaSenzaGara * 100)}% senza gara;
esclusiva = ≥${coi.soglie.esclusivaN} contratti di cui ≥${Math.round(coi.soglie.esclusivaSenzaGara * 100)}% senza gara. Anni: ${rangeAnni(coi.anni)}.
Il principio di rotazione (art. 49) vincola gli affidamenti <strong>sotto soglia</strong>; sopra soglia si valutano
esclusive, infungibilità e accordi quadro. Le adesioni a convenzioni/accordi quadro riconoscibili dall’oggetto
(Consip, soggetti aggregatori regionali, appalti specifici) sono <strong>escluse</strong> dal conteggio «senza gara».
Sono considerate solo società di capitali, cooperative e consorzi. Le <strong>ditte individuali e le società di
persone</strong> (S.n.c., S.a.s.), la cui denominazione contiene per legge il nome di persone fisiche, sono
<strong>escluse da questo elenco a tutela della riservatezza</strong> (Regolamento UE 2016/679 — GDPR): un’impresa
individuale coincide con la persona che la esercita, e questi indicatori automatici non giustificano l’esposizione
nominativa di singoli individui.</p>

<h2>Le coppie da verificare</h2>
<div class="controls">
  <input type="search" id="q" placeholder="Cerca azienda o fornitore…" aria-label="Cerca">
  <select id="fl" aria-label="Indicatore">
    <option value="">Tutti gli indicatori</option>
    <option value="rotazione">Rotazione</option>
    <option value="dipendenza">Dipendenza</option>
    <option value="esclusiva">Esclusiva</option>
  </select>
</div>
<p class="small muted" id="stato"></p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Azienda sanitaria</th><th scope="col">Fornitore</th><th scope="col">Indicatori</th>
  <th class="num" scope="col">Contratti</th><th class="num" scope="col">Diretti</th><th class="num" scope="col">Valore</th>
  <th class="num" scope="col">Senza gara</th><th class="num" scope="col" title="Quota del fatturato tracciato del fornitore (perimetro: ${perimetro} aziende collegate) proveniente da questa azienda">Del fornitore</th></tr></thead>
  <tbody id="rows">${rows}</tbody>
</table></div>
<p class="small muted">Mostrate le prime ${numeroIt(Math.min(MAX_RIGHE, coi.coppie.length))} coppie su ${numeroIt(coi.coppie.length)}
(ordinate per gravità e valore). L’elenco completo è nei <a href="dati.html">dati aperti</a> (coi.json). «Del fornitore» =
quota del fatturato 2023–24 del fornitore <em>tracciato in questo dataset</em> (le ${perimetro} aziende collegate — non l’intero SSN)
proveniente da questa azienda. Ogni contratto è verificabile per CIG dalla scheda dell’azienda.
<strong>Indicatori, non prove.</strong></p>
<p class="small muted">Ritieni un dato inesatto o vuoi fornire contesto? <a href="note-legali.html#rettifiche">Richiedi
una rettifica</a> — le richieste motivate sono valutate tempestivamente.</p>

<h2>Come si verifica davvero</h2>
<ol>
  <li><strong>Assetti societari:</strong> visura del fornitore al <a href="https://www.registroimprese.it/" target="_blank" rel="noopener">Registro Imprese</a> (soci, amministratori).</li>
  <li><strong>Incarichi dei dirigenti:</strong> sezione «Amministrazione Trasparente» sul sito dell’azienda sanitaria (d.lgs. 33/2013): dirigenti, consulenti, dichiarazioni di conflitto.</li>
  <li><strong>Il singolo appalto:</strong> il CIG sulla <a href="https://dati.anticorruzione.it/opendata" target="_blank" rel="noopener">Banca Dati ANAC</a> — determina, motivazione dell’affidamento, eventuali proroghe.</li>
</ol>
<script>
(function(){
  var q=document.getElementById('q'),fl=document.getElementById('fl'),tb=document.getElementById('rows'),st=document.getElementById('stato'),tmr;
  var all=[].slice.call(tb.querySelectorAll('tr'));
  function apply(){
    var t=q.value.trim().toLowerCase(),f=fl.value,n=0;
    all.forEach(function(r){
      var ok=(!t||r.getAttribute('data-t').indexOf(t)>=0)&&(!f||r.getAttribute('data-f').indexOf(f)>=0);
      r.style.display=ok?'':'none';if(ok)n++;
    });
    st.textContent=n+' coppie mostrate';
  }
  q.addEventListener('input',function(){clearTimeout(tmr);tmr=setTimeout(apply,150);});
  fl.addEventListener('change',apply);apply();
})();
</script>
`;
  return page({
    title: 'Relazioni ricorrenti e possibili conflitti d’interesse — Ospedali Trasparenti',
    description: 'Coppie azienda sanitaria–fornitore con affidamenti diretti ripetuti, dipendenza reciproca o esclusiva senza gara: indicatori di rischio da verificare, non prove. Dati ANAC.',
    active: 'conflitti.html',
    ogType: 'article',
    jsonld: articleLd('Relazioni ricorrenti e possibili conflitti d’interesse nella sanità pubblica', 'Coppie azienda sanitaria–fornitore con indicatori di rischio da verificare.', 'conflitti.html'),
    body,
  });
}

// ---------- DATI APERTI (hub) ----------
function formatBytes(b) {
  if (b == null) return '—';
  if (b >= 1024 * 1024) return `${numeroIt(Math.round((b / (1024 * 1024)) * 10) / 10)} MB`;
  if (b >= 1024) return `${numeroIt(Math.round(b / 1024))} KB`;
  return `${numeroIt(b)} B`;
}
function renderDati({ datasets, generatoIl }) {
  const rows = datasets
    .map(
      (d) => `<tr>
      <td><a href="${esc(d.href)}"${d.href.endsWith('/') ? '' : ' download'}>${d.titolo}</a>
        <div class="small muted">${d.descr}</div></td>
      <td>${esc(d.fmt)}</td>
      <td class="num">${formatBytes(d.bytes)}</td>
      <td class="small">${esc(d.licenza)}</td>
    </tr>`
    )
    .join('');
  const body = `
<h1>Dati aperti</h1>
<p class="lead">Tutto ciò che vedi sul sito nasce da <strong>open data ufficiali</strong> ed è <strong>riutilizzabile</strong>.
Qui trovi i dataset elaborati (formato macchina) e le fonti primarie, con le rispettive licenze. Il codice del pipeline
è aperto e i risultati sono riproducibili con <code>npm&nbsp;run&nbsp;all</code>.</p>

<h2>Dataset scaricabili</h2>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Dataset</th><th scope="col">Formato</th><th class="num" scope="col">Dimensione</th><th scope="col">Fonte / licenza</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<p class="small muted">I dataset sono un’<em>elaborazione propria</em> (aggregazione, normalizzazione, indicatori) su dati
pubblici; eventuali errori di elaborazione non sono imputabili ai titolari delle fonti. Riutilizzo consentito con
citazione della fonte originale e del progetto.</p>

<h2>Verifica un singolo appalto (CIG)</h2>
<p class="muted small">Il <strong>CIG</strong> (Codice Identificativo di Gara) è la chiave di verifica: ogni contratto
sul sito lo riporta. Incollalo qui per controllarlo direttamente sui portali ANAC.</p>
<div class="controls">
  <input type="search" id="cig" placeholder="Es. 9314240201" aria-label="CIG da verificare" maxlength="10" style="flex:1;text-transform:uppercase">
  <button type="button" id="cigBtn" class="btn">Verifica</button>
</div>
<div id="cigOut" class="note" hidden style="margin-top:12px"></div>
<script>
(function(){
  var inp=document.getElementById('cig'),btn=document.getElementById('cigBtn'),out=document.getElementById('cigOut');
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function verifica(){
    var v=(inp.value||'').trim().toUpperCase();
    out.hidden=false;
    if(!/^[0-9A-Z]{10}$/.test(v)){out.innerHTML='Il CIG dovrebbe avere 10 caratteri alfanumerici. Controlla il codice.';return;}
    out.innerHTML='CIG <strong>'+esc(v)+'</strong> — cercalo sui portali ufficiali:<br>'+
      '<a href="https://dati.anticorruzione.it/opendata" target="_blank" rel="noopener">ANAC — Banca Dati Nazionale dei Contratti Pubblici</a> · '+
      '<a href="https://www.serviziocontrattipubblici.it/" target="_blank" rel="noopener">Servizio Contratti Pubblici (MIT)</a>';
  }
  btn.addEventListener('click',verifica);
  inp.addEventListener('keydown',function(e){if(e.key==='Enter')verifica();});
})();
</script>

<h2>Fonti primarie</h2>
<ul>
  <li><a href="https://openbdap.rgs.mef.gov.it/it/SSN/Analizza" target="_blank" rel="noopener">BDAP — RGS/MEF</a>:
    modelli <strong>CE</strong> (conto economico) e <strong>SP</strong> (stato patrimoniale) del SSN, per anno. Licenza IODL 2.0.</li>
  <li><a href="https://dati.anticorruzione.it/opendata" target="_blank" rel="noopener">ANAC</a>:
    Banca Dati Nazionale dei Contratti Pubblici — CIG, procedure, aggiudicatari, partecipanti. Licenza CC BY 4.0.</li>
  <li><a href="https://www.dati.salute.gov.it/" target="_blank" rel="noopener">Ministero della Salute</a>:
    anagrafe delle strutture di ricovero (modello HSP).</li>
</ul>
<p class="small muted">Aggiornato il ${esc(String(generatoIl).slice(0, 10))}. Per i controlli di consistenza e le impronte
SHA-256 delle fonti vedi <a href="verifiche.html">Dati e verifiche</a>.</p>
`;
  const su = siteUrl();
  const jsonld = su
    ? {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: 'Ospedali Trasparenti — conti e appalti degli ospedali pubblici italiani',
        description: 'Bilanci (CE/SP), segnalazioni contabili automatiche, appalti ANAC aggregati, fornitori e registro completo dei contratti delle aziende sanitarie pubbliche italiane.',
        url: `${su}/dati.html`,
        inLanguage: 'it',
        license: 'https://creativecommons.org/licenses/by/4.0/',
        isAccessibleForFree: true,
        creator: { '@type': 'Organization', name: 'Carbon Stealth VCC' },
        distribution: datasets
          .filter((d) => !d.href.endsWith('/'))
          .map((d) => ({
            '@type': 'DataDownload',
            name: d.titolo,
            encodingFormat: d.fmt === 'JSON' ? 'application/json' : 'text/csv',
            contentUrl: `${su}/${d.href}`,
          })),
      }
    : null;
  return page({
    title: 'Dati aperti — Ospedali Trasparenti',
    description: 'Scarica i dataset elaborati (JSON/CSV) e verifica i singoli appalti tramite il CIG sui portali ANAC. Open data, licenze e fonti primarie.',
    active: 'dati.html',
    jsonld,
    body,
  });
}

// ---------- NOTE LEGALI / PRIVACY ----------
function renderNoteLegali({ titolare = {} } = {}) {
  // реквизити на титуляря (GDPR чл. 13(1)(a)/(b)) — попълват се в config.json
  const sede = titolare.indirizzo ? `, con sede in ${esc(titolare.indirizzo)}` : '';
  const eik = titolare.eik ? ` — n. reg./VAT ${esc(titolare.eik)}` : '';
  const contatto = titolare.email
    ? ` Contatto diretto: <a href="mailto:${esc(titolare.email)}">${esc(titolare.email)}</a>${titolare.telefono ? ` · tel. ${esc(titolare.telefono)}` : ''}.`
    : ` Contatto: tramite <a href="https://carbonstealth.eu">carbonstealth.eu</a>.`;
  const body = `
<h1>Note legali</h1>
<h2>Titolare</h2>
<p>Questo sito è pubblicato da <strong>${esc(titolare.nome || 'Carbon Stealth VCC')}</strong>${sede}${eik}
(<a href="https://carbonstealth.eu">carbonstealth.eu</a>).${contatto}
Progetto di <strong>trasparenza civica senza scopo di lucro</strong>. Non è una testata giornalistica registrata ai sensi
dell’art. 5 della L. 47/1948 e non costituisce prodotto editoriale periodico.</p>

<h2>Riutilizzo dei dati elaborati</h2>
<p class="small">I dataset derivati pubblicati in <a href="dati.html">Dati aperti</a> sono riutilizzabili citando la fonte
originale (ANAC CC BY 4.0, BDAP IODL 2.0) e questo progetto. Sono forniti <strong>senza alcuna garanzia di completezza o
accuratezza</strong>: chi li riutilizza è tenuto a verificarli sulle fonti ufficiali.</p>

<h2>Natura dei contenuti</h2>
<p>Il sito rielabora <strong>dati ufficiali in formato aperto</strong> e ne deriva indicatori automatici. Le
«segnalazioni», gli indicatori di spesa e gli indicatori sugli appalti — quota senza gara, offerente unico registrato,
concentrazione, frazionamento, le <em>«cordate»</em> di offerenti (possibile cover bidding, coppie di operatori) e gli
indicatori procedurali sulle gare (termini brevi, importi sotto soglia, ribassi nulli, inviti a vuoto, subappalto) —
sono <strong>elaborazioni statistiche automatiche</strong> e vanno intesi come <strong>piste da verificare, non come
prove di irregolarità o illecito</strong>. In particolare, <strong>l’accostamento di due imprese</strong> negli
indicatori sulle gare <strong>non implica alcun accordo tra loro né alcuna condotta illecita</strong>. Nessun addebito è
mosso alle strutture, alle aziende o agli operatori economici citati (tutti <strong>persone giuridiche</strong>: mai
persone fisiche). Un’alta quota senza gara, un solo offerente o un’elevata concentrazione possono avere spiegazioni
pienamente legittime (mercati ristretti, esclusive, brevetti, infungibilità tecnica, urgenze, fusioni, ripiani
regionali). Per ogni dato è disponibile il diritto di <a href="#rettifiche">rettifica</a>.</p>

<h2>Fonti e licenze</h2>
<ul>
  <li><strong>ANAC</strong> — Banca Dati Nazionale dei Contratti Pubblici (<a href="https://dati.anticorruzione.it/opendata">dati.anticorruzione.it</a>), licenza <strong>CC BY 4.0</strong>.</li>
  <li><strong>BDAP — RGS/MEF</strong>, modelli CE/SP del SSN (<a href="https://openbdap.rgs.mef.gov.it/it/SSN/Analizza">openbdap.rgs.mef.gov.it</a>), licenza <strong>IODL 2.0</strong>.</li>
  <li><strong>Ministero della Salute</strong> — <a href="https://www.dati.salute.gov.it/">dati.salute.gov.it</a>.</li>
</ul>
<p class="small">I dati sono stati <strong>aggregati, normalizzati ed elaborati</strong>; eventuali errori di elaborazione
non sono imputabili ai titolari delle fonti.</p>

<h2 id="rettifiche">Rettifiche</h2>
<p>Chi ritenga un dato inesatto o voglia fornire contesto può richiederne la <strong>rettifica</strong> scrivendo a
${titolare.email ? `<a href="mailto:${esc(titolare.email)}">${esc(titolare.email)}</a>` : `<a href="https://carbonstealth.eu">Carbon Stealth VCC</a>`}.
Le richieste motivate saranno valutate tempestivamente e, ove fondate, il dato sarà corretto o contestualizzato alla
prima rigenerazione del sito.</p>

<h2>Limitazione di responsabilità</h2>
<p>I contenuti sono forniti «così come sono», a fini informativi e di trasparenza. Non sostituiscono le fonti ufficiali
né i controlli della Corte dei conti o dell’ANAC.</p>
`;
  return page({ title: 'Note legali — Ospedali Trasparenti', description: 'Titolare, natura dei contenuti, fonti, licenze e rettifiche.', active: '', body });
}

function renderPrivacy({ titolare = {}, hosting = {} } = {}) {
  const sede = titolare.indirizzo ? `, con sede in ${esc(titolare.indirizzo)}` : '';
  const contattoHtml = titolare.email
    ? `<a href="mailto:${esc(titolare.email)}">${esc(titolare.email)}</a>`
    : `<a href="https://carbonstealth.eu">Carbon Stealth VCC</a>`;
  // хостинг разкритие (GDPR чл. 13(1)(e)/(f)) — provider/trasferimento от config.json
  const hostingHtml = hosting.provider
    ? `<p>Il sito è ospitato da <strong>${esc(hosting.provider)}</strong>, che agisce come responsabile del trattamento e
può registrare log tecnici (incluso l’indirizzo IP) per la sicurezza e il funzionamento del servizio (base giuridica
art. 6.1.f GDPR).${hosting.trasferimento ? ` L’eventuale trasferimento extra-UE è disciplinato da <strong>${esc(hosting.trasferimento)}</strong>.` : ''}</p>`
    : `<p>Il fornitore di hosting può registrare log tecnici (incluso l’indirizzo IP) per la sicurezza e il funzionamento
del servizio (base giuridica art. 6.1.f GDPR). Il nominativo del fornitore e l’eventuale meccanismo di trasferimento
extra-UE saranno indicati in questa pagina al momento della pubblicazione definitiva.</p>`;
  const body = `
<h1>Informativa sulla privacy</h1>
<p class="lead">Questo sito <strong>non usa cookie né strumenti di tracciamento e non profila i visitatori</strong>;
le visite sono conteggiate solo in forma <strong>aggregata e anonima</strong> (vedi sotto).</p>

<h2>Titolare del trattamento</h2>
<p><strong>${esc(titolare.nome || 'Carbon Stealth VCC')}</strong>${sede}. Contatto: ${contattoHtml}.</p>

<h2>Dati di terzi (operatori economici)</h2>
<p>Il sito elabora dati economici ufficiali in formato aperto che possono includere <strong>denominazioni di operatori
economici</strong>, identificati dalla partita IVA. Le denominazioni associate a un <strong>codice fiscale personale
(16 caratteri)</strong> sono sostituite da un’etichetta generica e non compaiono. Alcune <strong>ditte individuali e
società di persone</strong> possono tuttavia contenere nomi di persone fisiche nella ragione sociale registrata nelle
fonti pubbliche: per questi soggetti il sito non applica indicatori di rischio, esclude le relative pagine dai motori
di ricerca (noindex) e non li include nell’analisi delle relazioni ricorrenti. Inoltre, i <strong>nomi di persone
fisiche</strong> eventualmente presenti nel <strong>testo libero degli oggetti di gara</strong> (le descrizioni
ufficiali riprese verbatim dalla banca dati ANAC) vengono rimossi in fase di elaborazione e sostituiti da
un’etichetta generica, così da non essere mai mostrati né indicizzati. Il trattamento avviene per finalità di
<strong>trasparenza e interesse pubblico</strong> e a fini statistici (art. 6.1.f e artt. 85–89 GDPR; D.Lgs. 196/2003
come modificato dal D.Lgs. 101/2018). I dati rielaborati vengono aggiornati a ogni rigenerazione del sito; le fonti
primarie restano pubbliche presso i rispettivi titolari (ANAC, BDAP/MEF, Ministero della Salute).</p>

<h2>Statistiche di visita (aggregate)</h2>
<p>Il server registra un <strong>conteggio aggregato e anonimo</strong> delle visite (pagine viste e visitatori per
giorno e per pagina) a fini statistici e di funzionamento (base giuridica art. 6.1.f GDPR — interesse legittimo alla
misurazione dell’audience). <strong>Non usa cookie né altri identificatori memorizzati sul dispositivo</strong>
(art. 5.3 Direttiva ePrivacy; art. 122 D.Lgs. 196/2003). Il conteggio dei visitatori unici è ottenuto con un valore
calcolato al momento (hash a senso unico di indirizzo IP e user-agent con un <strong>sale casuale giornaliero
conservato solo in memoria e mai salvato</strong>): su disco vengono scritti esclusivamente <strong>totali
numerici</strong>, senza indirizzi IP né dati che permettano di identificare o ricontattare i visitatori. Il pannello
di amministrazione usa un solo cookie tecnico di sessione (<code>ost_admin</code>, HttpOnly), <strong>strettamente
necessario</strong> per l’accesso riservato e perciò esente da consenso.</p>

<h2>Diritti</h2>
<p>È possibile esercitare i diritti di <strong>accesso, rettifica, limitazione, opposizione e cancellazione</strong>
(artt. 15–21 GDPR) scrivendo a ${contattoHtml}. È inoltre possibile proporre <strong>reclamo al Garante per la
protezione dei dati personali</strong> (<a href="https://www.garanteprivacy.it/">garanteprivacy.it</a>).</p>

<h2>Log di hosting</h2>
${hostingHtml}
`;
  return page({ title: 'Privacy — Ospedali Trasparenti', description: 'Nessun cookie o tracciamento. Trattamento dei dati di terzi e diritti.', active: '', body });
}

const PROC_LABEL = {
  competitiva: 'Procedura competitiva (gara aperta/ristretta)',
  quadro: 'Accordo quadro / convenzione (pre-competuto)',
  diretto: 'Affidamento diretto (senza gara)',
  negoziataSenza: 'Negoziata senza pubblicazione',
  negoziata: 'Negoziata con bando',
  altro: 'Altro / non determinato',
};
const PROC_ORDER = ['diretto', 'negoziataSenza', 'quadro', 'competitiva', 'negoziata', 'altro'];

// ---------- APPALTI (ANAC) ----------
function renderAppalti({ appalti, appByCod, appMatch, enti, href }) {
  const nz = appalti.nazionale;
  const codByCf = new Map();
  for (const e of enti) {
    const a = appByCod.get(e.codice);
    if (a) codByCf.set(a.cf, e.codice);
  }
  const anniTxt = rangeAnni(appalti.anni);

  // Регионална таблица, подредена по дял „senza gara“
  // праг: изключваме региони/секции с малко данни, за да не подвеждат класацията
  const SKIP_REG = new Set(['ND', 'CENTRALE', 'NON CLASSIFICATO']);
  const reg = appalti.regionale
    .filter((r) => r.n >= 500 && !SKIP_REG.has(r.reg))
    .sort((a, b) => (b.quotaSenzaGaraNum || 0) - (a.quotaSenzaGaraNum || 0));
  const regRows = reg
    .map(
      (r) => `<tr>
      <td>${esc(r.reg)}</td>
      <td class="num">${euroCompact(r.importo)}</td>
      <td class="num ${(r.quotaSenzaGaraNum || 0) > 0.5 ? 'neg' : ''}">${percentualeIt(r.quotaSenzaGaraNum)}</td>
      <td class="num ${(r.quotaSenzaGara || 0) > 0.5 ? 'neg' : ''}">${percentualeIt(r.quotaSenzaGara)}</td>
      <td class="num">${numeroIt(r.n)}</td></tr>`
    )
    .join('');

  // Топ възложители по дял „senza gara“ (материални)
  const topAut = appalti.autorita
    .filter((a) => a.importo >= 20_000_000 && a.n >= 100 && a.quotaSenzaGaraNum != null)
    .sort((a, b) => b.quotaSenzaGaraNum - a.quotaSenzaGaraNum)
    .slice(0, 20);
  const autRows = topAut
    .map((a) => {
      const cod = codByCf.get(a.cf);
      const nome = cod ? `<a href="${href(cod)}">${esc(a.den)}</a>` : esc(a.den);
      return `<tr><td>${nome}<div class="small muted">${esc(a.reg)}</div></td>
        <td class="num neg">${percentualeIt(a.quotaSenzaGaraNum)}</td>
        <td class="num">${percentualeIt(a.quotaSenzaGara)}</td>
        <td class="num">${euroCompact(a.importo)}</td></tr>`;
    })
    .join('');

  const body = `
<h1>Appalti pubblici della sanità</h1>
<p class="lead">Chi compra, come e con quanta concorrenza. Dai dati ANAC (Banca Dati Nazionale dei Contratti
Pubblici, gare sopra 40.000 € pubblicate negli anni ${anniTxt}), isoliamo gli appalti delle aziende sanitarie e
misuriamo la <strong>quota di spesa affidata senza gara</strong> — affidamenti diretti e negoziate senza bando —
il primo indicatore di opacità che guardano ANAC e Corte dei conti.</p>

<div class="grid kpis">
  ${kpi(`Spesa senza gara (${anniTxt})`, percentualeIt(nz.quotaSenzaGara), (nz.quotaSenzaGara || 0) > 0.4 ? 'neg' : '')}
  ${kpi('Contratti senza gara (sul numero)', percentualeIt(nz.quotaSenzaGaraNum), (nz.quotaSenzaGaraNum || 0) > 0.4 ? 'neg' : '')}
  ${kpi('Valore messo a gara', euroCompact(nz.importo))}
  ${kpi('Contratti (lotti)', numeroIt(nz.n))}
</div>

<div class="note" style="margin-top:18px"><strong>Cosa significa «senza gara».</strong> L’affidamento diretto e la
procedura negoziata senza pubblicazione assegnano il contratto <em>senza confronto competitivo</em>. Sotto certe soglie
è legittimo e più rapido, ma un ricorso sistematico è la spia classica di inefficienza o favoritismi. Gli acquisti in
adesione ad accordi quadro/convenzioni (es. Consip/centrali regionali) sono invece già stati messi a gara e non contano
come «senza gara».</div>
<div class="note"><strong>Nota sugli importi.</strong> I valori sono <strong>importi messi a gara (base d’asta / valore
del lotto)</strong>, non la spesa effettivamente pagata: gli accordi quadro hanno massimali molto superiori alla spesa
reale. Sono quindi utili per <strong>confrontare</strong> enti e regioni, non come misura della spesa sostenuta. Per
questo il segnale principale è la <strong>quota (in %), non il valore assoluto</strong>.</div>
<div class="note"><strong>Attenzione alla serie storica.</strong> Dal 2024 il nuovo Codice dei contratti
(D.Lgs. 36/2023) e le piattaforme di e-procurement certificate fanno confluire nella banca dati anche i
<strong>micro-acquisti</strong> (prima registrati separatamente) e alzano la soglia dell’affidamento diretto:
la quota «senza gara» del 2024–2025 risulta perciò <strong>molto più alta e non confrontabile</strong> con gli anni
precedenti. Il confronto utile resta quello <strong>tra enti e regioni nello stesso periodo</strong>, non nel tempo.
→ <a href="storico.html">Come è cambiata la serie</a></div>

<h2>Le regioni a confronto</h2>
<p class="muted small">Ordinate per quota di contratti affidati senza gara. «Senza gara %» sul numero di contratti,
«sul valore» sugli importi.</p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Regione</th><th class="num" scope="col">Valore appalti</th><th class="num" scope="col">Senza gara %</th><th class="num" scope="col">sul valore</th><th class="num" scope="col">Contratti</th></tr></thead>
  <tbody>${regRows}</tbody>
</table></div>

<h2>Le aziende con più appalti senza gara</h2>
<p class="muted small">Solo enti con almeno 20 mln € e 100 contratti nel periodo, per quota sul numero di contratti.
I nomi collegati hanno una scheda.</p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Azienda</th><th class="num" scope="col">Senza gara %</th><th class="num" scope="col">sul valore</th><th class="num" scope="col">Valore appalti</th></tr></thead>
  <tbody>${autRows}</tbody>
</table></div>

${renderOfferenteUnico(appMatch, codByCf, href)}
${renderFornitori(appMatch)}

<p class="small muted" style="margin-top:18px">Collegate ai bilanci ${appMatch ? `${appMatch.abbinate} aziende su ${appMatch.totali}` : ''}
tramite corrispondenza esatta di denominazione e regione; per le altre i dati ANAC restano nel confronto regionale.
Fonte: <a href="https://dati.anticorruzione.it/opendata">ANAC — dati aperti</a> (CIG, aggiudicatari, partecipanti).</p>
`;
  return page({
    title: 'Appalti pubblici della sanità — Ospedali Trasparenti',
    description: 'Gli appalti delle aziende sanitarie italiane dai dati ANAC: quota di spesa senza gara, affidamenti diretti, confronto tra regioni.',
    active: 'appalti.html',
    ogType: 'article',
    jsonld: articleLd('Gli appalti della sanità pubblica italiana', 'Quota di spesa senza gara, affidamenti diretti e confronto tra regioni dai dati ANAC.', 'appalti.html'),
    body,
  });
}

/** Класация: възложители с най-много търгове с един кандидат. */
function renderOfferenteUnico(appMatch, codByCf, href) {
  if (!appMatch?.aggiu) return '';
  const { aggiu, autByCf } = appMatch;
  const list = Object.entries(aggiu.perCf)
    .filter(([, v]) => v.gareConPartecipanti >= 50 && v.quotaUnicoOfferente != null)
    .map(([cf, v]) => ({ cf, ...v, aut: autByCf.get(cf) }))
    .filter((x) => x.aut)
    .sort((a, b) => b.quotaUnicoOfferente - a.quotaUnicoOfferente)
    .slice(0, 15);
  if (!list.length) return '';
  const rows = list
    .map((x) => {
      const cod = codByCf.get(x.cf);
      const nome = cod ? `<a href="${href(cod)}">${esc(x.aut.den)}</a>` : esc(x.aut.den);
      return `<tr><td>${nome}<div class="small muted">${esc(x.aut.reg)}</div></td>
        <td class="num neg">${percentualeIt(x.quotaUnicoOfferente)}</td>
        <td class="num">${numeroIt(x.gareUnicoOfferente)}/${numeroIt(x.gareConPartecipanti)}</td></tr>`;
    })
    .join('');
  return `<h2>Gare con un solo offerente registrato</h2>
<p class="muted small">Quota delle gare in cui, <strong>sui dati disponibili</strong> dei partecipanti, risulta
una sola impresa. Solo enti con almeno 50 gare.</p>
<div class="note">La banca dati dei partecipanti ANAC è <strong>parziale</strong> (copre circa metà delle gare e talvolta
registra solo l’aggiudicatario): queste quote sono <strong>indicative e da intendersi come limite superiore</strong>.
Un solo offerente può derivare da mercati ristretti, esclusive, brevetti, infungibilità tecnica o urgenze —
è un <strong>indicatore da verificare, non una prova di irregolarità</strong>; nessun addebito è mosso ai soggetti citati.
I raggruppamenti di imprese (RTI) sono conteggiati come più offerte.</div>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Azienda</th><th class="num" scope="col">Offerente unico</th><th class="num" scope="col">Gare</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>`;
}

/** Национална класация на изпълнителите (кой прибира парите). */
function renderFornitori(appMatch) {
  if (!appMatch?.aggiu?.fornitoriNazionali?.length) return '';
  const rows = appMatch.aggiu.fornitoriNazionali
    .slice(0, 15)
    .map(
      (f, i) => `<tr><td class="num">${i + 1}</td><td>${esc(f.den)}</td>
      <td class="num">${euroCompact(f.valore)}</td><td class="num">${numeroIt(f.n)}</td></tr>`
    )
    .join('');
  return `<h2>I maggiori fornitori del SSN per valore aggiudicato</h2>
<p class="muted small">Operatori economici con più valore aggiudicato dalle aziende sanitarie (2023–2025).
Valore attribuito una volta per contratto all’aggiudicatario principale.</p>
<div class="note">Figurare tra i maggiori fornitori è pienamente legittimo e riflette il volume di forniture aggiudicate
con regolare procedura: <strong>non costituisce di per sé indice di anomalia</strong>. Le denominazioni delle imprese
sono riportate a fini di trasparenza sugli appalti pubblici; gli operatori persone fisiche non sono nominati.</div>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">#</th><th scope="col">Fornitore</th><th class="num" scope="col">Valore aggiudicato</th><th class="num" scope="col">Contratti</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>`;
}

// ---------- ПРОФИЛИ НА ИЗПЪЛНИТЕЛИТЕ („segui il fornitore“) ----------
function renderFornitore({ f, aziendeIdx, societa = true, coppie = [], strutturaHref }) {
  const quotaSg = f.n > 0 ? f.senzaGara / f.n : 0;
  const osp = [...f.perOsp.entries()]
    .map(([cod, v]) => ({ cod, nome: (aziendeIdx[cod] || ['', ''])[0], reg: (aziendeIdx[cod] || ['', ''])[1], ...v }))
    .sort((a, b) => b.valore - a.valore);
  const ospRows = osp
    .map((o) => `<tr><td><a href="${strutturaHref(o.cod)}">${esc(o.nome)}</a><div class="small muted">${esc(o.reg)}</div></td>
      <td class="num">${numeroIt(o.n)}</td><td class="num">${euroCompact(o.valore)}</td></tr>`)
    .join('');
  const topRows = f.top
    .slice(0, 15)
    .map((c) => {
      const az = aziendeIdx[c.codice] || ['', ''];
      const sg = c.categoria === 'diretto' || c.categoria === 'negoziataSenza';
      return `<tr><td class="small">${esc(c.data)}</td>
        <td>${esc(c.oggetto || '—')}<div class="small muted">CIG ${esc(c.cig)} · <a href="${strutturaHref(c.codice)}">${esc(az[0])}</a></div></td>
        <td class="small${sg ? ' neg' : ''}">${sg ? 'senza gara' : ''}</td>
        <td class="num">${euroCompact(c.importo)}</td></tr>`;
    })
    .join('');
  // рисковите флагове само за капиталови/кооп. форми — не за субекти с лични
  // имена в наименованието (ditta individuale, SNC/SAS) — правен одит
  const flagConc = societa && osp.length >= 3 && osp[0].valore / f.valore > 0.6;
  const flagSg = societa && f.n >= 5 && quotaSg > 0.7;
  const body = `
<a class="backlink" href="../fornitori.html">← Tutti i fornitori</a>
<h1>${esc(f.den)}</h1>
<p><span class="chip">P.IVA/CF ${esc(f.cf)}</span></p>
<div class="grid kpis">
  ${kpi('Valore aggiudicato', euroCompact(f.valore))}
  ${kpi('Contratti', numeroIt(f.n))}
  ${kpi('Aziende servite', numeroIt(f.perOsp.size))}
  ${kpi('Quota senza gara', percentualeIt(quotaSg), flagSg ? 'neg' : '')}
</div>
<div class="note">Essere un fornitore rilevante del SSN è <strong>pienamente legittimo</strong>. Questi dati mostrano
<em>dove</em> e <em>come</em> l’operatore ha ottenuto contratti pubblici (2023–2025); non implicano alcuna irregolarità.
Importi = valore messo a gara. Ogni riga è verificabile tramite il CIG su ANAC.</div>
${flagSg ? `<div class="seg alta"><div class="t"><span class="badge alta">!</span> <span>Quota elevata di affidamenti senza gara</span></div><div class="d">Il ${percentualeIt(quotaSg)} dei suoi contratti è stato affidato senza confronto competitivo. Indicatore da verificare, non prova.</div></div>` : ''}
${flagConc ? `<div class="seg media"><div class="t"><span class="badge media">i</span> <span>Concentrato su poche aziende</span></div><div class="d">Oltre il 60% del valore proviene da una sola azienda (${esc(osp[0].nome)}).</div></div>` : ''}
${coppie.length ? `<div class="seg ${coppie.some((p) => p.gravita === 'alta') ? 'alta' : 'media'}"><div class="t"><span class="badge ${coppie.some((p) => p.gravita === 'alta') ? 'alta' : 'media'}">!</span> <span>Relazioni ricorrenti da verificare</span></div><div class="d">Con ${coppie.length === 1 ? `<strong>${esc((aziendeIdx[coppie[0].codice] || [coppie[0].denominazione])[0] || coppie[0].denominazione)}</strong>` : `${coppie.length} aziende`} questo fornitore presenta indicatori di relazione ricorrente (${[...new Set(coppie.flatMap((p) => p.flags))].join(', ')}): affidamenti diretti ripetuti, dipendenza o esclusiva. Spesso hanno spiegazioni legittime (brevetti, monopoli tecnici). → <a href="../conflitti.html">La pagina delle relazioni ricorrenti</a></div></div>` : ''}

<h2>Aziende che lo hanno pagato</h2>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Azienda</th><th class="num" scope="col">Contratti</th><th class="num" scope="col">Valore</th></tr></thead>
  <tbody>${ospRows}</tbody>
</table></div>

<h2>Contratti principali</h2>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Data</th><th scope="col">Oggetto · Azienda</th><th scope="col">Gara</th><th class="num" scope="col">Importo</th></tr></thead>
  <tbody>${topRows}</tbody>
</table></div>
<p class="small muted">Fonte: <a href="https://dati.anticorruzione.it/opendata">ANAC</a> (CIG + aggiudicatari), gare > 40.000 €.
Ritieni un dato inesatto o vuoi fornire contesto? <a href="../note-legali.html#rettifiche">Richiedi una rettifica</a>.</p>
`;
  const suF = siteUrl();
  const jsonldForn = suF && societa
    ? { '@context': 'https://schema.org', '@graph': [briciole([['Home', '/'], ['Fornitori', 'fornitori.html'], [f.den, `fornitore/${f.cf}.html`]])] }
    : null;
  return page({
    title: `${f.den} — fornitore del SSN — Ospedali Trasparenti`,
    description: `Contratti pubblici di ${f.den} con le aziende sanitarie italiane: valore, aziende, procedure.`,
    active: 'fornitori.html',
    rel: '../',
    canonical: `fornitore/${f.cf}.html`,
    noindex: !societa,
    jsonld: jsonldForn,
    body,
  });
}

function renderFornitoriIndex({ righe, totali }) {
  // righe: [cf, den, valore, n, nOsp, haPagina]
  const rows = righe
    .slice(0, 4000)
    .map((r) => {
      const nome = r[5] ? `<a href="fornitore/${esc(r[0])}.html">${esc(r[1])}</a>` : esc(r[1]);
      return `<tr data-t="${esc(String(r[1]).toLowerCase())}"><td>${nome}</td>
        <td class="num">${euroCompact(r[2])}</td><td class="num">${numeroIt(r[3])}</td><td class="num">${numeroIt(r[4])}</td></tr>`;
    })
    .join('');
  const body = `
<h1>I fornitori del SSN</h1>
<p class="lead">Chi riceve i soldi delle aziende sanitarie: <strong>${numeroIt(totali)} imprese</strong> con contratti
2023–2025. Cerca un’azienda per vedere quanto ha incassato, da quali strutture e con quali procedure. Gli operatori
persone fisiche non sono elencati.</p>
<div class="controls"><input type="search" id="q" placeholder="Cerca fornitore…" aria-label="Cerca fornitore" style="flex:1"></div>
<p class="small muted" id="count"></p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Fornitore</th><th class="num" scope="col">Valore aggiudicato</th><th class="num" scope="col">Contratti</th><th class="num" scope="col">Aziende</th></tr></thead>
  <tbody id="rows">${rows}</tbody>
</table></div>
<p class="small muted">Mostrati i primi 4.000 per valore. I nomi collegati hanno una scheda dedicata (imprese con ≥ 3 contratti o ≥ 500.000 €).
A tutela della riservatezza delle persone fisiche (GDPR), gli operatori individuali non sono mai nominati e le imprese
la cui denominazione contiene nomi di persona (ditte individuali, S.n.c./S.a.s.) sono escluse dagli indicatori di
rischio e non compaiono tra i <a href="conflitti.html">rapporti ricorrenti</a>.</p>
<script>
(function(){var q=document.getElementById('q'),rows=[].slice.call(document.querySelectorAll('#rows tr')),c=document.getElementById('count');
function a(){var t=q.value.trim().toLowerCase(),n=0;rows.forEach(function(r){var ok=!t||r.dataset.t.indexOf(t)>=0;r.classList.toggle('hidden',!ok);if(ok)n++;});c.textContent=n+' fornitori';}
q.addEventListener('input',a);a();})();
</script>`;
  return page({
    title: 'I fornitori del SSN — Ospedali Trasparenti',
    description: 'Elenco delle imprese fornitrici delle aziende sanitarie italiane con valore aggiudicato, numero di contratti e aziende servite.',
    active: 'fornitori.html',
    body,
  });
}

// ---------- ГЛОБАЛНА ТЪРСАЧКА ПРЕЗ ВСИЧКИ ДОГОВОРИ ----------
function renderCerca({ n, aziende }) {
  const body = `
<h1>Cerca in tutti gli appalti</h1>
<p class="lead">Filtra <strong>tutti i ${numeroIt(n)} contratti</strong> delle ${numeroIt(aziende)} aziende collegate,
in un colpo solo: per oggetto, fornitore, azienda, regione, tipo di procedura e importo minimo. Ogni riga è verificabile
tramite il CIG su ANAC.</p>
<div class="note">Il caricamento dell’indice (~28 MB) richiede qualche secondo alla prima apertura. Importi = valore
messo a gara; gli operatori persone fisiche non sono nominati. <strong>Indicatori, non prove.</strong></div>

<div class="controls">
  <input type="search" id="q" placeholder="Cerca oggetto o fornitore…" aria-label="Cerca testo" style="flex:2">
  <select id="reg" aria-label="Regione"><option value="">Tutte le regioni</option></select>
  <select id="proc" aria-label="Procedura">
    <option value="">Tutte le procedure</option>
    <option value="sg">Solo senza gara (diretto/negoziata)</option>
    <option value="d">Affidamento diretto</option>
    <option value="c">Procedura competitiva</option>
    <option value="q">Accordo quadro/convenzione</option>
  </select>
  <select id="imp" aria-label="Importo minimo">
    <option value="0">Qualsiasi importo</option>
    <option value="50000">≥ 50.000 €</option>
    <option value="100000">≥ 100.000 €</option>
    <option value="500000">≥ 500.000 €</option>
    <option value="1000000">≥ 1.000.000 €</option>
  </select>
</div>
<p class="small muted" id="stato">Caricamento dell’indice…</p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Data</th><th scope="col">Azienda</th><th scope="col">Oggetto</th><th scope="col">Fornitore</th><th scope="col">Procedura</th><th class="num" scope="col">Importo</th></tr></thead>
  <tbody id="rows"></tbody>
</table></div>
<script>
(function(){
  var PROC={c:'Competitiva',q:'Accordo quadro',d:'Affidamento diretto',n:'Negoziata senza bando',g:'Negoziata',a:'Altro'};
  var SG={d:1,n:1};
  var q=document.getElementById('q'),reg=document.getElementById('reg'),proc=document.getElementById('proc'),
      imp=document.getElementById('imp'),stato=document.getElementById('stato'),tb=document.getElementById('rows');
  var DATA=null,AZ=null,MAX=500,tmr;
  function eur(v){return v>=1e6?(Math.round(v/1e5)/10).toLocaleString('it-IT')+' mln €':v>=1e3?Math.round(v/1e3).toLocaleString('it-IT')+' mila €':v+' €';}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  // Споделяеми адреси: чете ?q=&reg=&proc=&imp= и ги пише обратно при промяна.
  var P=new URLSearchParams(location.search);
  if(P.get('q'))q.value=P.get('q');
  if(P.get('proc'))proc.value=P.get('proc');
  if(P.get('imp'))imp.value=P.get('imp');
  function writeParams(){
    var u=new URLSearchParams();
    if(q.value.trim())u.set('q',q.value.trim());
    if(reg.value)u.set('reg',reg.value);
    if(proc.value)u.set('proc',proc.value);
    if(imp.value&&imp.value!=='0')u.set('imp',imp.value);
    var qs=u.toString();
    history.replaceState(null,'',qs?'?'+qs:location.pathname);
  }
  fetch('contratti-tutti.json').then(function(r){return r.json();}).then(function(j){
    DATA=j.righe;AZ=j.aziende;
    var regs={};for(var k in AZ)regs[AZ[k][1]]=1;
    Object.keys(regs).sort().forEach(function(r){var o=document.createElement('option');o.value=r;o.textContent=r;reg.appendChild(o);});
    if(P.get('reg'))reg.value=P.get('reg');
    apply();
  }).catch(function(){stato.textContent='Errore nel caricamento dei dati.';});
  function apply(){
    writeParams();
    if(!DATA)return;
    var t=q.value.trim().toLowerCase(),r=reg.value,p=proc.value,mi=+imp.value,out=[],n=0;
    for(var i=0;i<DATA.length;i++){var d=DATA[i];
      if(d[3]<mi)continue;
      if(p==='sg'){if(!SG[d[4]])continue;}else if(p&&d[4]!==p)continue;
      if(r&&(!AZ[d[1]]||AZ[d[1]][1]!==r))continue;
      if(t){var hay=(d[6]+' '+d[5]).toLowerCase();if(hay.indexOf(t)<0)continue;}
      n++;if(out.length<MAX)out.push(d);
    }
    stato.textContent=n.toLocaleString('it-IT')+' contratti trovati'+(n>MAX?' (mostrati i primi '+MAX+' per importo)':'');
    var html='';for(var j=0;j<out.length;j++){var c=out[j],az=AZ[c[1]]||['',''];
      html+='<tr><td class="small">'+esc(c[2])+'</td><td class="small">'+esc(az[0])+'<div class="small muted">'+esc(az[1])+'</div></td>'+
        '<td>'+esc(c[6])+'<div class="small muted">CIG '+esc(c[0])+'</div></td><td>'+esc(c[5]||'—')+'</td>'+
        '<td class="small'+(SG[c[4]]?' neg':'')+'">'+esc(PROC[c[4]]||'')+'</td><td class="num">'+eur(c[3])+'</td></tr>';
    }
    tb.innerHTML=html;
  }
  function deb(){clearTimeout(tmr);tmr=setTimeout(apply,180);}
  q.addEventListener('input',deb);[reg,proc,imp].forEach(function(e){e.addEventListener('change',apply);});
})();
</script>`;
  return page({
    title: 'Cerca in tutti gli appalti — Ospedali Trasparenti',
    description: 'Motore di ricerca su tutti i contratti pubblici delle aziende sanitarie: filtra per oggetto, fornitore, regione, procedura e importo.',
    active: 'cerca.html',
    body,
  });
}

// ---------- РЕГИСТЪР НА ДОГОВОРИТЕ (маниакален детайл) ----------
function csvCell(v) {
  let s = String(v ?? '');
  // Неутрализирай CSV formula injection: клетка, започваща с формула-знак, може
  // да се изпълни при отваряне в Excel/Sheets. Числата (вкл. отрицателни) пазим.
  if (/^[=+@\t\r]/.test(s) || (s.startsWith('-') && !/^-?\d/.test(s))) s = `'${s}`;
  return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
/** Пълен CSV с всеки договор — сваляемият, проверим до последния евро запис. */
function contrattiCsv(ente, list) {
  const head = 'cig;data;oggetto;importo_euro;procedura;cpv;fornitore';
  const lines = list.map((c) =>
    [c.cig, c.data, c.oggetto, c.importo, c.procedura, c.cpv, c.fornitore || ''].map(csvCell).join(';')
  );
  return `# Ospedali Trasparenti — contratti pubblici di ${ente.denominazione} (ANAC)\n` + `# ${list.length} contratti. Importi = valore messo a gara. Fonte: dati.anticorruzione.it\n` + head + '\n' + lines.join('\n') + '\n';
}

const PROC_ABBR = (p) => (p || '').replace(/AFFIDAMENTO DIRETTO IN ADESIONE AD ACCORDO QUADRO\/CONVENZIONE/i, 'Affid. diretto (accordo quadro)').replace(/AFFIDAMENTO DIRETTO/i, 'Affidamento diretto').replace(/PROCEDURA NEGOZIATA SENZA PREVIA PUBBLICAZIONE/i, 'Negoziata senza bando').replace(/PROCEDURA APERTA/i, 'Procedura aperta');

/** Регистър на договорите в детайлната страница (топ N inline + пълен CSV). */
function contrattiBlock(ente, list) {
  if (!list || !list.length) return '';
  const MAX_INLINE = 300;
  const totale = list.reduce((s, c) => s + c.importo, 0);
  const shown = list.slice(0, MAX_INLINE);
  const rows = shown
    .map((c) => {
      const flag = c.categoria === 'diretto' || c.categoria === 'negoziataSenza';
      return `<tr data-t="${esc(((c.oggetto || '') + ' ' + (c.fornitore || '')).toLowerCase())}">
      <td class="small">${esc(c.data)}</td>
      <td>${esc(c.oggetto || '—')}<div class="small muted">CIG ${esc(c.cig)}${c.cpv ? ' · ' + esc(c.cpv) : ''}</div></td>
      <td>${esc(c.fornitore || '—')}</td>
      <td class="small${flag ? ' neg' : ''}">${esc(PROC_ABBR(c.procedura))}</td>
      <td class="num">${euroCompact(c.importo)}</td></tr>`;
    })
    .join('');
  return `<h2>Registro dei contratti <span class="small muted">(${numeroIt(list.length)} contratti ANAC, ${euroCompact(totale)} messi a gara)</span></h2>
<p class="muted small">Ogni contratto pubblico dell’azienda: <strong>cosa, a chi, quando, quanto e con quale procedura</strong>.
Il CIG è il codice univoco verificabile su ANAC. Importi = valore messo a gara. Gli operatori persone fisiche non sono nominati.</p>
<p><a class="chip" href="../contratti/${ente.codice}.csv" download>⬇ Scarica l’elenco completo (CSV, ${numeroIt(list.length)} contratti)</a></p>
<div class="controls"><input type="search" id="cq" placeholder="Cerca oggetto o fornitore…" aria-label="Cerca nei contratti"></div>
<p class="small muted" id="ccount"></p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Data</th><th scope="col">Oggetto</th><th scope="col">Fornitore</th><th scope="col">Procedura</th><th class="num" scope="col">Importo</th></tr></thead>
  <tbody id="crows">${rows}</tbody>
</table></div>
${list.length > MAX_INLINE ? `<p class="small muted">Mostrati i ${MAX_INLINE} contratti di importo maggiore su ${numeroIt(list.length)}. L’elenco completo è nel <a href="../contratti/${ente.codice}.csv" download>CSV</a>.</p>` : ''}
<script>
(function(){
  var q=document.getElementById('cq'),rows=[].slice.call(document.querySelectorAll('#crows tr')),cc=document.getElementById('ccount');
  function apply(){var t=q.value.trim().toLowerCase(),n=0;rows.forEach(function(r){var ok=!t||r.dataset.t.indexOf(t)>=0;r.classList.toggle('hidden',!ok);if(ok)n++;});cc.textContent=n+' contratti mostrati';}
  q.addEventListener('input',apply);apply();
})();
</script>`;
}

/** Блок за поръчките в детайлната страница (при свързан възложител). */
function appaltiBlock(app, appMatch) {
  if (!app) return '';
  const items = PROC_ORDER.map((k) => app.cat[k] && app.cat[k].importo > 0 && ({
    label: PROC_LABEL[k],
    valore: app.cat[k].importo,
    quota: app.importo > 0 ? app.cat[k].importo / app.importo : 0,
    flag: k === 'diretto' || k === 'negoziataSenza',
  })).filter(Boolean);
  const sgNum = app.quotaSenzaGaraNum;
  const sgVal = app.quotaSenzaGara;
  const med = appMatch?.medianaSenzaGaraNum;
  // минимален брой договори — иначе малка извадка дава подвеждащ флаг
  const flagSg = sgNum != null && med != null && app.n >= 50 && sgNum > Math.max(0.65, med * 1.4);
  const top = (app.top || [])
    .filter((c) => c.importo > 0)
    .slice(0, 8)
    .map(
      (c) => `<tr><td>${esc(c.oggetto || '—')}<div class="small muted">${esc(c.cpv || '')}</div></td>
      <td>${esc(c.procedura)}</td><td class="num">${euroCompact(c.importo)}</td></tr>`
    )
    .join('');

  // Изпълнители + търгове с един кандидат + концентрация
  const ag = app.aggiu;
  const sbQ = ag?.quotaUnicoOfferente;
  const flagSb = sbQ != null && ag.gareConPartecipanti >= 20 && sbQ > 0.6;
  const concQ = ag?.top1Quota;
  const flagConc = concQ != null && ag.valoreAggiudicato >= 10_000_000 && concQ > 0.5;
  const fornRows = (ag?.topFornitori || [])
    .slice(0, 5)
    .map((f) => `<tr><td>${esc(f.den)}</td><td class="num">${euroCompact(f.valore)}</td><td class="num">${numeroIt(f.n)}</td></tr>`)
    .join('');
  const aggBlock = ag
    ? `<div class="grid kpis" style="margin-top:12px">
        ${kpi('Gare a offerente unico', percentualeIt(sbQ), flagSb ? 'neg' : '')}
        ${kpi('Concentrazione (1° fornitore)', percentualeIt(concQ), flagConc ? 'neg' : '')}
        ${kpi('Fornitori distinti', numeroIt(ag.nFornitori))}
      </div>
      ${flagSb ? `<div class="seg alta" style="margin-top:12px"><div class="t"><span class="badge alta">!</span> <span>Gare con un solo offerente registrato</span></div><div class="d">Sui dati (parziali) dei partecipanti, il ${percentualeIt(sbQ)} delle gare (${numeroIt(ag.gareUnicoOfferente)}/${numeroIt(ag.gareConPartecipanti)}) risulta con una sola offerta. Indicatore da verificare — può derivare da mercati ristretti, esclusive o urgenze; non è prova di irregolarità.</div></div>` : ''}
      ${flagConc ? `<div class="seg alta" style="margin-top:12px"><div class="t"><span class="badge alta">!</span> <span>Elevata concentrazione su un fornitore</span></div><div class="d">Il ${percentualeIt(concQ)} del valore aggiudicato va a un solo operatore${ag.topFornitori[0].azienda ? ` (${esc(ag.topFornitori[0].den)})` : ''}. Può essere legittimo (mercato ristretto, esclusiva); è un indicatore, non una prova.</div></div>` : ''}
      ${fornRows ? `<h3>Principali fornitori</h3><div class="tablewrap"><table><thead><tr><th scope="col">Fornitore</th><th class="num" scope="col">Valore aggiudicato</th><th class="num" scope="col">Contratti</th></tr></thead><tbody>${fornRows}</tbody></table></div><p class="small muted">Essere fornitore rilevante è legittimo; le persone fisiche non sono nominate.</p>` : ''}`
    : '';

  // Frazionamento (преки възлагания под праговете) + proroghe
  const fraz = (app.band40 || 0) + (app.band140 || 0);
  const frazBlock =
    fraz > 20 || (app.prorogaN || 0) > 30
      ? `<p class="small muted" style="margin-top:10px"><strong>Altri segnali:</strong>
         ${fraz} affidamenti diretti appena sotto le soglie di legge (35–40 mila € e 130–140 mila €, possibile
         frazionamento); ${numeroIt(app.prorogaN || 0)} contratti con oggetto di proroga/rinnovo.</p>`
      : '';

  return `<h2>Appalti pubblici <span class="small muted">(ANAC, ${app.reg})</span></h2>
    <div class="grid kpis">
      ${kpi('Contratti senza gara', percentualeIt(sgNum), flagSg ? 'neg' : '')}
      ${kpi('Senza gara sul valore', percentualeIt(sgVal), (sgVal || 0) > 0.5 ? 'neg' : '')}
      ${kpi('Valore appalti', euroCompact(app.importo))}
      ${kpi('Contratti (lotti)', numeroIt(app.n))}
    </div>
    ${flagSg ? `<div class="seg alta" style="margin-top:12px"><div class="t"><span class="badge alta">!</span> <span>Ricorso elevato agli affidamenti senza gara</span></div><div class="d">Il ${percentualeIt(sgNum)} dei contratti (${percentualeIt(sgVal)} del valore) è affidato senza confronto competitivo; mediana tra le aziende ${percentualeIt(med)}.</div></div>` : ''}
    <div class="card" style="margin-top:12px">${hbars(items, { fmt: euroCompact, maxLabel: 'Appalti per tipo di procedura' })}</div>
    ${aggBlock}
    ${frazBlock}
    ${top ? `<h3>Contratti più grandi</h3><div class="tablewrap"><table><thead><tr><th scope="col">Oggetto</th><th scope="col">Procedura</th><th class="num" scope="col">Importo</th></tr></thead><tbody>${top}</tbody></table></div>` : ''}
    <p class="small muted">Fonte: <a href="https://dati.anticorruzione.it/opendata">ANAC</a> (CIG, aggiudicatari, partecipanti), gare > 40.000 € pubblicate negli anni considerati.</p>`;
}

// ---------- INCHIESTA ----------
function renderInchiesta({ forense, appalti, appMatch, href, conCordate, conSegGare }) {
  const anni = Object.keys(forense.sistema.perAnno).map(Number).sort((a, b) => a - b);
  const S = (k) => anni.map((a) => [a, forense.sistema.perAnno[a][k]]);
  const chart = lineChart(
    [
      { label: 'Aziende (AO/ASL)', color: 'var(--neg)', points: S('risultatoAziende') },
      { label: 'Copertura regionale (GSA)', color: 'var(--pos)', points: S('risultatoGSA') },
      { label: 'Sistema (aziende + GSA)', color: 'var(--brand)', points: S('risultatoSistema') },
    ],
    { caption: 'Risultato d’esercizio aggregato per anno (€): il rosso delle aziende è in gran parte coperto dalla GSA regionale' }
  );
  const ultimo = anni.at(-1);
  const s = forense.sistema.perAnno[ultimo];

  const rows = anni
    .map((a) => {
      const x = forense.sistema.perAnno[a];
      return `<tr><td>${a}</td>
        <td class="num">${x.aziendeInPerdita} / ${x.aziende}</td>
        <td class="num neg">${euroCompact(x.risultatoAziende)}</td>
        <td class="num pos">${euroCompact(x.risultatoGSA)}</td>
        <td class="num ${x.risultatoSistema < 0 ? 'neg' : 'pos'}">${euroCompact(x.risultatoSistema)}</td></tr>`;
    })
    .join('');

  const top = forense.enti
    .filter((e) => e.flags.length)
    .sort((a, b) => b.flags.length - a.flags.length || (b.cat.consulenzeInterinale?.valore || 0) - (a.cat.consulenzeInterinale?.valore || 0))
    .slice(0, 15);
  const flagCards = top
    .map(
      (e) => `<div class="seg alta">
      <div class="t"><span class="badge alta">${e.flags.length}</span> <a href="${href(e.codice)}">${esc(e.denominazione)}</a> <span class="small muted">${esc(e.regione)} · ${e.anno}</span></div>
      <div class="d">${e.flags.slice(0, 3).map((f) => esc(f.testo)).join('<br>')}${e.flags.length > 3 ? `<br><span class="muted small">…e altre ${e.flags.length - 3}</span>` : ''}</div>
    </div>`
    )
    .join('');

  const body = `
<h1>Inchiesta: dove vanno davvero i soldi</h1>
<p class="lead">«Non è possibile che ogni ospedale sia in perdita.» È l’obiezione giusta — e i dati danno una risposta netta.
Il disavanzo delle aziende è in larga parte <strong>coperto a livello regionale</strong>; e non tutte le aziende sono in rosso.
Ma quando si scende nelle voci di spesa, emergono anomalie che meritano un occhio.</p>
${rigaAggiornamento()}

<div class="note"><strong>La verità sul “rosso”.</strong> Le aziende sanitarie ricevono il Fondo Sanitario Regionale in parte
tramite la <em>Gestione Sanitaria Accentrata</em> (GSA) della Regione. Il disavanzo delle singole aziende viene così
in gran parte compensato dalla GSA: il risultato “di sistema” (aziende + GSA) è molto più vicino al pareggio del
semplice rosso aziendale. <strong>Nel ${ultimo}, ${s.aziendeInUtile} aziende su ${s.aziende} chiudono in utile o pareggio.</strong></div>

<h2>Il conto vero del sistema</h2>
<div class="card">${chart}</div>
<div class="grid kpis" style="margin-top:16px">
  ${kpi(`Aziende in utile (${ultimo})`, `${s.aziendeInUtile} / ${s.aziende}`, 'pos')}
  ${kpi('Rosso delle aziende', euroCompact(s.risultatoAziende), 'neg')}
  ${kpi('Copertura GSA regionale', euroCompact(s.risultatoGSA), 'pos')}
  ${kpi('Disavanzo di sistema', euroCompact(s.risultatoSistema), s.risultatoSistema < 0 ? 'neg' : 'pos')}
</div>
<div class="tablewrap" style="margin-top:14px"><table>
  <thead><tr><th scope="col">Anno</th><th class="num" scope="col">In perdita</th><th class="num" scope="col">Rosso aziende</th><th class="num" scope="col">Copertura GSA</th><th class="num" scope="col">Sistema</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<p class="small muted">Il ${ultimo} è l’anno peggiore della serie: il disavanzo di sistema tocca ${euroCompact(s.risultatoSistema)}.
Il problema quindi non è «ogni ospedale ruba», ma <em>dove</em> si concentra la spesa e <em>perché</em> alcune strutture
si discostano nettamente dalle altre.</p>

<div class="note"><strong>Confronto con la Corte dei conti.</strong> Il nostro dato è la somma del
<em>risultato d’esercizio</em> (voce ZZ9999 dei modelli CE), non la voce ufficiale di «disavanzo sanitario». La
<a href="https://www.quotidianosanita.it/studi-e-analisi/corte-dei-conti-la-sanit-italiana-in-cammino-per-il-cambiamento-ma-restano-squilibri-strutturali-ritardi-e-bilanci-che-scricchiolano/">Corte dei conti</a>
stima per il ${ultimo} un disavanzo di circa <strong>1,5 mld €</strong> con 16 regioni in rosso, il valore più alto del
decennio: la <strong>direzione e l’ordine di grandezza coincidono</strong> con la nostra ricostruzione (${ultimo} anno
peggiore, deficit triplicato). Le differenze sui singoli valori derivano dalla <strong>diversa definizione</strong>
di disavanzo (coperture regionali, mobilità, payback farmaceutico): p.es. per l’Emilia-Romagna i due dati coincidono
quasi all’euro (−194,2 mln), per altre regioni no. È un confronto di trasparenza, non una stima ufficiale.</div>

<h2>Le strutture con più anomalie di spesa</h2>
<p class="muted small">Ordinate per numero di segnali «follow the money». Ogni segnale confronta una voce con la mediana
nazionale. <a href="classifiche.html">Vedi le classifiche per categoria →</a></p>
${flagCards}

${appalti ? `<h2>Segui gli appalti</h2>
<p class="muted small">Abbiamo incrociato i bilanci con la banca dati ANAC degli appalti pubblici (${rangeAnni(appalti.anni)}).
A livello nazionale <strong>${percentualeIt(appalti.nazionale.quotaSenzaGaraNum)} dei contratti</strong> sanitari
(il ${percentualeIt(appalti.nazionale.quotaSenzaGara)} del valore) è affidato <strong>senza gara</strong>
— affidamento diretto o negoziata senza bando.
→ <a href="appalti.html">Il confronto tra regioni e le aziende con più appalti senza gara</a></p>` : ''}

${conCordate || conSegGare ? `<p class="muted small">Altri indicatori sulle gare, da verificare:
${conSegGare ? '<a href="segnali-gare.html">frazionamento, soglie UE e tempi troppo brevi</a>' : ''}${conCordate && conSegGare ? ' · ' : ''}${conCordate ? '<a href="cordate.html">chi si presenta sempre insieme alle gare</a>' : ''}.</p>` : ''}

<div class="note" style="margin-top:22px"><strong>Attenzione.</strong> Un’anomalia di spesa non è una prova di illecito.
Consulenze elevate, molte prestazioni comprate dai privati o affitti ingenti possono avere ragioni legittime.
Sono <em>piste</em>, quelle che la Corte dei conti e l’ANAC seguono per prime — non verdetti.</div>
`;
  return page({
    title: 'Inchiesta: dove vanno i soldi — Ospedali Trasparenti',
    description: 'La verità sul disavanzo degli ospedali pubblici italiani e le anomalie di spesa: consulenze, prestazioni da privati, affitti. Analisi sui dati ufficiali.',
    active: 'inchiesta.html',
    ogType: 'article',
    jsonld: articleLd('Inchiesta: dove vanno i soldi della sanità pubblica', 'Il disavanzo «vero» del sistema sanitario e le anomalie di spesa, dai dati ufficiali.', 'inchiesta.html'),
    body,
  });
}

// ---------- CLASSIFICHE ----------
function renderClassifiche({ forense, href }) {
  const C = forense.classifiche;
  const codToHref = (cod) => href(cod);
  const tavola = (titolo, descr, list, valFmt, extraFmt, extraHead) => `
<h2>${esc(titolo)}</h2>
<p class="muted small">${esc(descr)}</p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">#</th><th scope="col">Struttura</th><th class="num" scope="col">${esc(extraHead)}</th><th class="num" scope="col">Importo</th></tr></thead>
  <tbody>${list
    .map(
      (x, i) => `<tr><td class="num">${i + 1}</td>
      <td><a href="${codToHref(x.codice)}">${esc(x.denominazione)}</a><div class="small muted">${esc(x.regione)}</div></td>
      <td class="num">${esc(extraFmt(x))}</td><td class="num">${esc(valFmt(x))}</td></tr>`
    )
    .join('')}</tbody>
</table></div>`;

  const body = `
<h1>Classifiche «follow the money»</h1>
<p class="lead">Le voci di spesa più esposte a inefficienza e opacità, normalizzate e messe in fila.
Non sono accuse: sono i punti dove conviene guardare. Ultimo esercizio disponibile.</p>

${tavola(
  'Consulenze e lavoro interinale sul costo del personale',
  'Quanto pesano consulenze, collaborazioni e interinale rispetto al personale interno. Mediana nazionale ~5%.',
  C.consulenzeSuPersonale,
  (x) => euroCompact(x.valore),
  (x) => percentualeIt(x.extra),
  '% del personale'
)}
${tavola(
  'Dipendenza dagli erogatori privati',
  'Acquisto di prestazioni sanitarie da soggetti privati come quota dei costi.',
  C.dipendenzaPrivato,
  (x) => euroCompact(x.valore),
  (x) => percentualeIt(x.extra),
  '% dei costi'
)}
${tavola(
  'Godimento di beni di terzi (affitti e noleggi)',
  'Affitti e noleggi come quota dei costi: valori alti possono nascondere operazioni immobiliari onerose.',
  C.godimentoTerzi,
  (x) => euroCompact(x.valore),
  (x) => percentualeIt(x.extra),
  '% dei costi'
)}
${tavola(
  'Acquisti di beni per posto letto',
  'Spesa per beni (farmaci, dispositivi) rapportata ai posti letto: outlier = possibili sovrapprezzi.',
  C.beniPerLetto,
  (x) => euroCompact(x.valore),
  (x) => euroIt(x.extra) + '/letto',
  'per posto letto'
)}
${tavola(
  'Servizi non sanitari per posto letto',
  'Pulizia, mensa, riscaldamento, rifiuti… per posto letto. I grandi appalti esternalizzati.',
  C.serviziNonSanitariPerLetto,
  (x) => euroCompact(x.valore),
  (x) => euroIt(x.extra) + '/letto',
  'per posto letto'
)}
<p class="small muted" style="margin-top:20px">Metodo e limiti nella <a href="metodologia.html">metodologia</a>.</p>
`;
  return page({
    title: 'Classifiche follow the money — Ospedali Trasparenti',
    description: 'Classifiche delle voci di spesa più esposte a inefficienza negli ospedali pubblici italiani: consulenze, privati, affitti, beni per posto letto.',
    active: 'classifiche.html',
    ogType: 'article',
    jsonld: articleLd('Classifiche «follow the money» della spesa sanitaria', 'Le voci di spesa più esposte a inefficienza negli ospedali pubblici italiani.', 'classifiche.html'),
    body,
  });
}

function isDetailLine(desc) {
  const d = desc.trim();
  return (
    /^[A-Z]\)(\s|$)/.test(d) ||
    /^[A-Z]\.\d+\)(\s|$)/i.test(d) ||
    /^[A-Z]\.\d+\.[A-Z]\)(\s|$)/i.test(d) ||
    /^totale/i.test(d) ||
    /^risultato/i.test(d)
  );
}
function isTopLevelSp(desc) {
  const d = desc.trim();
  return /^[A-G]\)\s/.test(d) || /totale/i.test(d);
}

main().catch((err) => {
  console.error('Грешка:', err);
  process.exitCode = 1;
});
