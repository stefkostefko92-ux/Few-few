// „Approfondimenti" — съдържателният слой на сайта: тенденции 2012–2024,
// топ договори, разходни категории (CPV), „намери своята ASL", глосар+FAQ,
// гражданско ръководство за проверка, PNRR, разкази и дневник на промените.
// Само render функции + чисти помощници (тестваеми) — данните идват от
// build-site.js. Никакви нови твърдения: всичко е от вече публикуваните данни,
// с рамката „indicatore, non prova".

import { page, kpi, lineChart, hbars } from './lib/site-ui.js';
import { euroIt, euroCompact, numeroIt, percentualeIt, esc } from './lib/format.js';

// ---------- Класификация на CPV описания в макрокатегории ----------
// Евристика по ключови думи върху descrizione_cpv (ANAC). Ред = приоритет.
const CPV_REGOLE = [
  ['farmaci', /MEDICINAL|FARMAC|VACCIN|EMODERIVAT|SOLUZIONI PER INFUSION/i],
  ['dispositivi', /DISPOSITIVI|PROTESI|IMPIANT|CATETER|SIRINGHE|SUTURA|STENT|DEFIBRILLATOR|PACEMAKER|MEDICAZION|GUANTI|REAGENT|DIAGNOSTIC/i],
  ['apparecchiature', /APPARECCHIATURE|APPARECCHI|TOMOGRAF|RISONANZA|ECOGRAF|RADIOLOG|SCANNER|MAMMOGRAF|ACCELERATOR|MICROSCOP|STERILIZZATRICI|LETTI OSPEDALIERI/i],
  ['informatica', /INFORMATIC|SOFTWARE|HARDWARE|SISTEMI DI RETE|ELABORATOR|TELECOMUNICAZ|TELEFON|LOCALIZZAZIONE E CONTROLLO/i],
  ['pulizia', /PULIZIA|IGIENE|DISINFESTAZ|DERATTIZZAZ|SANIFICAZ|LAVANDERIA|LAVAGGIO/i],
  ['ristorazione', /RISTORAZION|MENSA|PASTI|ALIMENT|DERRATE|CATERING/i],
  ['vigilanza', /VIGILANZA|SICUREZZA|GUARDIAN|PORTIERATO|RECEPTION/i],
  ['costruzioni', /COSTRUZION|LAVORI DI|EDILI|RISTRUTTURAZ|IMPIANTI ELETTRICI|IMPIANTI IDRAULIC|OPERE DI/i],
  ['energia', /ENERGIA|ELETTRICITA|GAS NATURALE|COMBUSTIBIL|RISCALDAMENTO|CLIMATIZZAZ/i],
  ['manutenzione', /MANUTENZION|RIPARAZION|ASSISTENZA TECNICA/i],
  ['trasporti', /TRASPORT|AMBULANZ|NOLEGGIO.*VEICOL|VEICOL|AUTOMEZZI|ELISOCCORSO/i],
  ['lavoro', /SOMMINISTRAZIONE DI (PERSONALE|LAVORO)|LAVORO TEMPORANEO|INTERINAL|RICERCA (DI )?PERSONALE/i],
  ['sociosanitari', /SERVIZI (SOCIO[- ]?SANITARI|SANITARI|DI ASSISTENZA|OSPEDALIERI|MEDICI|INFERMIERISTIC|RIABILITAZ|DIALISI|LABORATORIO)/i],
  ['consulenze', /CONSULENZ|SERVIZI LEGALI|CONTABIL|REVISIONE|FORMAZION|STUDI E RICERCHE/i],
  ['logistica', /MAGAZZINO|LOGISTIC|FACCHINAGGIO|ARCHIVIAZ|SPEDIZION/i],
  ['rifiuti', /RIFIUTI|SMALTIMENTO/i],
  ['assicurazioni', /ASSICURATIV|ASSICURAZION|BROKERAGGIO|SERVIZI FINANZIARI|TESORERIA/i],
];
export const CPV_LABELS = {
  farmaci: 'Farmaci ed emoderivati',
  dispositivi: 'Dispositivi medici e diagnostica',
  apparecchiature: 'Apparecchiature biomedicali',
  informatica: 'Informatica e telecomunicazioni',
  pulizia: 'Pulizia, sanificazione e lavanderia',
  ristorazione: 'Ristorazione e derrate',
  vigilanza: 'Vigilanza e portierato',
  costruzioni: 'Costruzioni e impianti',
  energia: 'Energia e utenze',
  manutenzione: 'Manutenzioni e assistenza tecnica',
  trasporti: 'Trasporti, ambulanze e veicoli',
  lavoro: 'Somministrazione di personale',
  sociosanitari: 'Servizi sanitari e socio-sanitari esternalizzati',
  consulenze: 'Consulenze, formazione e servizi professionali',
  logistica: 'Logistica e magazzino',
  rifiuti: 'Rifiuti sanitari',
  assicurazioni: 'Assicurazioni e servizi finanziari',
  altro: 'Altro / non classificato',
};
export function classificaCpv(desc) {
  const d = desc || '';
  if (!d.trim()) return 'altro';
  for (const [key, re] of CPV_REGOLE) if (re.test(d)) return key;
  return 'altro';
}

// ---------- 1. Tendenze 2012–2024 ----------
export function renderTendenze({ perAnno, regioniCrescita, ultimoAnnoCe }) {
  const anni = Object.keys(perAnno).map(Number).sort((a, b) => a - b);
  const serie = (k) => anni.map((a) => [a, perAnno[a][k]]).filter(([, v]) => v != null);
  const primo = perAnno[anni[0]];
  const ultimo = perAnno[anni.at(-1)];
  const crescitaCosti = ultimo.costi / primo.costi - 1;
  const crescitaPers = ultimo.personale / primo.personale - 1;
  const quotaPersPrimo = primo.personale / primo.costi;
  const quotaPersUltimo = ultimo.personale / ultimo.costi;
  const regRows = regioniCrescita
    .map(
      (r) => `<tr><td><a href="regione/${r.key}.html">${esc(r.nome)}</a></td>
      <td class="num">${euroCompact(r.prima)}</td><td class="num">${euroCompact(r.dopo)}</td>
      <td class="num ${r.crescita > crescitaCosti ? 'neg' : ''}">${r.crescita >= 0 ? '+' : ''}${percentualeIt(r.crescita)}</td></tr>`
    )
    .join('');
  const body = `
<h1>Il decennio della sanità: 2012–${anni.at(-1)}</h1>
<p class="lead">Tredici anni di conti economici di tutte le aziende del SSN, in quattro curve: quanto entra, quanto
esce, quanto costa il personale e come chiudono i bilanci. Stessa fonte ufficiale (BDAP/MEF), stesso perimetro,
anno per anno.</p>

<div class="grid kpis">
  ${kpi(`Costi ${anni[0]} → ${anni.at(-1)}`, `${euroCompact(primo.costi)} → ${euroCompact(ultimo.costi)}`)}
  ${kpi('Crescita dei costi', `+${percentualeIt(crescitaCosti)}`, 'neg')}
  ${kpi('Crescita del costo del personale', `${crescitaPers >= 0 ? '+' : ''}${percentualeIt(crescitaPers)}`)}
  ${kpi('Peso del personale sui costi', `${percentualeIt(quotaPersPrimo)} → ${percentualeIt(quotaPersUltimo)}`)}
</div>

<h2>Ricavi e costi della produzione</h2>
${lineChart(
    [
      { label: 'Valore della produzione', color: 'var(--brand)', points: serie('valore') },
      { label: 'Costi della produzione', color: 'var(--neg)', points: serie('costi') },
    ],
    { caption: `Somma nazionale, tutte le aziende SSN con bilancio (€ / anno)` }
  )}

<h2>Il costo del personale</h2>
${lineChart([{ label: 'Costo del personale', color: 'var(--amber)', points: serie('personale') }], {
    caption: 'Somma nazionale (€ / anno). Il peso sui costi totali è passato dal ' + percentualeIt(quotaPersPrimo) + ' al ' + percentualeIt(quotaPersUltimo) + '.',
  })}
<div class="note"><strong>Lettura.</strong> Se i costi totali crescono più del personale, la spesa si sposta verso
<em>beni e servizi acquistati fuori</em>: farmaci, dispositivi, servizi esternalizzati — cioè verso i
<a href="appalti.html">contratti pubblici</a> che questo sito traccia. È il motivo per cui seguire gli appalti
è seguire la parte più dinamica della spesa.</div>

<h2>Risultato d’esercizio aggregato</h2>
${lineChart([{ label: 'Risultato d’esercizio (somma aziende)', color: 'var(--pos)', points: serie('risultato') }], {
    caption: 'Somma dei risultati delle sole aziende (senza GSA regionale) — vedi l’inchiesta per il deficit «vero».',
  })}

<h2>Chi è cresciuto di più (costi ${anni[0]} → ${anni.at(-1)})</h2>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Regione</th><th class="num" scope="col">${anni[0]}</th><th class="num" scope="col">${anni.at(-1)}</th><th class="num" scope="col">Crescita</th></tr></thead>
  <tbody>${regRows}</tbody>
</table></div>
<p class="small muted">Somma dei costi della produzione delle aziende della regione. Le variazioni possono riflettere
anche cambi di perimetro (fusioni, riforme regionali): vanno lette come ordine di grandezza, non al centesimo.
Fonte: BDAP — RGS/MEF, modelli CE (consuntivo).</p>
`;
  return page({
    title: `Il decennio della sanità ${anni[0]}–${anni.at(-1)} — tendenze — Ospedali Trasparenti`,
    description: `Come sono cambiati ricavi, costi, personale e risultati delle aziende sanitarie italiane dal ${anni[0]} al ${anni.at(-1)}. Dati ufficiali BDAP/MEF.`,
    active: 'approfondimenti.html',
    canonical: 'tendenze.html',
    body,
  });
}

// ---------- 2. Топ 100 договора ----------
export function renderTopContratti({ top, aziendeIdx, href }) {
  const rows = top
    .map((c, i) => {
      const az = aziendeIdx[c.codice] || ['', ''];
      const sg = c.categoria === 'diretto' || c.categoria === 'negoziataSenza';
      return `<tr><td class="num">${i + 1}</td>
      <td>${esc(c.oggetto || '—')}<div class="small muted">CIG ${esc(c.cig)} · ${esc(c.data)}</div></td>
      <td><a href="${href(c.codice)}">${esc(az[0])}</a><div class="small muted">${esc(az[1])}</div></td>
      <td>${esc(c.fornitore || '—')}</td>
      <td class="small${sg ? ' neg' : ''}">${sg ? 'senza gara' : ''}</td>
      <td class="num">${euroCompact(c.importo)}</td></tr>`;
    })
    .join('');
  const totale = top.reduce((s, c) => s + c.importo, 0);
  const body = `
<h1>I 100 contratti più grandi della sanità</h1>
<p class="lead">I contratti di maggior valore aggiudicati dalle aziende sanitarie collegate nel 2023–2024:
insieme valgono <strong>${euroCompact(totale)}</strong>. Ogni riga è verificabile su ANAC tramite il CIG.</p>
<div class="note">L’importo è il valore <em>messo a gara</em> (non necessariamente speso); i maxi-importi spesso
coprono più anni o interi accordi quadro. «Senza gara» = affidamento diretto o negoziata senza pubblicazione:
per farmaci esclusivi e monopoli tecnici può essere pienamente legittimo. <strong>Indicatori, non prove.</strong></div>
<div class="tablewrap"><table>
  <thead><tr><th class="num" scope="col">#</th><th scope="col">Oggetto</th><th scope="col">Azienda</th><th scope="col">Fornitore</th><th scope="col">Gara</th><th class="num" scope="col">Importo</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<p class="small muted">Fonte: ANAC — Banca Dati Nazionale dei Contratti Pubblici (CC BY 4.0), gare &gt; 40.000 €,
anni 2023–2024, perimetro: le aziende sanitarie collegate. Persone fisiche non nominate.</p>
`;
  return page({
    title: 'I 100 contratti più grandi della sanità — Ospedali Trasparenti',
    description: 'La classifica dei contratti pubblici di maggior valore delle aziende sanitarie italiane 2023–2024, con fornitore, procedura e CIG verificabile.',
    active: 'approfondimenti.html',
    canonical: 'top-contratti.html',
    body,
  });
}

// ---------- 3. Разходни категории (CPV) ----------
export function renderCategorie({ cats, totImporto }) {
  const ordinate = Object.entries(cats)
    .map(([k, v]) => ({ k, ...v, forn: [...v.forn.values()].sort((a, b) => b.importo - a.importo).slice(0, 5) }))
    .sort((a, b) => b.importo - a.importo);
  // „altro" (без CPV описание) не влиза в класацията — казва се отделно
  const classificate = ordinate.filter((c) => c.k !== 'altro');
  const altro = ordinate.find((c) => c.k === 'altro');
  const barre = hbars(
    classificate.slice(0, 12).map((c) => ({ label: CPV_LABELS[c.k], valore: c.importo, quota: totImporto ? c.importo / totImporto : 0, flag: false })),
    { fmt: euroCompact, maxLabel: 'Valore per categoria di spesa' }
  );
  const sezioni = [...classificate, ...(altro ? [altro] : [])]
    .map((c) => {
      const sg = c.n ? c.senzaGara / c.n : 0;
      const fornRows = c.forn
        .map((f) => `<tr><td>${f.cf ? `<a href="fornitore/${esc(f.cf)}.html">${esc(f.den)}</a>` : esc(f.den)}</td><td class="num">${euroCompact(f.importo)}</td></tr>`)
        .join('');
      return `<h3>${esc(CPV_LABELS[c.k])}</h3>
<p class="small muted">${numeroIt(c.n)} contratti · ${euroCompact(c.importo)} · ${percentualeIt(sg)} senza gara (per numero)</p>
${fornRows ? `<div class="tablewrap"><table><thead><tr><th scope="col">Primi fornitori</th><th class="num" scope="col">Valore</th></tr></thead><tbody>${fornRows}</tbody></table></div>` : ''}`;
    })
    .join('\n');
  const body = `
<h1>Dove vanno i soldi: le categorie di spesa</h1>
<p class="lead">Tutti i contratti 2023–2024 delle aziende collegate (${euroCompact(totImporto)}), classificati per
categoria merceologica a partire dalla descrizione CPV: quanto va in farmaci, quanto in pulizie, quanto in energia —
e chi sono i primi fornitori di ciascuna categoria.</p>
${barre}
<div class="note">La classificazione è <strong>automatica</strong> (parole chiave sulla descrizione CPV di ANAC) e
serve per orientarsi: le categorie ufficiali CPV sono più fini.${altro ? ` Altri <strong>${euroCompact(altro.importo)}</strong>
(${numeroIt(altro.n)} contratti) non sono classificabili — descrizione CPV assente o generica — e sono riportati in fondo.` : ''}
«Senza gara» esclude le adesioni a convenzioni riconoscibili. <strong>Essere primo fornitore di una categoria è
legittimo</strong> — indica solo dove guardare.</div>
${sezioni}
<p class="small muted">Fonte: ANAC (CC BY 4.0), elaborazione propria. Persone fisiche non nominate.</p>
`;
  return page({
    title: 'Dove vanno i soldi: categorie di spesa — Ospedali Trasparenti',
    description: 'La spesa contrattuale delle aziende sanitarie per categoria: farmaci, dispositivi, pulizie, energia, informatica — con i primi fornitori di ciascuna.',
    active: 'approfondimenti.html',
    canonical: 'categorie.html',
    body,
  });
}

// ---------- 5. Trova la tua ASL ----------
export function renderDove({ righe }) {
  const rows = righe
    .map(
      (r) => `<tr data-t="${esc(`${r.comune} ${r.provincia} ${r.nome}`.toLowerCase())}">
      <td>${esc(r.comune)} <span class="small muted">(${esc(r.provincia)})</span></td>
      <td>${esc(r.nome)}<div class="small muted">${esc(r.tipo)}</div></td>
      <td>${r.href ? `<a href="${r.href}">${esc(r.ente)}</a>` : esc(r.ente)}</td>
      <td class="num">${r.letti ? numeroIt(r.letti) : '—'}</td></tr>`
    )
    .join('');
  const body = `
<h1>Trova la tua struttura</h1>
<p class="lead">Cerca il tuo comune per trovare gli ospedali e le strutture di ricovero pubbliche del territorio,
e l’azienda sanitaria che ne gestisce i conti — con il link diretto alla scheda finanziaria.</p>
<div class="controls"><input type="search" id="q" placeholder="Comune, provincia o nome della struttura…" aria-label="Cerca comune o struttura" style="flex:1"></div>
<p class="small muted" id="stato"></p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Comune</th><th scope="col">Struttura</th><th scope="col">Azienda (conti)</th><th class="num" scope="col">Posti letto</th></tr></thead>
  <tbody id="rows">${rows}</tbody>
</table></div>
<p class="small muted">Anagrafe: Ministero della Salute (modello HSP, ultimo anno disponibile). I conti delle strutture-presidio
sono nel bilancio della loro ASL. Mostra i primi 400 risultati della ricerca.</p>
<script>
(function(){
  var q=document.getElementById('q'),tb=document.getElementById('rows'),st=document.getElementById('stato'),tmr;
  var all=[].slice.call(tb.querySelectorAll('tr')),MAX=400;
  function a(){var t=q.value.trim().toLowerCase(),n=0;
    all.forEach(function(r){var ok=(!t||r.getAttribute('data-t').indexOf(t)>=0)&&n<MAX;if(!t)ok=n<MAX;r.style.display=ok?'':'none';if(ok)n++;});
    st.textContent=n+' strutture mostrate';}
  q.addEventListener('input',function(){clearTimeout(tmr);tmr=setTimeout(a,150);});a();
})();
</script>
`;
  return page({
    title: 'Trova la tua struttura — Ospedali Trasparenti',
    description: 'Cerca per comune gli ospedali pubblici del tuo territorio e l’azienda sanitaria che ne gestisce i conti.',
    active: 'approfondimenti.html',
    canonical: 'dove.html',
    body,
  });
}

// ---------- 6. Glossario + FAQ ----------
const VOCI_GLOSSARIO = [
  ['Cos’è un affidamento diretto?', `L’affidamento diretto è l’assegnazione di un contratto pubblico a un operatore scelto
dall’amministrazione <strong>senza un confronto competitivo</strong> tra più offerte. Il Codice dei contratti (d.lgs.
36/2023) lo consente sotto determinate soglie (per servizi e forniture, 140.000 €), imponendo però il principio di
rotazione: non si può continuare ad affidare sempre allo stesso operatore senza motivazione. Nella sanità italiana è la
procedura più usata per numero di contratti. Un affidamento diretto non è di per sé un’irregolarità — diventa un segnale
da verificare quando si ripete sistematicamente con lo stesso fornitore o riguarda importi rilevanti frazionati.`],
  ['Cos’è il CIG?', `Il CIG (Codice Identificativo di Gara) è il codice alfanumerico di 10 caratteri che identifica in modo
univoco ogni procedura di affidamento pubblico in Italia. Viene rilasciato dall’ANAC ed è la chiave per verificare
qualsiasi contratto: con il CIG si risale a oggetto, importo, procedura, aggiudicatario e atti amministrativi. Ogni
contratto citato su questo sito riporta il suo CIG proprio perché chiunque possa controllare i dati alla fonte, sulla
Banca Dati Nazionale dei Contratti Pubblici.`],
  ['Cos’è la GSA (Gestione Sanitaria Accentrata)?', `La GSA è la contabilità sanitaria gestita <strong>direttamente dalla
Regione</strong> (codice azienda 000): raccoglie le poste che non transitano dai bilanci delle singole aziende, tra cui i
ripiani dei disavanzi. È il motivo per cui «tutte le aziende sono in rosso» è una lettura sbagliata: gran parte del rosso
delle aziende è coperto a livello regionale dalla GSA. Il disavanzo «vero» del sistema si vede solo sommando aziende e
GSA — è il calcolo che facciamo nell’<a href="inchiesta.html">inchiesta</a>.`],
  ['Cosa sono i modelli CE e SP?', `Sono i due prospetti contabili ufficiali che ogni azienda del SSN trasmette al Ministero
dell’Economia: il <strong>CE (Conto Economico)</strong> riporta ricavi e costi dell’anno (valore della produzione, costi,
personale, risultato d’esercizio); lo <strong>SP (Stato Patrimoniale)</strong> fotografa attività, debiti e patrimonio
netto. Sono pubblicati come open data nella BDAP della Ragioneria Generale dello Stato e sono la fonte di tutti i numeri
di bilancio di questo sito, dal 2012 a oggi.`],
  ['Cos’è un accordo quadro (o convenzione)?', `È un contratto «contenitore» aggiudicato <strong>con gara</strong> da una
centrale di committenza (Consip a livello nazionale, o i soggetti aggregatori regionali come Intercent-ER, Azienda Zero,
Estar, SoReSa): le singole amministrazioni poi vi «aderiscono» con ordini successivi, senza rifare la gara. L’adesione a
una convenzione NON è un affidamento senza concorrenza — la concorrenza c’è stata a monte. Per questo il sito esclude le
adesioni riconoscibili dal conteggio «senza gara».`],
  ['ASL, ASST, AO, AOU, IRCCS: che differenza c’è?', `La <strong>ASL</strong> (in alcune regioni ATS/ASST/AUSL/ULSS) è
l’azienda territoriale che organizza tutti i servizi sanitari di un’area, ospedali compresi. Le <strong>AO</strong>
(aziende ospedaliere) e le <strong>AOU</strong> (universitarie) sono ospedali «autonomi» con bilancio proprio. Gli
<strong>IRCCS</strong> sono istituti di ricovero a carattere scientifico. Conta per leggere i conti: un ospedale-presidio
di ASL non ha bilancio proprio — i suoi numeri stanno dentro quelli della ASL.`],
  ['Cos’è il frazionamento?', `È la pratica — vietata — di spezzare un acquisto in più contratti sotto soglia per evitare
le procedure competitive. Non è osservabile direttamente nei dati: il sito segnala come <em>indicatore</em> la
concentrazione anomala di affidamenti appena sotto le soglie di legge (35–40.000 € e 130–140.000 €). Può avere spiegazioni
legittime; è un punto di partenza per la verifica, non una prova.`],
  ['Cos’è una proroga?', `È il prolungamento di un contratto esistente oltre la scadenza, senza nuova gara. Le proroghe
«tecniche» brevi sono ammesse in attesa della gara nuova; proroghe ripetute e lunghe sono un segnale di mercato bloccato:
lo stesso fornitore resta per anni senza confronto competitivo. Il sito le conteggia tra gli indicatori per regione e
azienda.`],
  ['Quanto spende la sanità pubblica italiana?', `Nel 2024 il valore della produzione delle aziende del SSN tracciate su
questo sito supera i <strong>240 miliardi di euro</strong>, e i costi della produzione sono dello stesso ordine (fonte:
BDAP — RGS/MEF, modelli CE consuntivi). Circa un terzo dei costi è personale; il resto è acquisto di beni e servizi —
farmaci, dispositivi, servizi esternalizzati — cioè la spesa che passa per i contratti pubblici tracciati qui.`],
  ['Chi sono i fornitori delle ASL?', `Nel 2023–2024, le 113 aziende sanitarie collegate su questo sito hanno aggiudicato
contratti a migliaia di imprese: dalle multinazionali del farmaco e dei dispositivi (i valori maggiori) alle cooperative
locali di servizi. La pagina <a href="fornitori.html">Fornitori</a> elenca le imprese con valore aggiudicato, numero di
contratti e aziende servite; ogni impresa rilevante ha una scheda con i suoi contratti principali.`],
];
export function renderGlossario() {
  const blocchi = VOCI_GLOSSARIO.map(([q, a]) => `<h3 id="${esc(q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))}">${esc(q)}</h3>\n<p>${a}</p>`).join('\n');
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: VOCI_GLOSSARIO.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') },
    })),
  };
  const body = `
<h1>Glossario: capire gli appalti e i bilanci della sanità</h1>
<p class="lead">Le parole chiave per leggere questo sito — e qualsiasi bilancio o gara della sanità pubblica —
spiegate in modo semplice e verificabile.</p>
${blocchi}
<p class="small muted">Le definizioni sono divulgative, non pareri legali. Riferimenti normativi: d.lgs. 36/2023
(Codice dei contratti), d.lgs. 118/2011 (bilanci SSN), d.lgs. 33/2013 (trasparenza).</p>
`;
  return page({
    title: 'Glossario della sanità pubblica: appalti, CIG, GSA, bilanci — Ospedali Trasparenti',
    description: 'Cos’è un affidamento diretto? Cos’è il CIG? Quanto spende la sanità pubblica italiana? Le risposte, semplici e verificabili.',
    active: 'approfondimenti.html',
    canonical: 'glossario.html',
    jsonld,
    body,
  });
}

// ---------- 7. Ръководство за проверка ----------
export function renderGuida() {
  const body = `
<h1>Come verificare un appalto in 5 minuti</h1>
<p class="lead">Questo sito ti dà gli indicatori; la verifica è tua. Ecco il percorso completo — gratuito e legale —
per controllare un contratto pubblico della sanità, dal CIG fino alla richiesta di documenti.</p>

<h2>1. Parti dal CIG</h2>
<p>Ogni contratto su questo sito riporta il suo <strong>CIG</strong> (codice di 10 caratteri). Copialo. Sulla
<a href="https://dati.anticorruzione.it/opendata" target="_blank" rel="noopener">Banca Dati ANAC</a> trovi la scheda
ufficiale della procedura: oggetto, importo, tipo di scelta del contraente, aggiudicatario, date.</p>

<h2>2. Cerca la determina</h2>
<p>Ogni affidamento nasce da un atto amministrativo (determina/delibera) che deve motivarlo. Vai sul sito dell’azienda
sanitaria → sezione <strong>«Amministrazione Trasparente»</strong> → «Bandi di gara e contratti» o «Provvedimenti».
La pubblicazione è un obbligo di legge (d.lgs. 33/2013). Nella determina trovi il RUP (responsabile del procedimento),
la motivazione della procedura scelta e — per gli affidamenti diretti — la giustificazione.</p>

<h2>3. Controlla chi decide e chi vince</h2>
<p>Sempre in Amministrazione Trasparente: sezione «Personale» / «Titolari di incarichi dirigenziali» per i dirigenti e
le loro dichiarazioni di insussistenza di conflitto di interessi. Per il fornitore: la visura al
<a href="https://www.registroimprese.it/" target="_blank" rel="noopener">Registro Imprese</a> (pochi euro) mostra
soci e amministratori.</p>

<h2>4. Se un documento manca: accesso civico (FOIA)</h2>
<p>Se l’azienda non ha pubblicato ciò che deve, ogni cittadino può chiederlo — senza motivazione — con
l’<strong>accesso civico</strong> (art. 5, d.lgs. 33/2013): semplice (per documenti a pubblicazione obbligatoria) o
generalizzato (per dati ulteriori). Si presenta via PEC o modulo online all’URP dell’azienda; la risposta è dovuta
entro 30 giorni. In caso di diniego si può ricorrere al difensore civico o al TAR.</p>

<h2>5. A chi segnalare</h2>
<ul>
  <li><strong>ANAC</strong> — vigilanza sui contratti pubblici: segnalazioni documentate su procedure anomale.</li>
  <li><strong>Corte dei conti</strong> (procura regionale) — danno erariale.</li>
  <li><strong>Guardia di Finanza / Procura della Repubblica</strong> — ipotesi di reato.</li>
  <li>Stampa locale e nazionale — il giornalismo d’inchiesta resta il canale più efficace.</li>
</ul>
<div class="note"><strong>Ricorda.</strong> Un indicatore statistico non è una prova. Prima di segnalare, ricostruisci
il quadro: leggi la determina, verifica se c’era una convenzione, un’esclusiva, un’urgenza documentata. Le segnalazioni
solide sono quelle che citano atti, non impressioni.</div>
`;
  return page({
    title: 'Come verificare un appalto della sanità in 5 minuti — Ospedali Trasparenti',
    description: 'Guida pratica: dal CIG alla determina, dall’Amministrazione Trasparente all’accesso civico FOIA. Come controllare un contratto pubblico, passo per passo.',
    active: 'approfondimenti.html',
    canonical: 'guida-verifica.html',
    body,
  });
}

// ---------- 11. PNRR ----------
export function renderPnrr({ regionale, href }) {
  const conPnrr = regionale.filter((r) => r.pnrrImporto > 0).sort((a, b) => b.pnrrImporto - a.pnrrImporto);
  const totale = conPnrr.reduce((s, r) => s + r.pnrrImporto, 0);
  const totAppalti = regionale.reduce((s, r) => s + r.importo, 0);
  const rows = conPnrr
    .map(
      (r) => `<tr><td>${r.key ? `<a href="regione/${r.key}.html">${esc(r.nome)}</a>` : esc(r.nome)}</td>
      <td class="num">${euroCompact(r.pnrrImporto)}</td>
      <td class="num">${percentualeIt(r.importo ? r.pnrrImporto / r.importo : 0)}</td></tr>`
    )
    .join('');
  const body = `
<h1>Il PNRR nella sanità: chi spende i fondi</h1>
<p class="lead">Nei contratti sanitari 2023–2024 tracciati da ANAC, <strong>${euroCompact(totale)}</strong> sono
marcati come finanziati (in tutto o in parte) dal <strong>PNRR/PNC</strong> — la Missione 6 «Salute» del Piano
Nazionale di Ripresa e Resilienza: case e ospedali di comunità, digitalizzazione, grandi apparecchiature.</p>
<div class="grid kpis">
  ${kpi('Valore appalti PNRR/PNC', euroCompact(totale))}
  ${kpi('Quota sul totale appalti', percentualeIt(totAppalti ? totale / totAppalti : 0))}
  ${kpi('Regioni coinvolte', numeroIt(conPnrr.length))}
</div>
<h2>Per regione</h2>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Regione</th><th class="num" scope="col">Valore PNRR</th><th class="num" scope="col">Quota sugli appalti</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<div class="note"><strong>Limiti del dato.</strong> È la parte del PNRR sanità che passa per gare sopra i 40.000 €
registrate con il flag PNRR/PNC nel 2023–2024: non è l’intera Missione 6 (che include anche trasferimenti e spese
fuori perimetro). Il flag è dichiarato dalle stazioni appaltanti e può essere incompleto. Fonte: ANAC (CC BY 4.0).</div>
<p class="small muted">Per il quadro ufficiale della Missione 6: <a href="https://www.pnrr.salute.gov.it/" target="_blank" rel="noopener">pnrr.salute.gov.it</a>
e <a href="https://www.italiadomani.gov.it/" target="_blank" rel="noopener">italiadomani.gov.it</a>.</p>
`;
  return page({
    title: 'Il PNRR nella sanità: appalti Missione 6 per regione — Ospedali Trasparenti',
    description: 'Quanto valgono gli appalti sanitari finanziati dal PNRR (Missione 6 Salute) e in quali regioni si concentrano. Dati ANAC 2023–2024.',
    active: 'approfondimenti.html',
    canonical: 'pnrr.html',
    body,
  });
}

// ---------- 13. Storie (разкази от данните) ----------
export const STORIE = [
  {
    slug: 'noleggio-record-reggio-emilia',
    titolo: 'Quattro lotti in un giorno: il maxi-noleggio veicoli da 115 milioni',
    sommario: 'Il 22 novembre 2024 l’AUSL-IRCCS di Reggio Emilia registra quattro affidamenti diretti per «veicoli a noleggio» dallo stesso fornitore, per oltre 115 milioni di euro complessivi.',
    corpo: `
<p>Il 22 novembre 2024, nei dati ANAC, l’<strong>Azienda USL-IRCCS di Reggio Emilia</strong> registra quattro
affidamenti con oggetto «VEICOLI A NOLEGGIO» allo stesso operatore, <strong>Leasys Italia S.p.A.</strong> (gruppo
Stellantis): 43,0 + 27,1 + 25,2 + 19,7 milioni di euro — oltre <strong>115 milioni</strong> in un solo giorno,
registrati come <em>affidamento diretto</em>.</p>
<p>Nel perimetro tracciato da questo sito (2023–2024, 113 aziende collegate), il 95% del fatturato registrato di
Leasys verso la sanità proviene da questa sola azienda; l’86% dei contratti della coppia risulta senza confronto
competitivo registrato.</p>
<h2>Le spiegazioni possibili</h2>
<p>Un importo simile per il noleggio veicoli è compatibile con una <strong>gara centralizzata o un’adesione a
convenzione</strong> (Consip ha convenzioni attive per il noleggio a lungo termine) registrata in ANAC con il tipo
procedura sbagliato — un difetto di registrazione che abbiamo riscontrato spesso. Potrebbe anche trattarsi di un
contratto pluriennale per l’intera flotta aziendale (mezzi sanitari inclusi). Oppure di un dato errato alla fonte.</p>
<h2>Cosa serve per capire</h2>
<p>La risposta è nella <strong>determina di affidamento</strong>: i CIG dei quattro lotti sono nella
<a href="cerca.html?q=veicoli%20a%20noleggio">ricerca del sito</a> e la sezione Amministrazione Trasparente
dell’azienda deve pubblicare l’atto con la motivazione. Se sei un giornalista o un cittadino di Reggio Emilia:
è una richiesta di accesso civico da cinque minuti — la <a href="guida-verifica.html">guida è qui</a>.</p>
<div class="note"><strong>Questa è una pista, non un’accusa.</strong> Nessun addebito è mosso all’azienda sanitaria
né al fornitore: i dati citati sono quelli ufficiali ANAC, verificabili per CIG, e le spiegazioni legittime elencate
sopra sono plausibili. Se hai elementi che chiariscono il caso, <a href="note-legali.html#rettifiche">scrivici</a>:
pubblicheremo il contesto.</div>`,
    dati: '22.11.2024 · AUSL-IRCCS Reggio Emilia · Leasys Italia S.p.A. · 4 CIG · >115 mln €',
  },
  {
    slug: 'catanzaro-un-miliardo-di-farmaci',
    titolo: 'Un miliardo in 49 contratti: il caso dei farmaci a Catanzaro',
    sommario: 'L’ASP di Catanzaro concentra oltre un miliardo di euro in 49 contratti con un solo fornitore farmaceutico, quasi tutti senza gara. Legittimo? Probabile. Da capire? Sì.',
    corpo: `
<p>Nei dati ANAC 2023–2024, l’<strong>Azienda Sanitaria Provinciale di Catanzaro</strong> risulta aver aggiudicato
a <strong>Novartis Farma S.p.A.</strong> 49 contratti per oltre <strong>1 miliardo di euro</strong> — il 98% senza
confronto competitivo registrato. È la coppia azienda-fornitore di maggior valore dell’intero dataset.</p>
<h2>Perché può essere legittimo</h2>
<p>I farmaci coperti da <strong>brevetto</strong> si comprano necessariamente dal titolare: la procedura negoziata
senza pubblicazione è la via prevista dalla legge per i beni infungibili. Le terapie oncologiche e le terapie geniche
ad alto costo possono giustificare importi enormi. Un’ASP che compra per l’intera provincia concentra la spesa
farmaceutica di centinaia di migliaia di persone.</p>
<h2>Perché merita comunque attenzione</h2>
<p>La domanda giusta non è «perché senza gara?» ma: <strong>l’importo messo a gara corrisponde al fabbisogno reale?</strong>
Un miliardo su una provincia è una cifra che va spiegata dagli atti: quali farmaci, per quanti anni, con quali sconti
riservati (i prezzi reali dei farmaci sono spesso segretati negli accordi AIFA). E la Calabria è la regione con la quota
«senza gara» tra le più alte d’Italia (66%) anche fuori dai farmaci.</p>
<div class="note"><strong>Pista, non prova.</strong> Nessuna irregolarità è contestata: brevetti ed esclusive rendono
plausibile la procedura. I CIG sono verificabili dalla <a href="struttura/180203-azienda-sanitaria-provinciale-di-catanzaro.html">scheda
dell’azienda</a>. Rettifiche e contesto: <a href="note-legali.html#rettifiche">scrivici</a>.</div>`,
    dati: '2023–2024 · ASP Catanzaro · Novartis Farma S.p.A. · 49 CIG · >1 mld €',
  },
];
export function renderStorie() {
  const cards = STORIE.map(
    (s) => `<div class="seg media"><div class="t"><a href="storia/${s.slug}.html">${esc(s.titolo)}</a></div>
    <div class="d">${esc(s.sommario)}<div class="small muted" style="margin-top:6px">${esc(s.dati)}</div></div></div>`
  ).join('\n');
  const body = `
<h1>Le storie nei dati</h1>
<p class="lead">Casi concreti emersi dagli indicatori di questo sito, raccontati con i numeri ufficiali e — sempre —
con le spiegazioni legittime possibili. Non sono inchieste giudiziarie: sono piste documentate, pronte per chi vuole
approfondire (giornalisti, cittadini, autorità di controllo).</p>
${cards}
<div class="note">Ogni storia cita solo dati ufficiali verificabili per CIG e include le possibili spiegazioni
legittime. <strong>Indicatori, non prove.</strong> Per segnalare errori o fornire contesto:
<a href="note-legali.html#rettifiche">rettifiche</a>.</div>
`;
  return page({
    title: 'Le storie nei dati — casi da verificare — Ospedali Trasparenti',
    description: 'Casi concreti dagli appalti della sanità: maxi-affidamenti, concentrazioni anomale, relazioni ricorrenti — raccontati con i dati ufficiali e le spiegazioni possibili.',
    active: 'approfondimenti.html',
    canonical: 'storie.html',
    body,
  });
}
export function renderStoria(s) {
  const body = `
<p class="small muted"><a href="../storie.html">← Tutte le storie</a></p>
<h1>${esc(s.titolo)}</h1>
<p class="small muted">${esc(s.dati)}</p>
${s.corpo.replaceAll('href="', 'href="../').replaceAll('href="../http', 'href="http').replaceAll('href="../#', 'href="#')}
`;
  return page({
    title: `${s.titolo} — Ospedali Trasparenti`,
    description: s.sommario,
    active: 'approfondimenti.html',
    rel: '../',
    canonical: `storia/${s.slug}.html`,
    ogType: 'article',
    body,
  });
}

// ---------- 14. Aggiornamenti ----------
export function renderAggiornamenti({ date }) {
  const body = `
<h1>Aggiornamenti del sito</h1>
<p class="lead">Questo sito è rigenerato interamente dai dati: ogni aggiornamento delle fonti produce una nuova
versione di tutte le pagine. Qui teniamo il registro di cosa è cambiato.</p>
<h2>Luglio 2026 — prima pubblicazione</h2>
<ul>
  <li>Bilanci CE/SP 2012–2024 di tutte le aziende del SSN (BDAP — RGS/MEF).</li>
  <li>Appalti ANAC 2023–2024: ${date.contratti ? esc(date.contratti) : '214.026'} contratti collegati, fornitori, indicatori.</li>
  <li>Indicatori automatici: segnalazioni contabili, anomalie di spesa, relazioni ricorrenti.</li>
  <li>Carta delle regioni, profili dei fornitori, ricerca su tutti i contratti, dati aperti.</li>
</ul>
<h2>Luglio 2026 — secondo aggiornamento</h2>
<ul>
  <li><strong><a href="mobilita.html">Mobilità sanitaria</a></strong> — la spesa di ogni regione per curare i propri cittadini altrove (dai bilanci CE).</li>
  <li><strong><a href="personale.html">Personale</a></strong> — dipendenti, medici e lavoro flessibile per azienda (Conto Annuale RGS 2023).</li>
  <li><strong><a href="pagamenti.html">Tempi di pagamento</a></strong> — la serie nazionale PCC/MEF 2019–2025 per gli enti del SSN.</li>
</ul>
<h2>In preparazione</h2>
<ul>
  <li><strong>Liste d’attesa</strong>: la Piattaforma Nazionale (PNLA) di AGENAS pubblica per ora solo un
  <a href="https://www.portaletrasparenzaservizisanitari.it/" target="_blank" rel="noopener">cruscotto consultabile</a>,
  non ancora dati aperti scaricabili; li integreremo appena disponibili in formato riutilizzabile.</li>
</ul>
<p class="small muted">Le date di generazione dei dataset correnti sono nella pagina <a href="verifiche.html">Dati e
verifiche</a> (con impronta SHA-256 delle fonti). Segnalazioni e correzioni: <a href="note-legali.html#rettifiche">rettifiche</a>.</p>
`;
  return page({
    title: 'Aggiornamenti — Ospedali Trasparenti',
    description: 'Il registro degli aggiornamenti del sito: quali dati sono stati caricati, cosa è cambiato e cosa è in preparazione.',
    active: 'approfondimenti.html',
    canonical: 'aggiornamenti.html',
    body,
  });
}

// ---------- Hub „Approfondimenti" ----------
export function renderApprofondimenti({ nTop, totCategorie, nStrutture }) {
  const card = (href, titolo, descr) => `<div class="seg media"><div class="t"><a href="${href}">${titolo}</a></div><div class="d">${descr}</div></div>`;
  const body = `
<h1>Approfondimenti</h1>
<p class="lead">Oltre i numeri delle singole aziende: tendenze di lungo periodo, classifiche nazionali, guide pratiche
e storie documentate — tutto dagli stessi dati ufficiali, tutto verificabile.</p>
<h2>Analisi</h2>
${card('tendenze.html', 'Il decennio della sanità (2012–2024)', 'Tredici anni di ricavi, costi, personale e risultati: dove sta andando la spesa.')}
${card('categorie.html', 'Dove vanno i soldi: le categorie di spesa', `Farmaci, pulizie, energia, informatica: ${euroCompact(totCategorie)} classificati per categoria, con i primi fornitori di ciascuna.`)}
${card('top-contratti.html', 'I 100 contratti più grandi', `I maxi-contratti 2023–2024 delle aziende sanitarie: chi, cosa, quanto e con quale procedura.`)}
${card('pnrr.html', 'Il PNRR nella sanità', 'Gli appalti finanziati dalla Missione 6 «Salute», regione per regione.')}
<h2>Storie</h2>
${card('storie.html', 'Le storie nei dati', 'Casi concreti emersi dagli indicatori, raccontati con i numeri ufficiali e le spiegazioni possibili.')}
<h2>Strumenti per il cittadino</h2>
${card('dove.html', 'Trova la tua struttura', `Cerca il tuo comune tra ${numeroIt(nStrutture)} strutture di ricovero pubbliche e trova i conti della tua azienda sanitaria.`)}
${card('glossario.html', 'Glossario e domande frequenti', 'Affidamento diretto, CIG, GSA, accordi quadro: le parole chiave spiegate in modo semplice.')}
${card('guida-verifica.html', 'Come verificare un appalto in 5 minuti', 'Dal CIG alla determina, fino all’accesso civico (FOIA): la guida pratica completa.')}
<h2>Il progetto</h2>
${card('aggiornamenti.html', 'Aggiornamenti', 'Cosa è stato caricato, cosa è cambiato e cosa è in preparazione (tempi di pagamento, liste d’attesa, personale).')}
`;
  return page({
    title: 'Approfondimenti — analisi, storie e guide — Ospedali Trasparenti',
    description: 'Tendenze della spesa sanitaria 2012–2024, i 100 contratti più grandi, le categorie di spesa, il PNRR, le storie nei dati e le guide per verificare.',
    active: 'approfondimenti.html',
    body,
  });
}

// ---------- 8. Tempi di pagamento (RGS/PCC — национална серия) ----------
export function renderPagamenti({ tp }) {
  const anni = tp.perAnno;
  const ultimo = anni.at(-1);
  const primo = anni[0];
  const rows = anni
    .map(
      (a) => `<tr><td>${a.anno}</td><td class="num">${numeroIt(a.fattureMgl)} mila</td>
      <td class="num">${euroCompact(a.importoFatture * 1e6)}</td>
      <td class="num">${a.tempoMedioPagamento} gg</td>
      <td class="num ${a.tempoMedioRitardo < 0 ? 'pos' : 'neg'}">${a.tempoMedioRitardo} gg</td>
      <td class="num">${percentualeIt(a.importoNeiTermini / 100)}</td></tr>`
    )
    .join('');
  const body = `
<h1>Quanto in fretta pagano gli ospedali</h1>
<p class="lead">Le aziende del SSN devono pagare i fornitori entro <strong>60 giorni</strong>. Per anni non è stato
così — i ritardi della sanità erano cronici. La serie ufficiale PCC/MEF mostra la svolta: nel ${ultimo.anno} il tempo
medio di pagamento è sceso a <strong>${ultimo.tempoMedioPagamento} giorni</strong> (${primo.anno}: ${primo.tempoMedioPagamento}),
con un anticipo medio di ${Math.abs(ultimo.tempoMedioRitardo)} giorni sul termine.</p>
${lineChart(
    [
      { label: 'Tempo medio di pagamento (giorni)', color: 'var(--brand)', points: anni.map((a) => [a.anno, a.tempoMedioPagamento]) },
    ],
    { caption: 'Tempo medio di pagamento delle fatture — enti del SSN (fonte: PCC/RGS-MEF)' }
  )}
<div class="grid kpis">
  ${kpi(`Fatture ricevute (${ultimo.anno})`, `${numeroIt(ultimo.fattureMgl)} mila`)}
  ${kpi('Valore fatture', euroCompact(ultimo.importoFatture * 1e6))}
  ${kpi('Tempo medio di pagamento', `${ultimo.tempoMedioPagamento} giorni`, 'pos')}
  ${kpi('Importo pagato nei termini', percentualeIt(ultimo.importoNeiTermini / 100), 'pos')}
</div>
<h2>La serie completa</h2>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Anno</th><th class="num" scope="col">Fatture</th><th class="num" scope="col">Valore</th>
  <th class="num" scope="col">Tempo medio</th><th class="num" scope="col">Ritardo medio</th><th class="num" scope="col">Nei termini (valore)</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<div class="note"><strong>Perché conta.</strong> I ritardi di pagamento sono un costo occulto: i fornitori li
scontano nei prezzi, le piccole imprese ne soffrono la liquidità, e l’Italia è stata condannata dalla Corte di
giustizia UE (2020) proprio per i ritardi della PA. Il miglioramento è reale ed è uno dei pochi indicatori della
sanità in netto progresso. Il dato è nazionale: i tempi delle singole aziende sono pubblicati da ciascuna
(indicatore di tempestività, in Amministrazione Trasparente) ma non esistono ancora come open data centralizzato.</div>
<p class="small muted">Fonte: <a href="${esc(tp.url)}" target="_blank" rel="noopener">RGS/MEF — monitoraggio tempi di
pagamento</a> (dati PCC), tabella «Enti del SSN». Estrazione manuale dal PDF ufficiale, verificabile 1:1.
Termine legale: ${esc(tp.termineLegale)}.</p>
`;
  return page({
    title: 'Tempi di pagamento della sanità: quanto in fretta pagano gli ospedali — Ospedali Trasparenti',
    description: `Il tempo medio di pagamento delle aziende sanitarie è sceso a ${ultimo.tempoMedioPagamento} giorni. La serie ufficiale PCC/MEF ${primo.anno}–${ultimo.anno}, spiegata.`,
    active: 'approfondimenti.html',
    canonical: 'pagamenti.html',
    body,
  });
}

// ---------- 9. Personale (Conto Annuale) ----------
export function renderPersonale({ pers, aziendeNomi, href }) {
  const n = pers.nazionale;
  const st = pers.flessibileStorico;
  const topFless = Object.entries(pers.perEnte)
    .filter(([, v]) => v.totale >= 1000)
    .sort((a, b) => b[1].quotaFlessibili - a[1].quotaFlessibili)
    .slice(0, 15);
  const rows = topFless
    .map(([cod, v]) => {
      const nome = aziendeNomi.get(cod) || cod;
      return `<tr><td><a href="${href(cod)}">${esc(nome)}</a></td>
      <td class="num">${numeroIt(v.totale)}</td><td class="num">${numeroIt(v.medici)}</td>
      <td class="num">${numeroIt(v.flessibili)}</td><td class="num ${v.quotaFlessibili > 0.15 ? 'neg' : ''}">${percentualeIt(v.quotaFlessibili)}</td></tr>`;
    })
    .join('');
  const body = `
<h1>Il personale della sanità pubblica</h1>
<p class="lead">Nel ${pers.anno} le strutture del comparto sanità contavano <strong>${numeroIt(n.totale)}</strong>
dipendenti, di cui <strong>${numeroIt(n.medici)} medici</strong>. Il ${percentualeIt(n.flessibili / n.totale)} ha un
contratto «flessibile» (tempo determinato, interinale): dove questa quota esplode, l’azienda copre i buchi d’organico
con personale precario — l’anticamera dei «medici a gettone».</p>
<div class="grid kpis">
  ${kpi(`Dipendenti (${pers.anno})`, numeroIt(n.totale))}
  ${kpi('Medici', numeroIt(n.medici))}
  ${kpi('Contratti flessibili', numeroIt(n.flessibili))}
  ${kpi('Quota flessibili', percentualeIt(n.flessibili / n.totale))}
</div>
<h2>Il lavoro precario nel tempo</h2>
${lineChart(
    [
      { label: 'Tempo determinato', color: 'var(--brand)', points: st.map((r) => [r.anno, r.determinato]) },
      { label: 'Interinale (agenzia)', color: 'var(--neg)', points: st.map((r) => [r.anno, r.interinale]) },
    ],
    { caption: 'Dipendenti con contratto flessibile nel comparto sanità (teste, fonte: Conto Annuale)' }
  )}
<h2>Dove il lavoro flessibile pesa di più</h2>
<p class="muted small">Aziende con almeno 1.000 dipendenti, ordinate per quota di contratti flessibili.</p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Azienda</th><th class="num" scope="col">Dipendenti</th><th class="num" scope="col">Medici</th>
  <th class="num" scope="col">Flessibili</th><th class="num" scope="col">Quota</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<div class="note"><strong>Il limite del dato.</strong> Il Conto Annuale conta i <em>dipendenti</em> — anche precari —
ma NON i «medici a gettone» forniti da cooperative e agenzie esterne: quelli passano per i contratti di
servizi (li trovi negli <a href="appalti.html">appalti</a>, categoria somministrazione/servizi sanitari
esternalizzati). Una quota flessibile alta è un indicatore di fragilità dell’organico, non un’irregolarità.</div>
<p class="small muted">Fonte: Conto Annuale (RGS/MEF) via BDAP open data — ${pers.anno}, ultima rilevazione completa
(la raccolta ${pers.anno + 1} è ancora parziale alla fonte). ${numeroIt(n.collegati)} aziende collegate alle schede del sito.</p>
`;
  return page({
    title: 'Il personale della sanità: medici, precari e «gettonisti» — Ospedali Trasparenti',
    description: `${numeroIt(n.totale)} dipendenti, ${numeroIt(n.medici)} medici: il personale della sanità pubblica e dove il lavoro precario pesa di più. Dati Conto Annuale RGS.`,
    active: 'approfondimenti.html',
    canonical: 'personale.html',
    body,
  });
}

// ---------- 12. Mobilità sanitaria ----------
export function renderMobilita({ mob, regKeyByNome }) {
  const u = mob.perAnno[mob.ultimoAnno];
  const anni = Object.keys(mob.perAnno).map(Number).sort();
  const rows = u.regioni
    .map((r) => {
      const key = regKeyByNome(r.regione);
      const nome = key ? `<a href="regione/${key}.html">${esc(r.regione)}</a>` : esc(r.regione);
      return `<tr><td>${nome}</td>
      <td class="num">${euroCompact(r.passivaTot)}</td>
      <td class="num">${euroCompact(r.passivaPubblico)}</td>
      <td class="num">${euroCompact(r.passivaPrivato)}</td>
      <td class="num">${euroCompact(r.attivaParziale)}</td></tr>`;
    })
    .join('');
  const body = `
<h1>Curarsi fuori regione: chi paga la mobilità sanitaria</h1>
<p class="lead">Quando un cittadino si cura in un’altra regione, la sua regione paga. Nel ${mob.ultimoAnno} le regioni
hanno speso <strong>${euroCompact(u.totPassiva)}</strong> per curare i propri cittadini fuori dai confini —
${anni.length > 1 ? `in crescita da ${euroCompact(mob.perAnno[anni[0]].totPassiva)} nel ${anni[0]}` : ''}. È la
misura più concreta della disuguaglianza sanitaria: chi può, parte; la sua regione paga due volte (il viaggio lo
paga il paziente).</p>
<div class="grid kpis">
  ${kpi(`Spesa fuori regione (${mob.ultimoAnno})`, euroCompact(u.totPassiva), 'neg')}
  ${kpi('Verso strutture pubbliche', euroCompact(u.regioni.reduce((s, r) => s + r.passivaPubblico, 0)))}
  ${kpi('Verso strutture private', euroCompact(u.regioni.reduce((s, r) => s + r.passivaPrivato, 0)))}
</div>
<h2>Regione per regione</h2>
<p class="muted small">Quanto spende ogni regione per prestazioni erogate fuori dal proprio territorio (canale
pubblico e privato), e quanto incassa dalle altre (dato parziale — vedi nota).</p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Regione</th><th class="num" scope="col">Spesa fuori regione</th>
  <th class="num" scope="col">di cui a pubblico</th><th class="num" scope="col">di cui a privato</th>
  <th class="num" scope="col">Ricavi da altre regioni*</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<div class="note"><strong>Come leggere (e i limiti).</strong> La spesa «fuori regione» è la somma delle voci di costo
Extraregione dei bilanci CE (aziende + gestione regionale): è il dato solido. *I «ricavi da altre regioni» (AA0450)
sono invece <strong>parziali</strong>: parte dei flussi compensativi transita dalla gestione accentrata regionale sotto
altre voci — per questo NON pubblichiamo un «saldo» e la colonna va letta come ordine di grandezza. La fotografia
resta chiara: le regioni del Sud spendono molto per curare i propri cittadini al Nord, e quasi non incassano nulla
in senso opposto.</div>
<p class="small muted">Fonte: BDAP — RGS/MEF, modelli CE (consuntivo), voci Extraregione. Elenco delle voci usate nei
<a href="dati.html">dati aperti</a> (mobilita.json).</p>
`;
  return page({
    title: 'Mobilità sanitaria: quanto spendono le regioni per curarsi altrove — Ospedali Trasparenti',
    description: `${euroCompact(u.totPassiva)} spesi nel ${mob.ultimoAnno} per curarsi fuori regione: la classifica regionale della mobilità sanitaria passiva, dai bilanci ufficiali.`,
    active: 'approfondimenti.html',
    canonical: 'mobilita.html',
    body,
  });
}
