// Страница „Gare europee con un solo offerente: il dato TED".
// Показва дела над-прагови EU-търгове с един кандидат в италианското
// здравеопазване — независима кръстосана проверка на сигнала от ANAC.
// Рамка: „indicatore, non prova" — един оферент НЕ е задължително нередност.
//
// Изнесена като отделен модул (не пипаме approfondimenti.js). Стилът следва
// renderPagamenti: класове grid kpis / tablewrap / note / small muted.

import { page, kpi, barChart } from './lib/site-ui.js';
import { euroCompact, numeroIt, percentualeIt, esc } from './lib/format.js';

/** Ред за таблицата на сравнение 33* vs 85*. */
function rigaCpv(etichetta, g) {
  return `<tr><td>${esc(etichetta)}</td>
    <td class="num">${numeroIt(g.nLotti)}</td>
    <td class="num">${numeroIt(g.unOfferente)}</td>
    <td class="num ${(g.quotaUnOfferente || 0) >= 0.4 ? 'neg' : ''}">${percentualeIt(g.quotaUnOfferente)}</td>
    <td class="num">${euroCompact(g.valore)}</td></tr>`;
}

export function renderTed({ ted, jsonld }) {
  const n = ted.nazionale;
  const c33 = ted.perCpv['33'];
  const c85 = ted.perCpv['85'];
  const d = n.distribuzione;
  const annoDa = (ted.periodo?.da || '').slice(0, 4);
  const annoA = (ted.periodo?.a || '').slice(0, 4);

  // Разпределение на броя оферти (1 / 2 / 3 / 4+). barChart оцветява <0 в
  // червено, >0 в зелено — тук всички са положителни, затова показваме дела на
  // „un offerente" отделно в KPI/лентата, а стълбовете държим неутрални по брой.
  const distPoints = [
    ['1', d['1']],
    ['2', d['2']],
    ['3', d['3']],
    ['4+', d['4+']],
  ];

  const body = `
<a class="backlink" href="approfondimenti.html">← Approfondimenti</a>
<h1>Gare europee con un solo offerente: il dato TED</h1>
<p class="lead">Nelle gare sopra-soglia UE della sanità italiana pubblicate su
<strong>TED</strong> tra il ${annoDa} e il ${annoA}, <strong>${percentualeIt(n.quotaUnOfferente)}</strong>
dei lotti aggiudicati ha ricevuto <strong>una sola offerta</strong>. È un controllo indipendente del
segnale «gara a offerente unico»: dove la concorrenza è strutturalmente debole, il committente
tratta di fatto con un unico fornitore.</p>

<div class="grid kpis">
  ${kpi('Lotti analizzati', numeroIt(n.nLotti))}
  ${kpi('Con un solo offerente', numeroIt(n.unOfferente), 'neg')}
  ${kpi('Quota un offerente', percentualeIt(n.quotaUnOfferente), 'neg')}
  ${kpi('Valore delle gare', euroCompact(n.valore))}
</div>

<h2>Quante offerte arrivano per lotto</h2>
<p class="muted small">Numero di offerte ricevute per lotto aggiudicato (codice «tenders» dei bandi TED).
La prima colonna — un’unica offerta — è il caso critico.</p>
${barChart(distPoints, { caption: 'Distribuzione del numero di offerte per lotto — sanità italiana, gare sopra-soglia UE (fonte: TED)' })}

<h2>Attrezzature e farmaci (33*) vs servizi sanitari (85*)</h2>
<p class="muted small">Le due famiglie CPV a confronto: la concorrenza cambia molto tra la fornitura di beni
e i servizi.</p>
<div class="tablewrap"><table>
  <thead><tr>
    <th scope="col">Famiglia CPV</th>
    <th class="num" scope="col">Lotti</th>
    <th class="num" scope="col">Un offerente</th>
    <th class="num" scope="col">Quota</th>
    <th class="num" scope="col">Valore</th>
  </tr></thead>
  <tbody>
    ${rigaCpv('33 — Attrezzature mediche, farmaci', c33)}
    ${rigaCpv('85 — Servizi sanitari e sociali', c85)}
    ${rigaCpv('Totale (lotti unici)', n)}
  </tbody>
</table></div>

<div class="note"><strong>Un solo offerente non è, di per sé, un’irregolarità.</strong> Può dipendere da un
mercato di nicchia (un solo produttore per un dispositivo brevettato), da requisiti tecnici molto specifici
o da una fornitura infungibile. Ma una quota <em>sistematicamente</em> alta di gare con un unico partecipante
è un indicatore di concorrenza debole: meno pressione sui prezzi, più rischio di dipendenza da un fornitore.
È una <strong>pista, non una prova</strong>.</div>

<p class="small muted">Fonte: <a href="${esc(ted.url)}" target="_blank" rel="noopener">TED — Tenders Electronic
Daily</a> (Ufficio delle pubblicazioni UE, riuso libero — Dec. 2011/833/UE). Elaborazione propria sui bandi di
aggiudicazione (<em>contract award notices</em>) per committenti italiani, CPV 33* e 85*, ${annoDa}–${annoA}.
${esc(ted.nota || '')} Dati aggregati: nessun nome di aggiudicatario è conservato o mostrato.</p>
`;

  return page({
    title: 'Gare europee con un solo offerente: il dato TED — Ospedali Trasparenti',
    description: `Nella sanità italiana il ${percentualeIt(n.quotaUnOfferente)} dei lotti delle gare sopra-soglia UE riceve una sola offerta. Il dato TED, controllo indipendente del segnale ANAC.`,
    active: 'approfondimenti.html',
    canonical: 'ted.html',
    jsonld,
    body,
  });
}
