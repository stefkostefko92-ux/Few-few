// Страница „Колко участват реално в търговете" — обогатяване от ANAC aggiudicazioni:
// реален брой оференти (offerente unico по-точно), ribasso при конкурентните
// процедури, критерий за възлагане, и закъснения от stati-avanzamento.

import { page, kpi, barChart } from './lib/site-ui.js';
import { numeroIt, percentualeIt, esc } from './lib/format.js';

const CAT_LABEL = {
  competitiva: 'Procedure competitive (aperta/ristretta)',
  negoziata: 'Negoziata con gara',
  quadro: 'Adesione a convenzione/accordo quadro',
  negoziataSenza: 'Negoziata senza bando',
  diretto: 'Affidamento diretto',
  altro: 'Altro',
};
const f1 = (x) => (x == null ? '—' : x.toLocaleString('it-IT', { maximumFractionDigits: 1 }));

export function renderAggiudicazioni({ agg }) {
  const a = agg.aggiudicazioni;
  const comp = a.perCategoria.competitiva || { n: 0, conOfferenti: 0, quotaUnOfferente: null };
  const d = a.distribuzione;
  const distrTot = d[1] + d[2] + d[3] + d['4+'] || 1;
  const sal = agg.ritardi.statiAvanzamento;

  // Ред per категория: дял с един оферент (там, където има данни за оферти).
  const ordine = ['competitiva', 'negoziata', 'quadro', 'negoziataSenza', 'diretto'];
  const rows = ordine
    .map((k) => ({ k, v: a.perCategoria[k] }))
    .filter(({ v }) => v && v.conOfferenti > 0)
    .map(({ k, v }) =>
      `<tr><td>${esc(CAT_LABEL[k] || k)}</td><td class="num">${numeroIt(v.conOfferenti)}</td>
      <td class="num ${v.quotaUnOfferente > 0.4 ? 'neg' : ''}">${percentualeIt(v.quotaUnOfferente)}</td></tr>`
    )
    .join('');

  const barPts = [
    ['1 offerta', d[1]],
    ['2', d[2]],
    ['3', d[3]],
    ['4+', d['4+']],
  ];

  const body = `
<h1>Quanti partecipano davvero alle gare della sanità</h1>
<p class="lead">Il dato ANAC sulle <em>aggiudicazioni</em> dice una cosa che il bando da solo non dice: quante
imprese hanno davvero presentato un’offerta. Tra le <strong>procedure competitive</strong> della sanità —
quelle che dovrebbero attirare più concorrenti — in <strong>${percentualeIt(comp.quotaUnOfferente)}</strong> dei casi
si è presentato <strong>un solo offerente</strong>. Un mercato con un concorrente solo non è per forza irregolare,
ma è un mercato che non fa il suo mestiere: senza confronto, il prezzo non scende.</p>
<div class="grid kpis">
  ${kpi('Aggiudicazioni analizzate', numeroIt(a.nAgg))}
  ${kpi('Con un solo offerente (competitive)', percentualeIt(comp.quotaUnOfferente), 'neg')}
  ${kpi('Ribasso mediano (competitive)', a.ribassoCompMediano != null ? f1(a.ribassoCompMediano) + '%' : '—')}
  ${kpi('SAL in ritardo', sal.quotaRitardo != null ? percentualeIt(sal.quotaRitardo) : '—', sal.quotaRitardo > 0.1 ? 'neg' : 'pos')}
</div>
<h2>Quante offerte arrivano, per gara</h2>
${barChart(barPts, { caption: `Distribuzione del numero di offerenti (${numeroIt(distrTot)} gare con dato disponibile)` })}
<h2>Un solo offerente, per tipo di procedura</h2>
<p>Nelle procedure aperte l’offerente unico è un segnale; negli affidamenti diretti è la norma (per definizione
c’è un solo operatore contattato). Ecco perché il confronto conta.</p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Tipo di procedura</th><th class="num" scope="col">Gare con dato</th><th class="num" scope="col">Un offerente</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<h2>E i tempi? I ritardi dichiarati</h2>
<p>Dagli stati di avanzamento lavori (SAL) risulta che la grande maggioranza dei lavori è «in linea»: solo
<strong>${sal.quotaRitardo != null ? percentualeIt(sal.quotaRitardo) : '—'}</strong> dei ${numeroIt(sal.nSal)} SAL della sanità
è dichiarato in ritardo. Un dato che, se preso alla lettera, racconta una sanità puntuale — o una compilazione
generosa del campo.</p>
<div class="note"><strong>Come leggere.</strong> Il numero di offerenti è compilato solo per una parte delle
aggiudicazioni (${numeroIt(a.conOfferenti)} su ${numeroIt(a.nAgg)}): il dato di copertura non è totale e va preso come
<em>campione</em>, non come censimento. «Un offerente» è un <strong>indicatore</strong> di scarsa concorrenza, non
una prova di irregolarità: può dipendere da mercati di nicchia, requisiti stringenti o tempi troppo corti. La lettura
onesta è comparativa: dove l’offerente unico è sistematico, vale la pena guardare più da vicino.</p></div>
<p class="small muted">Fonte: <a href="${esc(agg.url)}" target="_blank" rel="noopener">ANAC — BDNCP</a>: dataset
<em>aggiudicazioni</em> e <em>stati-avanzamento</em>, incrociati con i CIG sanitari 2023–2024 (CC BY-SA 4.0).</p>
`;
  return page({
    title: 'Quanti partecipano davvero alle gare della sanità — Ospedali Trasparenti',
    description: `Nelle procedure competitive della sanità italiana un solo offerente nel ${percentualeIt(comp.quotaUnOfferente)} dei casi. Numero di offerte, ribassi e ritardi dai dati ANAC.`,
    active: 'approfondimenti.html',
    canonical: 'aggiudicazioni.html',
    body,
  });
}
