// @ts-check
// Профили и индекс на изпълнителите („segui il fornitore") + глобалната търсачка
// през всички договори. Изнесени дословно от build-site.js — само местене.

import { esc, euroCompact, numeroIt, percentualeIt } from '../lib/format.js';
import { page, kpi, siteUrl } from '../lib/site-ui.js';
import { briciole } from '../lib/site-shared.js';

/** @typedef {import('../lib/models.js').AppMatch} AppMatch */
/** @typedef {import('../lib/models.js').CoiCoppia} CoiCoppia */

/**
 * @typedef {object} FornitoreTop топ договор в профила на изпълнителя
 * @property {string} [cig]
 * @property {string} codice
 * @property {string} [data]
 * @property {string} [oggetto]
 * @property {number} importo
 * @property {string} [categoria]
 */
/**
 * @typedef {object} FornitoreProfile профил на изпълнител (build-site fornAgg)
 * @property {string} cf
 * @property {string} den
 * @property {number} valore
 * @property {number} n
 * @property {number} senzaGara
 * @property {Map<string, { valore: number, n: number }>} perOsp
 * @property {FornitoreTop[]} top
 */
/** @typedef {Record<string, [string, string]>} AziendeIdx */

/**
 * Национална класация на изпълнителите (кой прибира парите).
 * @param {AppMatch|null} appMatch
 * @returns {string}
 */
export function renderFornitori(appMatch) {
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
/**
 * @param {object} p
 * @param {FornitoreProfile} p.f
 * @param {AziendeIdx} p.aziendeIdx
 * @param {boolean} [p.societa]
 * @param {CoiCoppia[]} [p.coppie]
 * @param {(cod: string) => string} p.strutturaHref
 * @returns {string}
 */
export function renderFornitore({ f, aziendeIdx, societa = true, coppie = [], strutturaHref }) {
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

/**
 * @param {{ righe: Array<[string, string, number, number, number, number]>, totali: number }} p
 * @returns {string}
 */
export function renderFornitoriIndex({ righe, totali }) {
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
/**
 * @param {{ n: number, aziende: number }} p
 * @returns {string}
 */
export function renderCerca({ n, aziende }) {
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
