// Генерира статичен сайт на италиански от финансовите данни и сигналите:
//  site/index.html          — начало: национални KPI + топ сигнали
//  site/strutture.html      — всички структури с филтър/търсене (vanilla JS)
//  site/segnalazioni.html   — всички сигнали с филтри
//  site/metodologia.html    — метод, източници, disclaimer
//  site/struttura/<cod>.html — детайл за структура (SVG графики + финанси + сигнали)
// Нула зависимости, нула външни ресурси.

// @ts-check
import { join } from 'node:path';
import { mkdir, writeFile, rm, readFile, stat, copyFile } from 'node:fs/promises';
import { SITE_DIR, ROOT } from './lib/paths.js';
import { loadDataset, postiLettoEnte, ricoveriEnte } from './lib/dataset.js';
import { readJson } from './lib/http.js';
import { SEGNALAZIONI_FILE, DATA_DIR } from './lib/paths.js';
import { join as pjoin } from 'node:path';
import { matchAutoritaEnti } from './lib/match.js';
import { numeroIt, slugify, esc } from './lib/format.js';
import { percentile } from './lib/stats.js';
import { page, setSiteUrl, siteUrl } from './lib/site-ui.js';
import {
  pIvaValida, REGIONI, REG_KEY, ultimoCe, setDataSnapshot, pagLd, articleLd,
} from './lib/site-shared.js';
import { renderHome } from './render/home.js';
import { renderStrutture, renderStruttura } from './render/strutture.js';
import { semaforoStruttura, contaSpie, quotaSottoSoglia } from './lib/pagella.js';
import { renderPagella } from './pagina-pagella.js';
import { renderSegnalazioni } from './render/segnalazioni.js';
import { renderMetodologia } from './render/metodologia.js';
import { renderVerifiche, renderDati, renderNoteLegali, renderPrivacy } from './render/legal.js';
import { renderFornitore, renderFornitoriIndex, renderCerca } from './render/fornitori.js';
import { mergeAppRows, renderRegioniIndex, renderRegione } from './render/regioni.js';
import { renderAppalti, contrattiCsv } from './render/appalti.js';
import { renderConflitti, renderInchiesta, renderClassifiche } from './render/inchiesta.js';
import { eSocietaDiCapitali } from './coi.js';
import {
  classificaCpv, CPV_LABELS, renderTendenze, renderTopContratti, renderCategorie, renderDove,
  renderGlossario, renderGuida, renderSegnalare, renderPnrr, renderStorie, renderStoria, STORIE,
  renderAggiornamenti, renderApprofondimenti,
  renderPagamenti, renderPersonale, renderMobilita,
  renderFineAnno, renderConfronta, renderApi, renderAccessibilita, renderStorico,
  setApprofondimentiCtx,
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

/** @typedef {import('./lib/models.js').SegnData} SegnData */
/** @typedef {import('./lib/models.js').SegnEnte} SegnEnte */
/** @typedef {import('./lib/models.js').ForenseData} ForenseData */
/** @typedef {import('./lib/models.js').ForenseEnte} ForenseEnte */
/** @typedef {import('./lib/models.js').AppaltiData} AppaltiData */
/** @typedef {import('./lib/models.js').Autorita} Autorita */
/** @typedef {import('./lib/models.js').AppMatch} AppMatch */
/** @typedef {import('./lib/models.js').CoiData} CoiData */
/** @typedef {import('./lib/models.js').CoiCoppia} CoiCoppia */
/** @typedef {import('./lib/models.js').AggiudicatariData} AggiudicatariData */
/** @typedef {import('./lib/models.js').Validazione} Validazione */
/** @typedef {import('./lib/models.js').DatasetInfo} DatasetInfo */
/** @typedef {import('./lib/models.js').RegioniDataRow} RegioniDataRow */
/** @typedef {import('./lib/models.js').RegAgg} RegAgg */
/** @typedef {import('./render/appalti.js').Contratto} Contratto */
/** @typedef {import('./render/fornitori.js').FornitoreProfile} FornitoreProfile */

const FORENSICS_FILE = pjoin(DATA_DIR, 'forensics.json');
const APPALTI_FILE = pjoin(DATA_DIR, 'appalti.json');
const AGGIU_FILE = pjoin(DATA_DIR, 'aggiudicatari.json');
const VALIDAZIONE_FILE = pjoin(DATA_DIR, 'validazione.json');
const CONTRATTI_DIR = pjoin(DATA_DIR, 'contratti');

async function main() {
  const config = await readJson(join(ROOT, 'config.json')).catch(() => ({}));
  setSiteUrl(config.siteUrl || '');
  const { enti, anagrafica, ultimoAnnoCe } = await loadDataset();
  const struttureByCod = new Map(anagrafica.strutture.map((s) => [s.codice, s]));
  const segn = /** @type {SegnData} */ (await readJson(SEGNALAZIONI_FILE).catch(() => {
    throw new Error('няма segnalazioni.json — пусни първо `npm run analyze`');
  }));
  /** @type {Map<string, SegnEnte>} */
  const segnByCod = new Map(segn.enti.map((e) => [e.codice, e]));
  const forense = /** @type {ForenseData} */ (await readJson(FORENSICS_FILE).catch(() => {
    throw new Error('няма forensics.json — пусни първо `npm run forensics`');
  }));
  /** @type {Map<string, ForenseEnte>} */
  const forByCod = new Map(forense.enti.map((e) => [e.codice, e]));

  // ANAC поръчки (по избор — ако липсват, разделите просто не се показват)
  const appalti = /** @type {AppaltiData|null} */ (await readJson(APPALTI_FILE).catch(() => null));
  /** @type {Map<string, Autorita>} */
  let appByCod = new Map();
  /** @type {AppMatch|null} */
  let appMatch = null;
  if (appalti) {
    const { byCf, byCodice } = matchAutoritaEnti(
      enti.map((e) => ({ codice: e.codice, denominazione: e.denominazione, regione: e.regione })),
      appalti.autorita.map((a) => ({ cf: a.cf, den: a.den, reg: a.reg }))
    );
    /** @type {Map<string, Autorita>} */
    const autByCf = new Map(appalti.autorita.map((a) => [a.cf, a]));
    // изпълнители/участници (по избор)
    const aggiu = /** @type {AggiudicatariData|null} */ (await readJson(AGGIU_FILE).catch(() => null));
    const aggPerCf = aggiu ? aggiu.perCf : {};
    for (const [codice, cf] of byCodice) {
      const a = autByCf.get(cf);
      if (a) appByCod.set(codice, { ...a, aggiu: aggPerCf[cf] || null });
    }
    appMatch = { abbinate: byCodice.size, totali: enti.length, aggiu, autByCf };
    // национална медиана на дела „senza gara“ по БРОЙ сред свързаните болници (за флаг).
    // percentile(…,50) = горна-средна стойност (nearest-rank) — идентична на предишния
    // inline израз quote[floor(n/2)], но през единствения източник в stats.js.
    const quote = /** @type {number[]} */ ([...appByCod.values()].map((a) => a.quotaSenzaGaraNum).filter((v) => v != null));
    appMatch.medianaSenzaGaraNum = percentile(quote, 50);
    // Подай живия брой свързани болници на approfondimenti прозата (вместо твърдо число).
    setApprofondimentiCtx({ nAbbinate: appMatch.abbinate });
    void byCf;
  }

  // индикатори „конфликт на интереси" (по избор — генерира се от `npm run coi`)
  const coi = /** @type {CoiData|null} */ (await readJson(pjoin(DATA_DIR, 'coi.json')).catch(() => null));
  /** @type {Map<string, CoiCoppia[]>} */
  const coiByCf = new Map();
  if (coi) for (const p of coi.coppie) {
    if (!coiByCf.has(p.cf)) coiByCf.set(p.cf, []);
    coiByCf.get(p.cf)?.push(p);
  }

  await rm(SITE_DIR, { recursive: true, force: true });
  await mkdir(join(SITE_DIR, 'struttura'), { recursive: true });
  await mkdir(join(SITE_DIR, 'contratti'), { recursive: true });

  // Общ индекс за клиентско филтриране + връзки
  const slugByCod = new Map(enti.map((e) => [e.codice, slugify(e.denominazione)]));
  /** @param {string} cod */
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

  // Датата на снапшота трябва да е зададена ПРЕДИ първия рендер, който вика articleLd()
  // (иначе datePublished/dateModified излизат празни → нула freshness сигнал за AI/Google).
  const validaz = /** @type {Validazione|null} */ (await readJson(VALIDAZIONE_FILE).catch(() => null));
  setDataSnapshot(validaz && validaz.generatoIl ? validaz.generatoIl.slice(0, 10) : '');
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
  if (validaz) await writeFile(join(SITE_DIR, 'verifiche.html'), renderVerifiche({ validaz, appMatch }));

  let conContratti = 0;
  /** @type {Record<string, string>} */
  const catCode = { competitiva: 'c', quadro: 'q', diretto: 'd', negoziataSenza: 'n', negoziata: 'g', altro: 'a' };
  /** @type {any[][]} */
  const tuttiContratti = []; // глобален индекс за търсачката
  /** @type {Map<string, { n: number, importo: number, senzaGara: number, forn: Map<string, { cf: string, den: string, importo: number }> }>} */
  const catAgg = new Map(); // CPV макрокатегория → агрегат (за „Dove vanno i soldi")
  /** @type {any[]} */
  const topCand = []; // кандидати за „i 100 contratti più grandi" (пълни полета)
  /** @type {{ nazionale: number[], perEnte: Map<string, number[]> }} */
  const mesiAgg = { nazionale: new Array(12).fill(0), perEnte: new Map() }; // преки възлагания по месец (bunching di fine anno)

  // Benchmark €/легло и €/приемане: национални медиани (пре-пас преди рендера)
  /** @type {number[]} */
  const cplTutti = [];
  /** @type {number[]} */
  const cprTutti = [];
  for (const e of enti) {
    const y = ultimoCe(e).y;
    if (!y.costiProduzione) continue;
    const letti = postiLettoEnte(e, anagrafica);
    const ric = ricoveriEnte(e, anagrafica);
    if (letti != null) cplTutti.push(y.costiProduzione / letti);
    if (ric != null) cprTutti.push(y.costiProduzione / ric);
  }
  // percentile(…,50) = nearest-rank горна-средна стойност — идентична на предишния
  // inline mediana(), но без дублиране на статистиката (единствен източник stats.js).
  const bench = { cplMed: percentile(cplTutti, 50), cprMed: percentile(cprTutti, 50) };
  /** @type {Record<string, [string, string]>} */
  const aziendeIdx = {}; // codice → [nome, regione]
  /** @type {Map<string, FornitoreProfile>} */
  const fornAgg = new Map(); // cf → профил на изпълнителя (през всички болници)

  // Нови източници (all-11) — зареждат се тук (преди цикъла за структурите), за да
  // захранят и панела „La tua regione" във всеки профил. Всеки по избор.
  /** @type {any} */
  const popolazione = await readJson(pjoin(DATA_DIR, 'popolazione.json')).catch(() => ({ regioni: {}, italia: 0, anno: null }));
  /** @param {string} k */
  const nomeReg = (k) => (REGIONI[k] ? REGIONI[k].nome : k);
  /** @param {string} k */
  const regHref = (k) => (REGIONI[k] ? `regione/${k}.html` : null);
  /** @type {any} */
  const apparecchiature = await readJson(pjoin(DATA_DIR, 'apparecchiature.json')).catch(() => null);
  /** @type {any} */
  const sdo = await readJson(pjoin(DATA_DIR, 'sdo.json')).catch(() => null);
  /** @type {any} */
  const siope = await readJson(pjoin(DATA_DIR, 'siope.json')).catch(() => null);
  /** @type {any} */
  const pnrrSalute = await readJson(pjoin(DATA_DIR, 'pnrr-salute.json')).catch(() => null);

  // Регионален контекст per ключ (за панела в профила на болницата) — 100% надежден
  // join (регион), за разлика от кодовете на отделните структури.
  /** @type {Record<string, import('./lib/models.js').RegCtx>} */
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

  // ---- Pagella: медиана на дела „sotto soglia" сред свързаните възложители
  //      (същият праг n≥50 като спиите — малките извадки не участват в нормата)
  const quoteSS = /** @type {number[]} */ ([...appByCod.values()].filter((a) => a.n >= 50).map(quotaSottoSoglia).filter((v) => v != null));
  const medianaSottoSoglia = percentile(quoteSS, 50);
  /** @type {import('./pagina-pagella.js').RigaPagella[]} */
  const righePagella = [];

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
    // 5-те спии на структурата (pagella) — и за профила, и за общата страница
    const segE = segnByCod.get(ente.codice) || null;
    const spie = semaforoStruttura({
      seg: segE,
      forse: forByCod.get(ente.codice) || null,
      app: appByCod.get(ente.codice) || null,
      medianaSenzaGara: appMatch ? appMatch.medianaSenzaGaraNum : null,
      medianaSottoSoglia,
    });
    righePagella.push({ codice: ente.codice, denominazione: ente.denominazione, regione: ente.regione, spie, conti: contaSpie(spie) });
    await writeFile(
      join(SITE_DIR, 'struttura', `${fileCod}.html`),
      renderStruttura({ ente, struttureByCod, anagrafica, seg: segnByCod.get(ente.codice), forse: forByCod.get(ente.codice), app: appByCod.get(ente.codice), contratti, appMatch, ultimoAnnoCe, bench, reg: regCtx[REG_KEY[ente.codice.slice(0, 3)]], spie, conFeed: !!(segE && segE.segnalazioni.length && siteUrl()) })
    );
  }
  // Глобален индекс + страница за търсене през всички договори
  let paginaCerca = 0;
  if (tuttiContratti.length) {
    tuttiContratti.sort((a, b) => b[3] - a[3]); // по сума, за да е топ-N смислен
    await writeFile(
      join(SITE_DIR, 'contratti-tutti.json'),
      // Дата = снапшот на данните (както sitemap/dati), не датата на билда → детерминизъм.
      JSON.stringify({ generatoIl: (validaz && validaz.generatoIl ? validaz.generatoIl : new Date().toISOString()).slice(0, 10), aziende: aziendeIdx, righe: tuttiContratti })
    );
    await writeFile(join(SITE_DIR, 'cerca.html'), renderCerca({ n: tuttiContratti.length, aziende: Object.keys(aziendeIdx).length }));
    paginaCerca = 1;
  }

  // Профили на изпълнителите („segui il fornitore“)
  let paginaForn = 0;
  /** @type {string[]} */
  const fornituraCfs = [];
  if (fornAgg.size) {
    await mkdir(join(SITE_DIR, 'fornitore'), { recursive: true });
    const fornList = [...fornAgg.values()].sort((a, b) => b.valore - a.valore);
    // индекс (всички фирми) + профил-страници за материалните
    /** @type {Array<[string, string, number, number, number, number]>} */
    const idxRows = [];
    for (const f of fornList) {
      const materiale = f.valore >= 500_000 || f.n >= 3;
      const haPagina = materiale;
      if (haPagina) {
        f.top.sort((a, b) => b.importo - a.importo);
        // ditta individuale/società di persone (лични имена по конструкция):
        // без рискови флагове, noindex, извън sitemap (правен одит)
        const societa = eSocietaDiCapitali(f.den);
        await writeFile(join(SITE_DIR, 'fornitore', `${f.cf}.html`), renderFornitore({ f, aziendeIdx, societa, coppie: societa ? coiByCf.get(f.cf) || [] : [], strutturaHref: (/** @type {string} */ cod) => `../struttura/${cod}-${slugByCod.get(cod)}.html` }));
        if (societa) fornituraCfs.push(f.cf);
        paginaForn++;
      }
      idxRows.push(/** @type {[string, string, number, number, number, number]} */ ([f.cf, f.den, f.valore, f.n, f.perOsp.size, haPagina ? 1 : 0]));
    }
    await writeFile(join(SITE_DIR, 'fornitori.html'), renderFornitoriIndex({ righe: idxRows, totali: fornList.length }));
    paginaForn++;
  }

  // Регионални страници + географска карта на Италия (истински choropleth)
  const appRegByName = new Map((appalti ? appalti.regionale : []).map((r) => [r.reg, r]));
  /** @type {Map<string, RegAgg>} */
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
  /** @type {RegioniDataRow[]} */
  const regioniData = [];
  for (const [key, meta] of Object.entries(REGIONI)) {
    const g = regAgg.get(key);
    if (!g) continue;
    const appReg = mergeAppRows(/** @type {import('./lib/models.js').RegionaleRow[]} */ (meta.anac.map((n) => appRegByName.get(n)).filter(Boolean)));
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
  /** @type {Record<string, { valore: number, costi: number, personale: number, risultato: number }>} */
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
  /** @type {Map<string, { prima: number, dopo: number }>} */
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
  /** @type {Map<string, import('./lib/dataset.js').StrutturaAnag>} */
  const perStruttura = new Map();
  for (const s of anagrafica.strutture) {
    const prev = perStruttura.get(s.codice);
    if (!prev || (s.anno ?? 0) > (prev.anno ?? 0)) perStruttura.set(s.codice, s);
  }
  const byCodEnte = new Map(enti.map((e) => [e.codice, e]));
  const doveRighe = [...perStruttura.values()]
    .filter((s) => s.comune)
    .map((s) => {
      const ente = byCodEnte.get(s.codice) || byCodEnte.get(`${s.codiceRegione}${s.codiceAsl}`);
      return {
        comune: s.comune || '',
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

  // 6+7) Глосар/FAQ + гражданско ръководство + „a chi segnalare"
  await writeFile(join(SITE_DIR, 'glossario.html'), renderGlossario());
  await writeFile(join(SITE_DIR, 'guida-verifica.html'), renderGuida());
  await writeFile(join(SITE_DIR, 'segnalare.html'), renderSegnalare());

  // Pagella — 5-те спии на всяка структура, на една страница
  await writeFile(
    join(SITE_DIR, 'pagella.html'),
    renderPagella({ righe: righePagella, href, jsonld: articleLd('La pagella delle strutture: tutte le spie in un colpo d’occhio', 'Cinque indicatori per ogni azienda sanitaria italiana, con soglie dichiarate. Indicatori da verificare, non accuse.', 'pagella.html') })
  );

  // 11) PNRR по региони (от ANAC флага, ако има appalti)
  if (appalti) {
    const pnrrRighe = Object.entries(REGIONI)
      .map(([key, meta]) => {
        const appReg = mergeAppRows(/** @type {import('./lib/models.js').RegionaleRow[]} */ (meta.anac.map((n) => appRegByName.get(n)).filter(Boolean)));
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
    await writeFile(join(SITE_DIR, 'mobilita.html'), renderMobilita({ mob, regKeyByNome: (/** @type {string} */ n) => nome2key.get(n) || null }));
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
    /** @type {Record<string, number>} */
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
    /** @param {string|number} d */
    const rfc = (d) => new Date(d).toUTCString();
    const buildDate = rfc(segn.generatoIl || Date.now());
    /** @param {string} t @param {string} link @param {string} desc @param {string} date */
    const item = (t, link, desc, date) =>
      `<item><title>${esc(t)}</title><link>${esc(link)}</link><guid>${esc(link)}</guid><pubDate>${date}</pubDate><description>${esc(desc)}</description></item>`;
    const globItems = STORIE.map((st) => item(st.titolo, `${su0}/storia/${st.slug}.html`, st.sommario, buildDate)).join('\n');
    /** @param {string} title @param {string} link @param {string} items */
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
      'segnalare.html',
      'pagella.html',
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
    /** @param {string} p */
    const prio = (p) => (p === 'index.html' ? '1.0' : p.includes('/') ? '0.6' : '0.8');
    // lastmod = датата на снапшота на ДАННИТЕ (не на билда) — иначе всеки билд
    // „подновява" 4400 адреса и lastmod губи доверие (SEO одит)
    const lastmod = (validaz && validaz.generatoIl ? validaz.generatoIl : new Date().toISOString()).slice(0, 10);
    void oggi;
    const urls = paths
      // home → каноничен корен `/` (не `/index.html`) — иначе sitemap се разминава с canonical.
      .map((p) => `<url><loc>${esc(`${su}/${p === 'index.html' ? '' : p}`)}</loc><lastmod>${lastmod}</lastmod><priority>${prio(p)}</priority></url>`)
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
    // IndexNow ключов файл (за верификация от Bing/Yandex при push на нови URL-и).
    // Съдържанието Е самият ключ; сервира се на https://<host>/<key>.txt.
    if (config.indexNowKey && /^[a-f0-9]{8,128}$/i.test(config.indexNowKey)) {
      await writeFile(join(SITE_DIR, `${config.indexNowKey}.txt`), `${config.indexNowKey}\n`);
    }
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
  for (const f of ['favicon.ico', 'favicon-32.png', 'favicon-16.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) {
    await copyFile(pjoin(ROOT, 'assets', f), join(SITE_DIR, f)).catch(() => {});
  }
  // Web App Manifest (икона на началния екран + theme/name). Реферира съществуващите
  // икони с реалните им размери; за пълен maskable 192/512 набор трябва квадратен мастер.
  await writeFile(
    join(SITE_DIR, 'site.webmanifest'),
    JSON.stringify({
      name: 'Ospedali Trasparenti',
      short_name: 'Ospedali Trasparenti',
      description: 'I conti e gli appalti della sanità pubblica italiana, da open data ufficiali.',
      lang: 'it',
      start_url: '/',
      display: 'standalone',
      theme_color: '#0d131a',
      background_color: '#f3f5f8',
      icons: [
        { src: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
        { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    }, null, 2) + '\n'
  );

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

main().catch((err) => {
  console.error('Грешка:', err);
  process.exitCode = 1;
});
