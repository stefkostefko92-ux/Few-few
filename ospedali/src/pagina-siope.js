// Страница „Dove escono i soldi per cassa" (SIOPE) — реалните КАСОВИ плащания на
// здравните структури: колко излиза месец по месец и за какво (макро-категории),
// плюс декемврийското натрупване по каса per регион.
//
// Рамка „indicatore, non prova": SIOPE е КАСА (кога излизат парите) — различно от
// CE (счетоводно начисляване); служи за независима крос-проверка, не за обвинение.
// Декемврийският скок може да е сезонност ИЛИ „изхарчване на бюджета".
// Агрегат на всички здравни enti в региона (SIOPE носи ИМЕ на ente, не код → не per болница).
//
// Изнася само render функцията; данните идват от build-site.js:
//   siope   = обектът от data/siope.json (fetch-siope → aggrega)
//   nomeReg = (key) → четимо име на региона (при липса покажи ключа)

// @ts-check
import { page, kpi, hbars, barChart } from './lib/site-ui.js';
import { euroCompact, percentualeIt, esc } from './lib/format.js';

const MESI =['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/**
 * @typedef {object} SiopeData данни от data/siope.json
 * @property {number} anno
 * @property {string} url
 * @property {{ spesaTotale?: number, mesi: number[], perMacro: Record<string, number>, dicSuMedia: number }} nazionale
 * @property {Record<string, { mesi?: number[], dicSuMedia?: number }>} perRegione
 * @property {string[]} [regioniMancanti]
 */

/**
 * @param {{ siope: SiopeData, nomeReg: ((k: string) => string) | unknown, jsonld: Record<string, unknown>|null }} p
 * @returns {string}
 */
export function renderSiope({ siope, nomeReg, jsonld }) {
  /** @type {(k: string) => string} */
  const nome = typeof nomeReg === 'function' ? /** @type {(k: string) => string} */ (nomeReg) : (k) => k;
  const n = siope.nazionale;
  const tot = n.spesaTotale || 0;
  /** @param {number} v */
  const quota = (v) => (tot ? v / tot : 0);

  // 12-те месечни потока (национален агрегат): виждаме ли декемврийски скок?
  const barre = barChart(
    // p[0] е месечен етикет (низ) — barChart го рендира като текст на оста
    /** @type {any} */ (n.mesi.map((v, i) => [MESI[i], v])),
    { caption: `Pagamenti per cassa della sanità pubblica, flusso mensile ${siope.anno} (in €)` }
  );

  // разбивка по макро-категория
  /** @type {Record<string, string>} */
  const MACRO_LABEL = {
    Farmaci: 'Farmaci',
    Dispositivi: 'Dispositivi e beni sanitari',
    ServiziPrivati: 'Servizi sanitari da privati',
    Personale: 'Personale',
    Altro: 'Altro (utenze, tributi, investimenti…)',
  };
  const macroItems = Object.entries(n.perMacro)
    .map(([k, v]) => ({ label: MACRO_LABEL[k] || k, valore: v, quota: quota(v) }))
    .sort((a, b) => b.valore - a.valore);
  const macroBarre = hbars(macroItems, {
    fmt: euroCompact,
    maxLabel: 'Pagamenti per cassa per macro-categoria (quota sul totale)',
  });

  // per регион по декемврийско натрупване (dic/media): quota = dicSuMedia, така
  // суфиксът „· X%" чете „декември = X% от средния месец".
  const regRows = Object.entries(siope.perRegione)
    .map(([key, g]) => ({
      label: nome(key) || key, // hbars сам екранира → без двоен esc
      valore: g.mesi ? g.mesi[11] : 0,
      quota: g.dicSuMedia || 0,
      flag: (g.dicSuMedia || 0) >= 1.6,
    }))
    .sort((a, b) => b.quota - a.quota);
  const regBarre = hbars(regRows, {
    fmt: euroCompact,
    maxLabel: 'Concentrazione di dicembre per regione (pagamento di dicembre in % del mese medio)',
  });

  const mancanti = Array.isArray(siope.regioniMancanti) ? siope.regioniMancanti : [];
  const notaMancanti = mancanti.length
    ? `<p class="small muted">Regioni non disponibili alla fonte per il ${siope.anno}: ${mancanti
        .map((k) => esc(nome(k) || k))
        .join(', ')}.</p>`
    : '';

  const body = `
<h1>Dove escono i soldi per cassa: i pagamenti SIOPE della sanità</h1>
<p class="lead">Nel ${siope.anno} le aziende sanitarie pubbliche italiane hanno pagato
<strong>${euroCompact(tot)}</strong> per cassa — soldi realmente usciti dai conti, non semplici scritture di bilancio.
Di questi, <strong>${percentualeIt(quota(n.perMacro.Personale))}</strong> è andato al personale,
<strong>${percentualeIt(quota(n.perMacro.Farmaci))}</strong> a farmaci e
<strong>${percentualeIt(quota(n.perMacro.ServiziPrivati))}</strong> a servizi sanitari acquistati da privati.
È la stessa spesa vista dal lato della cassa: <em>quando</em> escono i soldi, non solo <em>quanto</em>.</p>
<div class="grid kpis">
  ${kpi(`Pagamenti per cassa (${siope.anno})`, euroCompact(tot))}
  ${kpi('Quota personale', percentualeIt(quota(n.perMacro.Personale)))}
  ${kpi('Quota farmaci', percentualeIt(quota(n.perMacro.Farmaci)))}
  ${kpi('Dicembre sul mese medio', `${n.dicSuMedia.toLocaleString('it-IT', { maximumFractionDigits: 2 })}×`, n.dicSuMedia >= 1.3 ? 'neg' : '')}
</div>

<h2>Mese per mese: c’è il picco di dicembre?</h2>
<p class="muted small">Il flusso di pagamenti mese per mese (differenza tra i dati cumulati SIOPE). Un ultimo mese
più alto della media segnala una concentrazione di cassa a fine anno — che può essere stagionalità (fatture di fine
esercizio) oppure «spesa del budget» prima della chiusura del bilancio.</p>
${barre}
<p class="muted small">A livello nazionale il pagamento di dicembre vale
<strong>${n.dicSuMedia.toLocaleString('it-IT', { maximumFractionDigits: 2 })} volte</strong> il mese medio.</p>

<h2>Per che cosa: le macro-categorie</h2>
<p class="muted small">I pagamenti classificati per codice economico SIOPE (piano dei conti), raggruppati in macro-voci.
«Servizi sanitari da privati» comprende medicina di base convenzionata, specialistica ambulatoriale e assistenza
ospedaliera acquistata da strutture private accreditate.</p>
${macroBarre}

<h2>La febbre di dicembre, regione per regione</h2>
<p class="muted small">Per ogni regione, quanto pesa il pagamento di dicembre rispetto al mese medio dell’anno
(barra e percentuale) e l’importo di dicembre. In cima le regioni con la maggiore concentrazione di cassa a fine anno.</p>
${regBarre}
${notaMancanti}

<div class="note"><strong>Come leggere (e i limiti).</strong> SIOPE misura la <strong>cassa</strong> — il momento in
cui i soldi escono davvero dai conti — ed è cosa diversa dal bilancio economico (CE), che registra i costi per
<em>competenza</em>. Per questo serve come <strong>verifica indipendente</strong>: due fonti ufficiali, due basi
diverse, che devono raccontare la stessa storia. Un picco di dicembre <strong>non è di per sé un’anomalia</strong>:
può essere stagionalità (fatture concentrate a fine esercizio) o «spesa del budget» prima della chiusura. È un
<em>indicatore, non una prova</em>. Il dato è aggregato a livello <strong>regionale</strong> — l’insieme di tutte le
aziende sanitarie della regione — perché SIOPE identifica gli enti per nome e non con un codice univoco confrontabile:
l’aggregato regionale evita abbinamenti errati. Il perimetro è quello delle aziende operative (ASL, aziende
ospedaliere, IRCCS pubblici, IZS — Istituti Zooprofilattici Sperimentali); sono esclusi la gestione sanitaria accentrata regionale (GSA) e i pagamenti
centrali, che duplicherebbero le uscite delle aziende.</div>
<p class="small muted">Fonte: <a href="${esc(siope.url)}" target="_blank" rel="noopener">RGS/MEF — SIOPE</a>
(BDAP open data), «Movimenti cumulati mensili di Spesa», anno ${siope.anno}, licenza CC BY 3.0.
Dati grezzi: <a href="dati.html">open data</a> (siope.json).</p>
`;

  return page({
    title: 'Dove escono i soldi per cassa: i pagamenti SIOPE della sanità — Ospedali Trasparenti',
    description: `Nel ${siope.anno} le aziende sanitarie pubbliche hanno pagato ${euroCompact(tot)} per cassa: quanto al personale, ai farmaci e ai privati, mese per mese, con il picco di dicembre regione per regione. Dati SIOPE RGS/MEF.`,
    active: 'approfondimenti.html',
    canonical: 'siope.html',
    jsonld,
    body,
  });
}
