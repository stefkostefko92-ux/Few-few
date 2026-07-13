// Генерира статичен сайт на италиански от финансовите данни и сигналите:
//  site/index.html          — начало: национални KPI + топ сигнали
//  site/strutture.html      — всички структури с филтър/търсене (vanilla JS)
//  site/segnalazioni.html   — всички сигнали с филтри
//  site/metodologia.html    — метод, източници, disclaimer
//  site/struttura/<cod>.html — детайл за структура (SVG графики + финанси + сигнали)
// Нула зависимости, нула външни ресурси.

import { join } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { SITE_DIR } from './lib/paths.js';
import { loadDataset, tipoEnte, anniConCe, CE_INDICATORS, SP_INDICATORS, CE_FORENSICS } from './lib/dataset.js';
import { readJson } from './lib/http.js';
import { SEGNALAZIONI_FILE, DATA_DIR } from './lib/paths.js';
import { join as pjoin } from 'node:path';
import { matchAutoritaEnti } from './lib/match.js';
import { euroIt, euroCompact, numeroIt, percentualeIt, slugify, esc } from './lib/format.js';
import { page, kpi, badge, lineChart, barChart, hbars } from './lib/site-ui.js';

const FORENSICS_FILE = pjoin(DATA_DIR, 'forensics.json');
const APPALTI_FILE = pjoin(DATA_DIR, 'appalti.json');
const AGGIU_FILE = pjoin(DATA_DIR, 'aggiudicatari.json');

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

function ultimoCe(ente) {
  const anni = anniConCe(ente);
  return anni.length ? { anno: anni.at(-1), y: ente.serie.get(anni.at(-1)) } : { anno: null, y: {} };
}

async function main() {
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

  await rm(SITE_DIR, { recursive: true, force: true });
  await mkdir(join(SITE_DIR, 'struttura'), { recursive: true });

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
  await writeFile(join(SITE_DIR, 'inchiesta.html'), renderInchiesta({ forense, appalti, appMatch, href }));
  await writeFile(join(SITE_DIR, 'classifiche.html'), renderClassifiche({ forense, href }));
  if (appalti) await writeFile(join(SITE_DIR, 'appalti.html'), renderAppalti({ appalti, appByCod, appMatch, enti, href }));
  await writeFile(join(SITE_DIR, 'strutture.html'), renderStrutture({ enti, ultimoAnnoCe, href, segnByCod, ultimoCe }));
  await writeFile(join(SITE_DIR, 'segnalazioni.html'), renderSegnalazioni({ segn, href }));
  await writeFile(join(SITE_DIR, 'metodologia.html'), renderMetodologia({ segn, forense, appalti, appMatch, ultimoAnnoCe }));

  for (const ente of enti) {
    const fileCod = `${ente.codice}-${slugByCod.get(ente.codice)}`;
    await writeFile(
      join(SITE_DIR, 'struttura', `${fileCod}.html`),
      renderStruttura({ ente, struttureByCod, anagrafica, seg: segnByCod.get(ente.codice), forse: forByCod.get(ente.codice), app: appByCod.get(ente.codice), appMatch, ultimoAnnoCe })
    );
  }
  console.log(`Готово: ${enti.length + (appalti ? 7 : 6)} страници → ${SITE_DIR}`);
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
  <thead><tr><th>Struttura</th><th>Gravità</th><th class="num">Segn.</th><th>Prima segnalazione</th></tr></thead>
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
  return page({
    title: 'Ospedali Trasparenti — i conti degli ospedali pubblici italiani',
    description: 'Entrate e spese delle strutture sanitarie pubbliche italiane, con segnalazione automatica delle anomalie contabili. Dati open data RGS/MEF e Ministero della Salute.',
    active: 'index.html',
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
  <thead><tr><th>Struttura</th><th class="num">Valore produzione</th><th class="num">Risultato</th><th>Segnalazioni</th></tr></thead>
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
  <thead><tr><th>Regola</th><th>Gravità</th><th>Quando scatta</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>

<h2>L’inchiesta «follow the money»</h2>
<p>Oltre alle segnalazioni contabili, analizziamo il <strong>dettaglio dei costi</strong> (modello CE, sezione B) per
le voci più esposte a inefficienza e opacità: acquisti di beni, acquisti di servizi, consulenze e lavoro interinale,
servizi non sanitari (pulizia, mensa, riscaldamento, rifiuti), manutenzioni esternalizzate, godimento di beni di terzi
(affitti/noleggi) e acquisto di prestazioni sanitarie da privati.</p>
<ul class="small">
  <li>Ogni voce è <strong>normalizzata</strong> come quota dei costi della produzione e, dove disponibile, per posto letto (anagrafe del Ministero della Salute).</li>
  <li>Ogni struttura è confrontata con la <strong>distribuzione nazionale</strong> (mediana, 90° percentile, z-score robusto su mediana e MAD).</li>
  <li>Scatta un segnale se la voce supera il 90° percentile con z&gt;2 <em>e</em> l’importo è materiale (≥ 1 mln €), o se raddoppia da un anno all’altro (+60% e &gt; 2 mln €).</li>
  <li>Il «rosso» di sistema è ricostruito sommando il risultato delle aziende e quello della Gestione Sanitaria Accentrata regionale (GSA, codice 000), che copre gran parte dei disavanzi.</li>
</ul>
${appalti ? `<h3>Gli appalti (ANAC)</h3>
<p>Incrociamo i bilanci con la <strong>Banca Dati Nazionale dei Contratti Pubblici</strong> (ANAC), gare sopra
40.000 € pubblicate negli anni ${appalti.anni.join('–')}. Isoliamo gli enti sanitari e calcoliamo la
<strong>quota di valore affidata senza gara</strong> (affidamento diretto + negoziata senza pubblicazione),
escludendo gli acquisti in adesione ad accordi quadro/convenzioni, già messi a gara a monte.</p>
<ul class="small">
  <li>Confronto tra regioni sempre disponibile (chiave: sezione regionale ANAC).</li>
  <li>Collegamento al singolo bilancio solo con corrispondenza <strong>esatta e non ambigua</strong> di
  denominazione e regione: ${appMatch ? `${appMatch.abbinate} aziende su ${appMatch.totali}` : 'una parte'} abbinate,
  per evitare attribuzioni errate. Per le altre restano i dati regionali.</li>
  <li>Un’alta quota senza gara non prova un illecito: sotto soglia è legittima. Segnala dove guardare.</li>
</ul>
<p class="small muted">Prossimo passo: incrocio con gli aggiudicatari (fornitori) per individuare vincitori
ricorrenti e gare a offerta unica.</p>` : `<p class="small muted">Prossimo passo possibile: incrocio con gli appalti
pubblici (ANAC) per risalire ai singoli contratti, ai fornitori e alle gare a offerta unica.</p>`}

<h2>Limiti</h2>
<ul class="small">
  <li>I dati sono di cassa/competenza da consuntivo: variazioni di perimetro possono generare falsi positivi.</li>
  <li>Le soglie sono volutamente prudenti per ridurre il rumore; alcune anomalie reali possono non emergere.</li>
  <li>Un’anomalia di spesa <strong>non è prova di illecito</strong>: indica dove conviene approfondire.</li>
  <li>Il progetto è a scopo di trasparenza civica e non sostituisce le fonti ufficiali né la Corte dei conti.</li>
</ul>
<p class="small muted">Elaborazione automatica open source di Carbon Stealth VCC.</p>
`;
  return page({
    title: 'Metodologia — Ospedali Trasparenti',
    description: 'Fonti ufficiali e regole di segnalazione automatica delle anomalie contabili degli ospedali pubblici italiani.',
    active: 'metodologia.html',
    body,
  });
}

// ---------- DETTAGLIO STRUTTURA ----------
function renderStruttura({ ente, struttureByCod, anagrafica, seg, forse, app, appMatch, ultimoAnnoCe }) {
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

  // Оперативен профил
  const own = struttureByCod.get(ente.codice);
  const presidi = anagrafica.strutture.filter(
    (s) => s.codiceRegione === ente.codReg && s.codiceAsl === ente.codEnte && s.codice !== ente.codice
  );
  const opRows = own ? [own] : presidi;
  const opTable = opRows.length
    ? `<h2>Profilo operativo <span class="small muted">(anagrafe ospedaliera, ${opRows[0].anno})</span></h2>
       <div class="tablewrap"><table>
       <thead><tr><th>Ospedale</th><th class="num">Posti letto</th><th class="num">Personale</th><th class="num">di cui medici</th><th class="num">Ricoveri</th><th class="num">Giornate</th></tr></thead>
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
    <thead><tr><th>Anno</th>${indicators.map((i) => `<th class="num">${esc(i.label)}</th>`).join('')}</tr></thead>
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
    soldiBlock = `<h2>Dove vanno i soldi <span class="small muted">(${forse.anno}, quota dei costi della produzione)</span></h2>
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
       <div class="tablewrap"><table><thead><tr><th>Voce</th><th class="num">Importo</th></tr></thead><tbody>${ceRows}</tbody></table></div>`
    : '';

  const spRows = ente.spUltimo
    .filter((v) => isTopLevelSp(v.desc) && v.importo !== 0)
    .map((v) => `<tr><td>${esc(v.desc)}</td><td class="num">${euroIt(v.importo)}</td></tr>`)
    .join('');
  const spBlock = spRows
    ? `<h2>Stato patrimoniale <span class="small muted">(${ente.spUltimoAnno})</span></h2>
       <div class="tablewrap"><table><thead><tr><th>Voce</th><th class="num">Importo</th></tr></thead><tbody>${spRows}</tbody></table></div>`
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
${segBlock}

<h2>Andamento economico</h2>
<div class="grid" style="grid-template-columns:1fr">
  <div class="card">${chartCR}</div>
  <div class="card">${chartRis}</div>
</div>

${soldiBlock}
${appaltiBlock(app, appMatch)}
${opTable}
${finTable}
${ceBlock}
${spBlock}

<p class="small muted" style="margin-top:26px">Fonte: <a href="https://openbdap.rgs.mef.gov.it/it/SSN/Analizza">BDAP — RGS/MEF</a>
(modelli CE/SP del SSN) e <a href="https://www.dati.salute.gov.it/">dati.salute.gov.it</a>. Importi in euro dai consuntivi.</p>
`;
  return page({
    title: `${ente.denominazione} — Ospedali Trasparenti`,
    description: `Bilancio, entrate, spese e segnalazioni contabili di ${ente.denominazione} (${ente.regione}).`,
    active: 'strutture.html',
    rel: '../',
    body,
  });
}

const FOR_LABEL = Object.fromEntries(CE_FORENSICS.map((c) => [c.key, c.label]));

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
  const anniTxt = appalti.anni.join('–');

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
  ${kpi(`Contratti senza gara (${anniTxt})`, percentualeIt(nz.quotaSenzaGaraNum), (nz.quotaSenzaGaraNum || 0) > 0.4 ? 'neg' : '')}
  ${kpi('Senza gara sul valore', percentualeIt(nz.quotaSenzaGara), (nz.quotaSenzaGara || 0) > 0.4 ? 'neg' : '')}
  ${kpi('Valore appalti sanità', euroCompact(nz.importo))}
  ${kpi('Contratti (lotti)', numeroIt(nz.n))}
</div>

<div class="note" style="margin-top:18px"><strong>Cosa significa «senza gara».</strong> L’affidamento diretto e la
procedura negoziata senza pubblicazione assegnano il contratto <em>senza confronto competitivo</em>. Sotto certe soglie
è legittimo e più rapido, ma un ricorso sistematico è la spia classica di inefficienza o favoritismi. Gli acquisti in
adesione ad accordi quadro/convenzioni (es. Consip/centrali regionali) sono invece già stati messi a gara e non contano
come «senza gara».</p></div>

<h2>Le regioni a confronto</h2>
<p class="muted small">Ordinate per quota di contratti affidati senza gara. «Senza gara %» sul numero di contratti,
«sul valore» sugli importi.</p>
<div class="tablewrap"><table>
  <thead><tr><th>Regione</th><th class="num">Valore appalti</th><th class="num">Senza gara %</th><th class="num">sul valore</th><th class="num">Contratti</th></tr></thead>
  <tbody>${regRows}</tbody>
</table></div>

<h2>Le aziende con più appalti senza gara</h2>
<p class="muted small">Solo enti con almeno 20 mln € e 100 contratti nel periodo, per quota sul numero di contratti.
I nomi collegati hanno una scheda.</p>
<div class="tablewrap"><table>
  <thead><tr><th>Azienda</th><th class="num">Senza gara %</th><th class="num">sul valore</th><th class="num">Valore appalti</th></tr></thead>
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
  return `<h2>Gare con un solo offerente</h2>
<p class="muted small">Quota delle gare (con dati sui partecipanti) in cui si è presentata <strong>una sola impresa</strong>.
Solo enti con almeno 50 gare. Concorrenza solo formale è una spia classica di gare “su misura”.</p>
<div class="tablewrap"><table>
  <thead><tr><th>Azienda</th><th class="num">Offerente unico</th><th class="num">Gare</th></tr></thead>
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
  return `<h2>Chi prende i soldi: i maggiori fornitori</h2>
<p class="muted small">Operatori economici con più valore aggiudicato dalle aziende sanitarie (2023–2024).
Valore attribuito una volta per contratto all’aggiudicatario principale.</p>
<div class="tablewrap"><table>
  <thead><tr><th>#</th><th>Fornitore</th><th class="num">Valore aggiudicato</th><th class="num">Contratti</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>`;
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
  const flagSg = sgNum != null && med != null && sgNum > Math.max(0.65, med * 1.4);
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
      ${flagSb ? `<div class="seg alta" style="margin-top:12px"><div class="t"><span class="badge alta">!</span> <span>Gare con un solo offerente</span></div><div class="d">Il ${percentualeIt(sbQ)} delle gare con partecipanti (${numeroIt(ag.gareUnicoOfferente)}/${numeroIt(ag.gareConPartecipanti)}) ha ricevuto una sola offerta: possibile concorrenza solo formale.</div></div>` : ''}
      ${flagConc ? `<div class="seg alta" style="margin-top:12px"><div class="t"><span class="badge alta">!</span> <span>Forte concentrazione su un fornitore</span></div><div class="d">Il ${percentualeIt(concQ)} del valore aggiudicato va a un solo operatore (${esc(ag.topFornitori[0].den)}).</div></div>` : ''}
      ${fornRows ? `<h3>Principali fornitori</h3><div class="tablewrap"><table><thead><tr><th>Fornitore</th><th class="num">Valore aggiudicato</th><th class="num">Contratti</th></tr></thead><tbody>${fornRows}</tbody></table></div>` : ''}`
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
    ${top ? `<h3>Contratti più grandi</h3><div class="tablewrap"><table><thead><tr><th>Oggetto</th><th>Procedura</th><th class="num">Importo</th></tr></thead><tbody>${top}</tbody></table></div>` : ''}
    <p class="small muted">Fonte: <a href="https://dati.anticorruzione.it/opendata">ANAC</a> (CIG, aggiudicatari, partecipanti), gare > 40.000 € pubblicate negli anni considerati.</p>`;
}

// ---------- INCHIESTA ----------
function renderInchiesta({ forense, appalti, appMatch, href }) {
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
  <thead><tr><th>Anno</th><th class="num">In perdita</th><th class="num">Rosso aziende</th><th class="num">Copertura GSA</th><th class="num">Sistema</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<p class="small muted">Il ${ultimo} è l’anno peggiore della serie: il disavanzo di sistema tocca ${euroCompact(s.risultatoSistema)}.
Il problema quindi non è «ogni ospedale ruba», ma <em>dove</em> si concentra la spesa e <em>perché</em> alcune strutture
si discostano nettamente dalle altre.</p>

<h2>Le strutture con più anomalie di spesa</h2>
<p class="muted small">Ordinate per numero di segnali «follow the money». Ogni segnale confronta una voce con la mediana
nazionale. <a href="classifiche.html">Vedi le classifiche per categoria →</a></p>
${flagCards}

${appalti ? `<h2>Segui gli appalti</h2>
<p class="muted small">Abbiamo incrociato i bilanci con la banca dati ANAC degli appalti pubblici (${appalti.anni.join('–')}).
A livello nazionale <strong>${percentualeIt(appalti.nazionale.quotaSenzaGaraNum)} dei contratti</strong> sanitari
(il ${percentualeIt(appalti.nazionale.quotaSenzaGara)} del valore) è affidato <strong>senza gara</strong>
— affidamento diretto o negoziata senza bando.
→ <a href="appalti.html">Il confronto tra regioni e le aziende con più appalti senza gara</a></p>` : ''}

<div class="note" style="margin-top:22px"><strong>Attenzione.</strong> Un’anomalia di spesa non è una prova di illecito.
Consulenze elevate, molte prestazioni comprate dai privati o affitti ingenti possono avere ragioni legittime.
Sono <em>piste</em>, quelle che la Corte dei conti e l’ANAC seguono per prime — non verdetti.</div>
`;
  return page({
    title: 'Inchiesta: dove vanno i soldi — Ospedali Trasparenti',
    description: 'La verità sul disavanzo degli ospedali pubblici italiani e le anomalie di spesa: consulenze, prestazioni da privati, affitti. Analisi sui dati ufficiali.',
    active: 'inchiesta.html',
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
  <thead><tr><th>#</th><th>Struttura</th><th class="num">${esc(extraHead)}</th><th class="num">Importo</th></tr></thead>
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
