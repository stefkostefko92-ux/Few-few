// @ts-check
// Страница „Appalti" (ANAC), блокът за поръчки и регистърът на договорите в
// детайлната страница, плюс CSV експорта. Изнесени дословно от build-site.js.

import { esc, euroCompact, percentualeIt, numeroIt } from '../lib/format.js';
import { page, kpi, hbars } from '../lib/site-ui.js';
import { rangeAnni, articleLd } from '../lib/site-shared.js';
import { renderFornitori } from './fornitori.js';

/** @typedef {import('../lib/dataset.js').Ente} Ente */
/** @typedef {import('../lib/models.js').AppaltiData} AppaltiData */
/** @typedef {import('../lib/models.js').Autorita} Autorita */
/** @typedef {import('../lib/models.js').AppMatch} AppMatch */
/** @typedef {import('../lib/models.js').ContrattoTop} ContrattoTop */

/** @type {Record<string, string>} */
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
/**
 * @param {object} p
 * @param {AppaltiData} p.appalti
 * @param {Map<string, Autorita>} p.appByCod
 * @param {AppMatch|null} p.appMatch
 * @param {Ente[]} p.enti
 * @param {(cod: string) => string} p.href
 * @returns {string}
 */
export function renderAppalti({ appalti, appByCod, appMatch, enti, href }) {
  const nz = appalti.nazionale;
  const codByCf = new Map();
  for (const e of enti) {
    const a = appByCod.get(e.codice);
    if (a) codByCf.set(a.cf, e.codice);
  }
  const anniTxt = rangeAnni(appalti.anni);

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
    .sort((a, b) => (b.quotaSenzaGaraNum ?? 0) - (a.quotaSenzaGaraNum ?? 0))
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
  ${kpi(`Spesa senza gara (${anniTxt})`, percentualeIt(nz.quotaSenzaGara), (nz.quotaSenzaGara || 0) > 0.4 ? 'neg' : '')}
  ${kpi('Contratti senza gara (sul numero)', percentualeIt(nz.quotaSenzaGaraNum), (nz.quotaSenzaGaraNum || 0) > 0.4 ? 'neg' : '')}
  ${kpi('Valore messo a gara', euroCompact(nz.importo))}
  ${kpi('Contratti (lotti)', numeroIt(nz.n))}
</div>

<div class="note" style="margin-top:18px"><strong>Cosa significa «senza gara».</strong> L’affidamento diretto e la
procedura negoziata senza pubblicazione assegnano il contratto <em>senza confronto competitivo</em>. Sotto certe soglie
è legittimo e più rapido, ma un ricorso sistematico è la spia classica di inefficienza o favoritismi. Gli acquisti in
adesione ad accordi quadro/convenzioni (es. Consip/centrali regionali) sono invece già stati messi a gara e non contano
come «senza gara».</div>
<div class="note"><strong>Nota sugli importi.</strong> I valori sono <strong>importi messi a gara (base d’asta / valore
del lotto)</strong>, non la spesa effettivamente pagata: gli accordi quadro hanno massimali molto superiori alla spesa
reale. Sono quindi utili per <strong>confrontare</strong> enti e regioni, non come misura della spesa sostenuta. Per
questo il segnale principale è la <strong>quota (in %), non il valore assoluto</strong>.</div>
<div class="note"><strong>Attenzione alla serie storica.</strong> Dal 2024 il nuovo Codice dei contratti
(D.Lgs. 36/2023) e le piattaforme di e-procurement certificate fanno confluire nella banca dati anche i
<strong>micro-acquisti</strong> (prima registrati separatamente) e alzano la soglia dell’affidamento diretto:
la quota «senza gara» del 2024–2025 risulta perciò <strong>molto più alta e non confrontabile</strong> con gli anni
precedenti. Il confronto utile resta quello <strong>tra enti e regioni nello stesso periodo</strong>, non nel tempo.
→ <a href="storico.html">Come è cambiata la serie</a></div>

<h2>Le regioni a confronto</h2>
<p class="muted small">Ordinate per quota di contratti affidati senza gara. «Senza gara %» sul numero di contratti,
«sul valore» sugli importi.</p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Regione</th><th class="num" scope="col">Valore appalti</th><th class="num" scope="col">Senza gara %</th><th class="num" scope="col">sul valore</th><th class="num" scope="col">Contratti</th></tr></thead>
  <tbody>${regRows}</tbody>
</table></div>

<h2>Le aziende con più appalti senza gara</h2>
<p class="muted small">Solo enti con almeno 20 mln € e 100 contratti nel periodo, per quota sul numero di contratti.
I nomi collegati hanno una scheda.</p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Azienda</th><th class="num" scope="col">Senza gara %</th><th class="num" scope="col">sul valore</th><th class="num" scope="col">Valore appalti</th></tr></thead>
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
    ogType: 'article',
    jsonld: articleLd('Gli appalti della sanità pubblica italiana', 'Quota di spesa senza gara, affidamenti diretti e confronto tra regioni dai dati ANAC.', 'appalti.html'),
    body,
  });
}

/**
 * Класация: възложители с най-много търгове с един кандидат.
 * @param {AppMatch|null} appMatch
 * @param {Map<string, string>} codByCf
 * @param {(cod: string) => string} href
 * @returns {string}
 */
function renderOfferenteUnico(appMatch, codByCf, href) {
  if (!appMatch?.aggiu) return '';
  const { aggiu, autByCf } = appMatch;
  const list = Object.entries(aggiu.perCf)
    .filter(([, v]) => v.gareConPartecipanti >= 50 && v.quotaUnicoOfferente != null)
    .map(([cf, v]) => ({ cf, ...v, aut: autByCf?.get(cf) }))
    .filter((x) => x.aut)
    .sort((a, b) => (b.quotaUnicoOfferente ?? 0) - (a.quotaUnicoOfferente ?? 0))
    .slice(0, 15);
  if (!list.length) return '';
  const rows = list
    .map((x) => {
      const aut = x.aut;
      if (!aut) return ''; // невъзможно след filter — само стеснява типа
      const cod = codByCf.get(x.cf);
      const nome = cod ? `<a href="${href(cod)}">${esc(aut.den)}</a>` : esc(aut.den);
      return `<tr><td>${nome}<div class="small muted">${esc(aut.reg)}</div></td>
        <td class="num neg">${percentualeIt(x.quotaUnicoOfferente)}</td>
        <td class="num">${numeroIt(x.gareUnicoOfferente)}/${numeroIt(x.gareConPartecipanti)}</td></tr>`;
    })
    .join('');
  return `<h2>Gare con un solo offerente registrato</h2>
<p class="muted small">Quota delle gare in cui, <strong>sui dati disponibili</strong> dei partecipanti, risulta
una sola impresa. Solo enti con almeno 50 gare.</p>
<div class="note">La banca dati dei partecipanti ANAC è <strong>parziale</strong> (copre circa metà delle gare e talvolta
registra solo l’aggiudicatario): queste quote sono <strong>indicative e da intendersi come limite superiore</strong>.
Un solo offerente può derivare da mercati ristretti, esclusive, brevetti, infungibilità tecnica o urgenze —
è un <strong>indicatore da verificare, non una prova di irregolarità</strong>; nessun addebito è mosso ai soggetti citati.
I raggruppamenti di imprese (RTI) sono conteggiati come più offerte.</div>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Azienda</th><th class="num" scope="col">Offerente unico</th><th class="num" scope="col">Gare</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>`;
}

/**
 * @typedef {object} Contratto пълен договор от data/contratti/<codice>.json
 * @property {string} [cig]
 * @property {string} [data]
 * @property {string} [oggetto]
 * @property {number} importo
 * @property {string} [procedura]
 * @property {string} [cpv]
 * @property {string} [fornitore]
 * @property {string} [fornitoreCf]
 * @property {boolean} [fornitoreAzienda]
 * @property {string} categoria
 */

// ---------- РЕГИСТЪР НА ДОГОВОРИТЕ (маниакален детайл) ----------
/**
 * @param {unknown} v
 * @returns {string}
 */
function csvCell(v) {
  let s = String(v ?? '');
  // Неутрализирай CSV formula injection: клетка, започваща с формула-знак, може
  // да се изпълни при отваряне в Excel/Sheets. Числата (вкл. отрицателни) пазим.
  if (/^[=+@\t\r]/.test(s) || (s.startsWith('-') && !/^-?\d/.test(s))) s = `'${s}`;
  return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
/**
 * Пълен CSV с всеки договор — сваляемият, проверим до последния евро запис.
 * @param {Ente} ente
 * @param {Contratto[]} list
 * @returns {string}
 */
export function contrattiCsv(ente, list) {
  const head = 'cig;data;oggetto;importo_euro;procedura;cpv;fornitore';
  const lines = list.map((c) =>
    [c.cig, c.data, c.oggetto, c.importo, c.procedura, c.cpv, c.fornitore || ''].map(csvCell).join(';')
  );
  return `# Ospedali Trasparenti — contratti pubblici di ${ente.denominazione} (ANAC)\n` + `# ${list.length} contratti. Importi = valore messo a gara. Fonte: dati.anticorruzione.it\n` + head + '\n' + lines.join('\n') + '\n';
}

/** @param {string} [p] */
const PROC_ABBR = (p) => (p || '').replace(/AFFIDAMENTO DIRETTO IN ADESIONE AD ACCORDO QUADRO\/CONVENZIONE/i, 'Affid. diretto (accordo quadro)').replace(/AFFIDAMENTO DIRETTO/i, 'Affidamento diretto').replace(/PROCEDURA NEGOZIATA SENZA PREVIA PUBBLICAZIONE/i, 'Negoziata senza bando').replace(/PROCEDURA APERTA/i, 'Procedura aperta');

/**
 * Регистър на договорите в детайлната страница (топ N inline + пълен CSV).
 * @param {Ente} ente
 * @param {Contratto[]|null} list
 * @returns {string}
 */
export function contrattiBlock(ente, list) {
  if (!list || !list.length) return '';
  const MAX_INLINE = 300;
  const totale = list.reduce((s, c) => s + c.importo, 0);
  const shown = list.slice(0, MAX_INLINE);
  const rows = shown
    .map((c) => {
      const flag = c.categoria === 'diretto' || c.categoria === 'negoziataSenza';
      return `<tr data-t="${esc(((c.oggetto || '') + ' ' + (c.fornitore || '')).toLowerCase())}">
      <td class="small">${esc(c.data)}</td>
      <td>${esc(c.oggetto || '—')}<div class="small muted">CIG ${esc(c.cig)}${c.cpv ? ' · ' + esc(c.cpv) : ''}</div></td>
      <td>${esc(c.fornitore || '—')}</td>
      <td class="small${flag ? ' neg' : ''}">${esc(PROC_ABBR(c.procedura))}</td>
      <td class="num">${euroCompact(c.importo)}</td></tr>`;
    })
    .join('');
  return `<h2>Registro dei contratti <span class="small muted">(${numeroIt(list.length)} contratti ANAC, ${euroCompact(totale)} messi a gara)</span></h2>
<p class="muted small">Ogni contratto pubblico dell’azienda: <strong>cosa, a chi, quando, quanto e con quale procedura</strong>.
Il CIG è il codice univoco verificabile su ANAC. Importi = valore messo a gara. Gli operatori persone fisiche non sono nominati.</p>
<p><a class="chip" href="../contratti/${ente.codice}.csv" download>⬇ Scarica l’elenco completo (CSV, ${numeroIt(list.length)} contratti)</a></p>
<div class="controls"><input type="search" id="cq" placeholder="Cerca oggetto o fornitore…" aria-label="Cerca nei contratti"></div>
<p class="small muted" id="ccount"></p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Data</th><th scope="col">Oggetto</th><th scope="col">Fornitore</th><th scope="col">Procedura</th><th class="num" scope="col">Importo</th></tr></thead>
  <tbody id="crows">${rows}</tbody>
</table></div>
${list.length > MAX_INLINE ? `<p class="small muted">Mostrati i ${MAX_INLINE} contratti di importo maggiore su ${numeroIt(list.length)}. L’elenco completo è nel <a href="../contratti/${ente.codice}.csv" download>CSV</a>.</p>` : ''}
<script>
(function(){
  var q=document.getElementById('cq'),rows=[].slice.call(document.querySelectorAll('#crows tr')),cc=document.getElementById('ccount');
  function apply(){var t=q.value.trim().toLowerCase(),n=0;rows.forEach(function(r){var ok=!t||r.dataset.t.indexOf(t)>=0;r.classList.toggle('hidden',!ok);if(ok)n++;});cc.textContent=n+' contratti mostrati';}
  q.addEventListener('input',apply);apply();
})();
</script>`;
}

/**
 * Блок за поръчките в детайлната страница (при свързан възложител).
 * @param {Autorita|undefined} app
 * @param {AppMatch|null} appMatch
 * @returns {string}
 */
export function appaltiBlock(app, appMatch) {
  if (!app) return '';
  const items = /** @type {import('../lib/site-ui.js').HbarItem[]} */ (
    PROC_ORDER.map((k) => app.cat[k] && app.cat[k].importo > 0 && ({
      label: PROC_LABEL[k],
      valore: app.cat[k].importo,
      quota: app.importo > 0 ? app.cat[k].importo / app.importo : 0,
      flag: k === 'diretto' || k === 'negoziataSenza',
    })).filter(Boolean)
  );
  const sgNum = app.quotaSenzaGaraNum;
  const sgVal = app.quotaSenzaGara;
  const med = appMatch?.medianaSenzaGaraNum;
  // минимален брой договори — иначе малка извадка дава подвеждащ флаг
  const flagSg = sgNum != null && med != null && app.n >= 50 && sgNum > Math.max(0.65, med * 1.4);
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
  const flagSb = ag != null && sbQ != null && ag.gareConPartecipanti >= 20 && sbQ > 0.6;
  const concQ = ag?.top1Quota;
  const flagConc = ag != null && concQ != null && ag.valoreAggiudicato >= 10_000_000 && concQ > 0.5;
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
      ${flagSb ? `<div class="seg alta" style="margin-top:12px"><div class="t"><span class="badge alta">!</span> <span>Gare con un solo offerente registrato</span></div><div class="d">Sui dati (parziali) dei partecipanti, il ${percentualeIt(sbQ)} delle gare (${numeroIt(ag.gareUnicoOfferente)}/${numeroIt(ag.gareConPartecipanti)}) risulta con una sola offerta. Indicatore da verificare — può derivare da mercati ristretti, esclusive o urgenze; non è prova di irregolarità.</div></div>` : ''}
      ${flagConc ? `<div class="seg alta" style="margin-top:12px"><div class="t"><span class="badge alta">!</span> <span>Elevata concentrazione su un fornitore</span></div><div class="d">Il ${percentualeIt(concQ)} del valore aggiudicato va a un solo operatore${ag.topFornitori[0].azienda ? ` (${esc(ag.topFornitori[0].den)})` : ''}. Può essere legittimo (mercato ristretto, esclusiva); è un indicatore, non una prova.</div></div>` : ''}
      ${fornRows ? `<h3>Principali fornitori</h3><div class="tablewrap"><table><thead><tr><th scope="col">Fornitore</th><th class="num" scope="col">Valore aggiudicato</th><th class="num" scope="col">Contratti</th></tr></thead><tbody>${fornRows}</tbody></table></div><p class="small muted">Essere fornitore rilevante è legittimo; le persone fisiche non sono nominate.</p>` : ''}`
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
    ${top ? `<h3>Contratti più grandi</h3><div class="tablewrap"><table><thead><tr><th scope="col">Oggetto</th><th scope="col">Procedura</th><th class="num" scope="col">Importo</th></tr></thead><tbody>${top}</tbody></table></div>` : ''}
    <p class="small muted">Fonte: <a href="https://dati.anticorruzione.it/opendata">ANAC</a> (CIG, aggiudicatari, partecipanti), gare > 40.000 € pubblicate negli anni considerati.</p>`;
}
