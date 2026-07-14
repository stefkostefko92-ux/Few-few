// Правни/справочни страници на сайта: „Dati e verifiche", „Dati aperti" (hub),
// „Note legali" и „Privacy". Изнесени дословно от build-site.js — само местене.

import { esc, numeroIt, percentualeIt } from '../lib/format.js';
import { page, kpi, siteUrl } from '../lib/site-ui.js';

// ---------- DATI E VERIFICHE ----------
export function renderVerifiche({ validaz, appMatch }) {
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

// ---------- DATI APERTI (hub) ----------
function formatBytes(b) {
  if (b == null) return '—';
  if (b >= 1024 * 1024) return `${numeroIt(Math.round((b / (1024 * 1024)) * 10) / 10)} MB`;
  if (b >= 1024) return `${numeroIt(Math.round(b / 1024))} KB`;
  return `${numeroIt(b)} B`;
}
export function renderDati({ datasets, generatoIl }) {
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
export function renderNoteLegali({ titolare = {} } = {}) {
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

export function renderPrivacy({ titolare = {}, hosting = {} } = {}) {
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
