// Страница „Metodologia e fonti" — метод, източници, правила, FAQ, disclaimer.
// Изнесена дословно от build-site.js — само местене.

import { esc, percentualeIt } from '../lib/format.js';
import { page, badge, siteUrl } from '../lib/site-ui.js';
import { rangeAnni } from '../lib/site-shared.js';

// ---------- METODOLOGIA ----------
export function renderMetodologia({ segn, forense, appalti, appMatch, ultimoAnnoCe }) {
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
