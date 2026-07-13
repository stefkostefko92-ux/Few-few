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
import { loadDataset, tipoEnte, anniConCe, CE_INDICATORS, SP_INDICATORS } from './lib/dataset.js';
import { readJson } from './lib/http.js';
import { SEGNALAZIONI_FILE } from './lib/paths.js';
import { euroIt, euroCompact, numeroIt, percentualeIt, slugify, esc } from './lib/format.js';
import { page, kpi, badge, lineChart, barChart } from './lib/site-ui.js';

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

  await writeFile(join(SITE_DIR, 'index.html'), renderHome({ enti, segn, ultimoAnnoCe, totRicavi, totCosti, totRisultato, inPerdita, conDati, href, segnByCod }));
  await writeFile(join(SITE_DIR, 'strutture.html'), renderStrutture({ enti, ultimoAnnoCe, href, segnByCod, ultimoCe }));
  await writeFile(join(SITE_DIR, 'segnalazioni.html'), renderSegnalazioni({ segn, href }));
  await writeFile(join(SITE_DIR, 'metodologia.html'), renderMetodologia({ segn, ultimoAnnoCe }));

  for (const ente of enti) {
    const fileCod = `${ente.codice}-${slugByCod.get(ente.codice)}`;
    await writeFile(
      join(SITE_DIR, 'struttura', `${fileCod}.html`),
      renderStruttura({ ente, struttureByCod, anagrafica, seg: segnByCod.get(ente.codice), ultimoAnnoCe })
    );
  }
  console.log(`Готово: ${enti.length + 4} страници → ${SITE_DIR}`);
}

// ---------- HOME ----------
function renderHome({ enti, segn, ultimoAnnoCe, totRicavi, totCosti, totRisultato, inPerdita, conDati, href, segnByCod }) {
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
function renderMetodologia({ segn, ultimoAnnoCe }) {
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

<h2>Limiti</h2>
<ul class="small">
  <li>I dati sono di cassa/competenza da consuntivo: variazioni di perimetro possono generare falsi positivi.</li>
  <li>Le soglie sono volutamente prudenti per ridurre il rumore; alcune anomalie reali possono non emergere.</li>
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
function renderStruttura({ ente, struttureByCod, anagrafica, seg, ultimoAnnoCe }) {
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
