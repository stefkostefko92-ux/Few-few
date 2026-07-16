// @ts-check
// Разследващите страници: „Relazioni ricorrenti" (индикатори за конфликт на
// интереси), „Inchiesta" (deficit на системата) и „Classifiche" (follow the
// money). Изнесени дословно от build-site.js — само местене.

import { esc, euroCompact, percentualeIt, numeroIt, euroIt } from '../lib/format.js';
import { page, kpi, lineChart } from '../lib/site-ui.js';
import { rigaAggiornamento, rangeAnni, articleLd } from '../lib/site-shared.js';

/** @typedef {import('../lib/models.js').CoiData} CoiData */
/** @typedef {import('../lib/models.js').ForenseData} ForenseData */
/** @typedef {import('../lib/models.js').ForenseSistemaAnno} ForenseSistemaAnno */
/** @typedef {import('../lib/models.js').AppaltiData} AppaltiData */
/** @typedef {import('../lib/models.js').AppMatch} AppMatch */
/** @typedef {import('../lib/models.js').ClassificaRow} ClassificaRow */

// ---------- RELAZIONI RICORRENTI (индикатори „конфликт на интереси") ----------
// Периметърът (брой болници с опис) идва от данните — не се хардкодва.
/**
 * @param {number} perimetro
 * @returns {Record<string, [string, string]>}
 */
const coiFlagLabel = (perimetro) => ({
  rotazione: ['Rotazione', 'Affidamenti diretti ripetuti allo stesso fornitore: per gli affidamenti sotto soglia il principio di rotazione (art. 49, d.lgs. 36/2023) li limita espressamente.'],
  dipendenza: ['Dipendenza', `Il fornitore incassa quasi tutto il suo fatturato tracciato (nel perimetro delle ${perimetro} aziende collegate) da una sola azienda, con rapporti prevalentemente senza gara.`],
  esclusiva: ['Esclusiva', 'Relazione stabile senza concorrenza: molti contratti, quasi tutti senza gara.'],
});

/**
 * @param {{ coi: CoiData, href: (cod: string) => string }} p
 * @returns {string}
 */
export function renderConflitti({ coi, href }) {
  const MAX_RIGHE = 200;
  const st = coi.statistiche;
  const perimetro = coi.perimetroAziende || Object.keys(coi.coppie.reduce((/** @type {Record<string, number>} */ a, p) => ((a[p.codice] = 1), a), {})).length;
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

// ---------- INCHIESTA ----------
/**
 * @param {object} p
 * @param {ForenseData} p.forense
 * @param {AppaltiData|null} p.appalti
 * @param {AppMatch|null} p.appMatch
 * @param {(cod: string) => string} p.href
 * @param {boolean} p.conCordate
 * @param {boolean} p.conSegGare
 * @returns {string}
 */
export function renderInchiesta({ forense, appalti, appMatch, href, conCordate, conSegGare }) {
  const anni = Object.keys(forense.sistema.perAnno).map(Number).sort((a, b) => a - b);
  /** @param {keyof ForenseSistemaAnno} k */
  const S = (k) => anni.map((a) => [a, forense.sistema.perAnno[a][k]]);
  const chart = lineChart(
    [
      { label: 'Aziende (AO/ASL)', color: 'var(--neg)', points: S('risultatoAziende') },
      { label: 'Copertura regionale (GSA)', color: 'var(--pos)', points: S('risultatoGSA') },
      { label: 'Sistema (aziende + GSA)', color: 'var(--brand)', points: S('risultatoSistema') },
    ],
    { caption: 'Risultato d’esercizio aggregato per anno (€): il rosso delle aziende è in gran parte coperto dalla GSA regionale' }
  );
  const ultimo = anni[anni.length - 1];
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

<p style="margin-top:18px"><a class="chip" href="pagella.html">La pagella: tutte le spie, struttura per struttura →</a>
<a class="chip" href="segnalare.html">Hai trovato qualcosa? A chi segnalarlo →</a></p>

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
/**
 * @param {{ forense: ForenseData, href: (cod: string) => string }} p
 * @returns {string}
 */
export function renderClassifiche({ forense, href }) {
  const C = forense.classifiche;
  /** @param {string} cod */
  const codToHref = (cod) => href(cod);
  /**
   * @param {string} titolo
   * @param {string} descr
   * @param {ClassificaRow[]} list
   * @param {(x: ClassificaRow) => string} valFmt
   * @param {(x: ClassificaRow) => string} extraFmt
   * @param {string} extraHead
   * @returns {string}
   */
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
