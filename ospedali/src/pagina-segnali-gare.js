// Страница „I semafori delle gare" — табло с процедурните индикатори за риск.
// Всеки е ИНДИКАТОР, не доказателство. Числа национално + топ възложители.

import { page, kpi } from './lib/site-ui.js';
import { euroCompact, numeroIt, percentualeIt, esc } from './lib/format.js';

function tabella(righe, colonne) {
  if (!righe || !righe.length) return '<p class="small muted">Nessun dato sufficiente.</p>';
  const head = colonne.map((c) => `<th class="${c.num ? 'num' : ''}" scope="col">${esc(c.t)}</th>`).join('');
  const body = righe
    .map((r) => `<tr>${colonne.map((c) => `<td class="${c.num ? 'num' : ''}">${c.f(r)}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function renderSegnaliGare({ seg, jsonld }) {
  const n = seg.nazionale;
  const rz = n.ribassoZero, tb = n.termineBreve, ss = n.sottoSoglia, fr = n.frazionamento, iu = n.invitatiUnico, sa = n.subappalto;

  const body = `
<a class="backlink" href="inchiesta.html">← Inchiesta</a>
<h1>I semafori delle gare: sei indicatori di rischio</h1>
<p class="lead">Non tutte le gare a rischio sono uguali. La letteratura anticorruzione (OECD, ANAC, l’indice di
Fazekas) individua alcuni segnali ricorrenti: tempi troppo stretti, importi appena sotto le soglie, ribassi nulli,
inviti che restano lettera morta. Qui li misuriamo per la sanità pubblica. <strong>Ognuno è un indicatore, non una
prova</strong>: possono avere spiegazioni lecite. Servono a sapere <em>dove guardare</em>.</p>
<div class="grid kpis">
  ${kpi('Termine offerte breve', tb && tb.quota != null ? percentualeIt(tb.quota) : '—', tb && tb.quota > 0.15 ? 'neg' : '')}
  ${kpi('Importi sotto soglia UE', ss ? numeroIt(ss.sotto) : '—')}
  ${kpi('Cluster di frazionamento', fr ? numeroIt(fr.cluster) : '—', 'neg')}
  ${rz ? kpi('Ribasso ≈ zero (competitive)', rz.quota != null ? percentualeIt(rz.quota) : '—', rz.quota > 0.1 ? 'neg' : '') : ''}
  ${iu ? kpi('Invitati, ma un solo offerente', numeroIt(iu.n)) : ''}
  ${sa ? kpi('Contratti con subappalto', sa.quota != null ? percentualeIt(sa.quota) : '—') : ''}
</div>

<h2>1 · Tempi troppo stretti per presentare offerta</h2>
<p class="small muted">Gare competitive con meno di 10 giorni tra pubblicazione e scadenza: un termine compresso può
tagliare fuori chi non era già informato. A livello nazionale ${tb ? `${numeroIt(tb.n)} gare su ${numeroIt(tb.base)}` : '—'}.</p>
${tabella(seg.topTermineBreve, [
    { t: 'Committente', f: (r) => esc(r.den) },
    { t: 'Gare brevi', num: true, f: (r) => numeroIt(r.n) },
    { t: 'Quota', num: true, f: (r) => percentualeIt(r.quota) },
  ])}

<h2>2 · Importi appena sotto la soglia europea</h2>
<p class="small muted">Gare con valore poco sotto la soglia che obbligherebbe alla pubblicazione UE (più concorrenza).
Nazionale: ${ss ? `${numeroIt(ss.sotto)} appena sotto contro ${numeroIt(ss.sopra)} appena sopra` : '—'}${ss && ss.rapporto ? ` (rapporto ${ss.rapporto.toLocaleString('it-IT', { maximumFractionDigits: 2 })})` : ''}.</p>
${tabella(seg.topSottoSoglia, [
    { t: 'Committente', f: (r) => esc(r.den) },
    { t: 'Gare sotto soglia', num: true, f: (r) => numeroIt(r.n) },
  ])}

<h2>3 · Possibile frazionamento artificiale</h2>
<p class="small muted">Tre o più affidamenti diretti per lo stesso settore (CPV) allo stesso committente entro 30 giorni,
ciascuno sotto una soglia prudenziale di 40.000 € (soglia scelta come segnale conservativo, non come limite di legge)
ma insieme oltre: possibile spacchettamento per evitare la gara. Nazionale:
${fr ? `${numeroIt(fr.cluster)} cluster, ${euroCompact(fr.valore)}` : '—'}.</p>
${tabella(seg.topFrazionamento, [
    { t: 'Committente', f: (r) => esc(r.den) },
    { t: 'Cluster', num: true, f: (r) => numeroIt(r.cluster) },
    { t: 'Valore', num: true, f: (r) => euroCompact(r.valore) },
  ])}

${rz && seg.topRibassoZero && seg.topRibassoZero.length ? `<h2>4 · Vittorie con ribasso quasi nullo</h2>
<p class="small muted">Gare competitive (con almeno due offerenti) aggiudicate con uno sconto ≤ 0,5%: in un mercato
concorrenziale il prezzo scende. Nazionale: ${numeroIt(rz.n)} su ${numeroIt(rz.base)} (${percentualeIt(rz.quota)}).</p>
${tabella(seg.topRibassoZero, [
    { t: 'Committente', f: (r) => esc(r.den) },
    { t: 'Gare ribasso ≈0', num: true, f: (r) => numeroIt(r.n) },
    { t: 'Quota', num: true, f: (r) => percentualeIt(r.quota) },
  ])}` : ''}

<div class="note"><strong>Come leggere.</strong> Questi indicatori nascono dai dataset ANAC delle gare sanitarie.
Ciascuno può avere spiegazioni legittime: un termine breve per un’urgenza reale, un importo vicino alla soglia per
coincidenza, affidamenti ravvicinati per esigenze diverse, un ribasso basso su un prezzo già calmierato. Sono
<strong>segnali per una verifica</strong> — dal CIG alla determina, fino all’accesso civico — non conclusioni.
Le soglie sono scelte prudenti e dichiarate; i numeri per singola gara sono tutti tracciabili. Ritieni un dato
inesatto? <a href="note-legali.html#rettifiche">Richiedi una rettifica</a>.</div>
<p class="small muted">Fonte: ${esc(seg.fonte)}. Dati grezzi: <a href="dati.html">open data</a> (segnali-gare.json).</p>
`;
  return page({
    title: 'I semafori delle gare: gli indicatori di rischio negli appalti sanitari — Ospedali Trasparenti',
    description: 'Tempi stretti, importi sotto soglia, frazionamento, ribassi nulli, inviti a vuoto, subappalto: gli indicatori di rischio sulle gare della sanità pubblica italiana. Dati ANAC.',
    active: 'inchiesta.html',
    canonical: 'segnali-gare.html',
    jsonld,
    body,
  });
}
