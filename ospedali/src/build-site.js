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
import { loadDataset, tipoEnte, postiLettoEnte, ricoveriEnte, CE_INDICATORS, SP_INDICATORS, CE_FORENSICS } from './lib/dataset.js';
import { readJson } from './lib/http.js';
import { SEGNALAZIONI_FILE, DATA_DIR } from './lib/paths.js';
import { join as pjoin } from 'node:path';
import { matchAutoritaEnti } from './lib/match.js';
import { euroIt, euroCompact, numeroIt, percentualeIt, slugify, esc } from './lib/format.js';
import { page, kpi, badge, lineChart, barChart, hbars, setSiteUrl, siteUrl } from './lib/site-ui.js';
import {
  pIvaValida, REGOLE_LABEL, REGIONI, REG_KEY, ultimoCe, setDataSnapshot,
  rangeAnni, pagLd, briciole, FOR_LABEL, isDetailLine, isTopLevelSp,
} from './lib/site-shared.js';
import { renderVerifiche, renderDati, renderNoteLegali, renderPrivacy } from './render/legal.js';
import { renderFornitore, renderFornitoriIndex, renderCerca } from './render/fornitori.js';
import { mergeAppRows, renderRegioniIndex, renderRegione } from './render/regioni.js';
import { renderAppalti, appaltiBlock, contrattiBlock, contrattiCsv } from './render/appalti.js';
import { renderConflitti, renderInchiesta, renderClassifiche } from './render/inchiesta.js';
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
  setDataSnapshot(validaz && validaz.generatoIl ? validaz.generatoIl.slice(0, 10) : '');
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

main().catch((err) => {
  console.error('Грешка:', err);
  process.exitCode = 1;
});
