// Правни страници: privacy (чл. 13 GDPR), cookie, note legali (D.Lgs. 70/2003, чл. 7) и 404.
// Обработванията описват САМО това, което сайтът реално прави (без бисквитки, без аналитика).

import { esc } from "../lib/html.mjs";
import { pageHead } from "../blocks.mjs";
import { R } from "../routes.mjs";
import { COMPANY, CONTACT, SITE } from "../config.mjs";
import { dataIt } from "./guida.mjs";

const titolare = `${esc(COMPANY.legalName)}, ${esc(COMPANY.street)}, ${esc(COMPANY.postalCode)} ${esc(COMPANY.city)} (${esc(COMPANY.country)}), Partita IVA ${esc(
  COMPANY.vat,
)}`;

function legal(path, title, description, h1, lead, html, keywords) {
  return {
    path,
    title,
    description,
    keywords,
    breadcrumbs: [{ name: h1, path }],
    body: `${pageHead({ h1, lead })}<div class="wrap prose">${html}<p class="note">Ultimo aggiornamento: <time datetime="${SITE.updated}">${dataIt(
      SITE.updated,
    )}</time>.</p></div>`,
    schema: () => [],
    priority: 0.2,
    changefreq: "yearly",
  };
}

export function privacyPage() {
  return legal(
    R.privacy,
    "Informativa privacy | LiftCon",
    "Informativa sul trattamento dei dati personali del sito LiftCon ai sensi dell'art. 13 del Regolamento (UE) 2016/679: dati, finalità, conservazione e diritti.",
    "Informativa privacy",
    "Come trattiamo i dati personali di chi visita questo sito o ci contatta, ai sensi dell'articolo 13 del Regolamento (UE) 2016/679 (GDPR).",
    `<h2>Titolare del trattamento</h2>
<p>${titolare}. Contatto per la privacy: <a href="mailto:${esc(CONTACT.email)}">${esc(CONTACT.email)}</a>.</p>
<h2>Quali dati trattiamo e perché</h2>
<h3>Richieste di contatto</h3>
<p>Se ci scrive con il modulo, per email o ci chiama, trattiamo i dati che ci fornisce (nome, email, telefono, ruolo, comune dell'impianto, testo del messaggio) per rispondere alla richiesta e preparare una proposta d'incarico. Base giuridica: misure precontrattuali adottate su sua richiesta (art. 6, par. 1, lett. b GDPR). Se ci scrive per conto di un condominio, di un'azienda o di un altro cliente, trattiamo i suoi dati di contatto sulla base del nostro legittimo interesse a rispondere (art. 6, par. 1, lett. f GDPR). Senza questi dati non possiamo rispondere.</p>
<p>La richiesta viene salvata nella banca dati del nostro server, consultabile solo dal personale autorizzato con accesso protetto da verifica in due passaggi, e ne riceviamo un avviso per email: lo invia Brevo e arriva nella nostra casella di posta, gestita da Register.it.</p>
<h3>Dati tecnici di navigazione</h3>
<p>Il server registra nei propri log indirizzo IP, data e ora, pagina richiesta e tipo di browser, per garantire la sicurezza del sito e prevenire abusi. Base giuridica: legittimo interesse alla sicurezza del servizio (art. 6, par. 1, lett. f GDPR).</p>
<h3>Mappa OpenStreetMap</h3>
<p>Nella pagina Contatti la mappa si carica solo se lei preme «Mostri la mappa». In quel momento il suo browser si collega ai server di OpenStreetMap Foundation (Regno Unito, paese con decisione di adeguatezza della Commissione europea), che ricevono il suo indirizzo IP. Base giuridica: la sua scelta di caricare la mappa (art. 6, par. 1, lett. a GDPR). Può revocare il consenso in qualsiasi momento: ricaricando la pagina la mappa non si carica più finché non preme di nuovo il pulsante; la revoca non incide sul caricamento già avvenuto.</p>
<h2>Che cosa non facciamo</h2>
<p>Questo sito non usa cookie, strumenti di analisi del traffico, pubblicità o profilazione, e non prende decisioni automatizzate sulle persone.</p>
<h2>Per quanto tempo conserviamo i dati</h2>
<ul><li>Richieste che non portano a un incarico: cancellate automaticamente 6 mesi dopo l'ultima modifica.</li><li>Richieste che portano a un incarico: per la durata del rapporto e poi per i tempi previsti dagli obblighi contabili e fiscali (art. 6, par. 1, lett. c GDPR).</li><li>Log del server: di norma 14 giorni, con cancellazione automatica.</li></ul>
<h2>Chi tratta i dati per nostro conto</h2>
<ul><li>netcup GmbH (Germania): server che ospita il sito e la banca dati delle richieste.</li><li>Sendinblue SAS, marchio Brevo (Francia): invio delle email di avviso generate dal modulo di contatto.</li><li>Register S.p.A., marchio Register.it (Italia): casella di posta elettronica in cui riceviamo gli avvisi del modulo e le email che ci scrive.</li></ul>
<p>Sono responsabili del trattamento ai sensi dell'articolo 28 GDPR. I dati restano nell'Unione europea, salvo il caso della mappa descritto sopra.</p>
<h2>I suoi diritti</h2>
<p>Può chiedere accesso, rettifica, cancellazione, limitazione, portabilità dei dati e opporsi al trattamento basato sul legittimo interesse e revocare il consenso dato per la mappa (articoli 7 e 15–22 GDPR), scrivendo a <a href="mailto:${esc(CONTACT.email)}">${esc(
      CONTACT.email,
    )}</a>. Rispondiamo entro un mese.</p>
<p>Ha diritto di proporre reclamo al Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it" target="_blank" rel="noopener">garanteprivacy.it</a>) o all'autorità di controllo bulgara, la Commissione per la protezione dei dati personali (<a href="https://www.cpdp.bg" target="_blank" rel="noopener">cpdp.bg</a>).</p>
<h2>Fotografie e documenti degli incarichi</h2>
<p>Le modalità di trattamento di fotografie, documenti e dati personali raccolti durante un incarico sono indicate nella lettera d'incarico.</p>`,
    ["informativa privacy LiftCon", "privacy consulenza ascensori", "GDPR LiftCon", "trattamento dati LiftCon", "Carbon Stealth VCC privacy", "Carbon Stealth"],
  );
}

export function cookiePage() {
  return legal(
    R.cookie,
    "Cookie | LiftCon",
    "Le pagine pubbliche di LiftCon non usano cookie né strumenti di tracciamento: per questo non c'è banner. Unica eccezione facoltativa, la mappa OpenStreetMap.",
    "Cookie",
    "Le pagine pubbliche del sito non usano cookie, né tecnici né di profilazione, e nessuno strumento di analisi del traffico. Per questo non le chiediamo il consenso con un banner.",
    `<h2>Che cosa memorizza il sito nel suo browser</h2>
<p>Nulla: niente cookie, niente archiviazione locale, niente identificativi.</p>
<p>Solo l'area riservata al personale (<code>/admin</code>) usa un cookie tecnico di sessione, necessario per l'accesso protetto e quindi esente da consenso; i visitatori del sito non lo ricevono.</p>
<h2>Contenuti di terze parti</h2>
<p>La mappa della pagina <a href="${R.contatti}">Contatti</a> è di OpenStreetMap e si carica solo se lei preme «Mostri la mappa». Da quel momento valgono le regole di OpenStreetMap Foundation, che può impostare propri cookie: <a href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noopener">informativa di OpenStreetMap Foundation</a>.</p>
<p>Per il resto del trattamento dei dati personali, veda l'<a href="${R.privacy}">informativa privacy</a>.</p>`,
    ["cookie LiftCon", "sito senza cookie", "privacy consulenza ascensori", "cookie policy LiftCon", "OpenStreetMap cookie", "Carbon Stealth"],
  );
}

export function noteLegaliPage() {
  return legal(
    R.noteLegali,
    "Note legali | LiftCon",
    "Dati societari di Carbon Stealth VCC, titolare del servizio LiftCon: sede legale, Partita IVA, contatti, responsabile dei contenuti e foro competente.",
    "Note legali",
    "Informazioni sul fornitore del servizio, ai sensi dell'articolo 7 del D.Lgs. 70/2003.",
    `<h2>Dati societari</h2>
<dl class="company">
<div><dt>Servizio</dt><dd>LiftCon, consulenza tecnica ascensori</dd></div>
<div><dt>Ragione sociale</dt><dd>${esc(COMPANY.legalName)}</dd></div>
<div><dt>Forma giuridica</dt><dd>${esc(COMPANY.legalForm)}</dd></div>
<div><dt>EIK (Registro delle imprese bulgaro)</dt><dd>${esc(COMPANY.eik)}</dd></div>
<div><dt>Partita IVA</dt><dd>${esc(COMPANY.vat)}</dd></div>
<div><dt>Sede legale</dt><dd>${esc(COMPANY.street)}, ${esc(COMPANY.postalCode)} ${esc(COMPANY.city)} (${esc(COMPANY.country)})</dd></div>
<div><dt>Email</dt><dd><a href="mailto:${esc(CONTACT.email)}">${esc(CONTACT.email)}</a></dd></div>
<div><dt>Telefono</dt><dd><a href="${CONTACT.phoneHref}">${esc(CONTACT.phone)}</a></dd></div>
<div><dt>Responsabile dei contenuti</dt><dd>${esc(COMPANY.responsabile)}</dd></div>
</dl>
<h2>Natura del servizio</h2>
<p>LiftCon offre consulenza tecnica e reportistica: sopralluoghi descrittivi, controllo dei lavori, esame documentale, analisi dei preventivi e supporto al committente. Non è un organismo notificato né un organismo di ispezione: non esegue verifiche periodiche o straordinarie ai sensi del DPR 162/1999, non rilascia verbali ufficiali, certificazioni di conformità, dichiarazioni ai sensi del DM 37/2008, progetti o perizie giudiziarie, e non dirige né collauda lavori.</p>
<h2>Contenuti del sito</h2>
<p>Le guide riassumono norme e regolamenti a scopo informativo e indicano la data dell'ultimo controllo; fanno fede i testi ufficiali pubblicati su Normattiva e in Gazzetta Ufficiale. I contenuti non costituiscono parere legale.</p>
<h2>Foro competente e legge applicabile</h2>
<p>Foro competente e legge applicabile di ogni incarico sono indicati nella lettera d'incarico. Se lei è un consumatore (e, secondo la giurisprudenza italiana, può esserlo anche il condominio) può agire davanti al giudice del luogo in cui risiede o ha domicilio, e noi possiamo agire nei suoi confronti solo davanti a quel giudice (Reg. (UE) 1215/2012, artt. 17–18; Codice del consumo, artt. 33, comma 2, lett. u, e 66-bis). Restano salve le tutele inderogabili della legge italiana (Reg. (CE) 593/2008, art. 6).</p>
<h2>Caratteri tipografici</h2>
<p>I caratteri tipografici Saira e IBM Plex Sans sono distribuiti con licenza SIL Open Font License 1.1.</p>`,
    ["note legali LiftCon", "Carbon Stealth VCC", "dati societari LiftCon", "consulenza ascensori LiftCon", "partita IVA Carbon Stealth", "Carbon Stealth"],
  );
}

export function notFoundPage() {
  return {
    path: "/404.html",
    file: "404.html",
    title: "Pagina non trovata | LiftCon",
    description: "La pagina richiesta non esiste o è stata spostata. Torni alla pagina iniziale di LiftCon o scelga un servizio.",
    keywords: ["LiftCon", "pagina non trovata", "consulenza ascensori", "servizi ascensori", "contatti LiftCon", "Carbon Stealth"],
    breadcrumbs: [],
    noindex: true,
    sitemap: false,
    body: pageHead({
      h1: "Questa pagina non esiste",
      lead: `L'indirizzo potrebbe essere cambiato. Può tornare alla <a href="${R.home}">pagina iniziale</a>, vedere i <a href="${R.servizi}">servizi</a>, leggere le <a href="${R.guide}">guide</a> o <a href="${R.contatti}">contattarci</a>.`,
    }),
    schema: () => [],
  };
}
