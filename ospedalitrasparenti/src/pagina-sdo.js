// Страница „Volumi degli ospedali" (SDO) — обемите на болничната дейност:
// колко изписвания прави всеки регион и всяка структура, нормализирано на
// 1.000 жители. Рамка: обемът е МЯРКА за натоварване, не оценка за качество —
// големите числа са хъбове, не аномалия.
//
// Изнася само render функцията; данните се подават от build-site.js:
//   sdo         = обектът от data/sdo.json (aggrega)
//   popolazione = обектът от data/popolazione.json (.regioni[key], .italia)
//   nomeReg     = (key) → четимо име на региона (при липса покажи ключа)

// @ts-check
import { page, kpi, hbars } from './lib/site-ui.js';
import { numeroIt, esc } from './lib/format.js';

/**
 * @param {{ sdo: { perRegione: Record<string, any>, perStruttura: Record<string, any>, nazionale: { dimissioni: number, strutture: number }, anno: number, url: string }, popolazione: { regioni?: Record<string, number>, italia?: number }, nomeReg: ((k: string) => string)|unknown, jsonld: Record<string, unknown>|null }} p
 * @returns {string}
 */
export function renderSdo({ sdo, popolazione, nomeReg, jsonld }) {
  /** @type {Record<string, number>} */
  const pop = popolazione && popolazione.regioni ? popolazione.regioni : {};
  /** @type {(k: string) => string} */
  const nome = typeof nomeReg === 'function' ? /** @type {(k: string) => string} */ (nomeReg) : (k) => k;

  // изписвания на 1.000 жители (обем / население × 1000)
  /** @param {number} dim @param {string} key @returns {number|null} */
  const per1000 = (dim, key) => {
    const p = pop[key];
    return p ? (dim / p) * 1000 : null;
  };

  // таблица по региони, подредена по обем
  const regRows = Object.entries(sdo.perRegione)
    .map(([key, g]) => ({ key, ...g, p1000: per1000(g.dimissioni, key) }))
    .sort((a, b) => b.dimissioni - a.dimissioni);

  const righe = regRows
    .map((r) => {
      const etichetta = esc(nome(r.key) || r.key);
      const link = `<a href="regione/${r.key}.html">${etichetta}</a>`;
      return `<tr><td>${link}</td>
      <td class="num">${numeroIt(r.dimissioni)}</td>
      <td class="num">${numeroIt(r.strutture)}</td>
      <td class="num">${r.p1000 == null ? '—' : numeroIt(Math.round(r.p1000))}</td></tr>`;
    })
    .join('');

  // топ 15 структури по обем (дял от националния тотал)
  const totNaz = sdo.nazionale.dimissioni || 1;
  const topStrutture = Object.values(sdo.perStruttura)
    .sort((a, b) => b.dimissioni - a.dimissioni)
    .slice(0, 15)
    .map((s) => ({
      label: s.denominazione,
      valore: s.dimissioni,
      quota: s.dimissioni / totNaz,
    }));
  const barre = hbars(topStrutture, {
    fmt: numeroIt,
    maxLabel: 'Prime 15 strutture per numero di dimissioni (quota sul totale nazionale)',
  });

  // средно национално на 1.000 жители
  const mediaNaz =
    popolazione && popolazione.italia ? (totNaz / popolazione.italia) * 1000 : null;

  const body = `
<h1>I volumi degli ospedali: quanti ricoveri, dove</h1>
<p class="lead">Nel ${sdo.anno} le strutture di ricovero pubbliche e private accreditate hanno registrato
<strong>${numeroIt(sdo.nazionale.dimissioni)}</strong> dimissioni ospedaliere in ${numeroIt(sdo.nazionale.strutture)}
strutture. È la misura più diretta di <em>quanto lavora</em> un ospedale: il numero di pazienti che ne escono in un
anno. Serve a leggere tutto il resto — un bilancio grande è normale se i ricoveri sono tanti.</p>
<div class="grid kpis">
  ${kpi(`Dimissioni (${sdo.anno})`, numeroIt(sdo.nazionale.dimissioni))}
  ${kpi('Strutture', numeroIt(sdo.nazionale.strutture))}
  ${kpi('Dimissioni per 1.000 abitanti', mediaNaz == null ? '—' : numeroIt(Math.round(mediaNaz)))}
</div>
<h2>Regione per regione</h2>
<p class="muted small">Dimissioni totali del ${sdo.anno} e <strong>dimissioni ogni 1.000 abitanti</strong> (volume diviso
la popolazione residente): normalizza il dato grezzo e rende confrontabili regioni di dimensioni diverse.</p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Regione</th><th class="num" scope="col">Dimissioni</th>
  <th class="num" scope="col">Strutture</th><th class="num" scope="col">Per 1.000 abitanti</th></tr></thead>
  <tbody>${righe}</tbody>
</table></div>
<h2>Le strutture con più ricoveri</h2>
<p class="muted small">Le prime 15 strutture per numero di dimissioni, con la quota sul totale nazionale. Sono i grandi
poli — policlinici universitari, IRCCS, ospedali hub — dove si concentra la casistica complessa.</p>
${barre}
<div class="note"><strong>Come leggere (e i limiti).</strong> Il dato SDO è riferito al ${sdo.anno}: le schede di
dimissione vengono consolidate con circa due anni di ritardo, quindi è la fotografia completa più recente disponibile.
Un volume alto <strong>non è un’anomalia</strong>: i grandi ospedali hub attraggono pazienti da tutta Italia (vedi la
<a href="mobilita.html">mobilità sanitaria</a>) e trattano i casi più complessi. Il «costo per dimissione» — quanto
spende una struttura per ogni paziente dimesso — si ottiene incrociando questi volumi con i costi di bilancio: è la
normalizzazione che rende confrontabili strutture di taglia diversa, ed è un <em>indicatore, non una prova</em> di
efficienza o inefficienza.</div>
<p class="small muted">Fonte: <a href="${esc(sdo.url)}" target="_blank" rel="noopener">Ministero della Salute —
Schede di Dimissione Ospedaliera (SDO)</a>, dati aperti «per tipologia di dimissione» (${sdo.anno}), licenza IODL 2.0.
Alcuni valori piccoli sono oscurati alla fonte per tutela della riservatezza. Popolazione residente: Istat.
Dati grezzi: <a href="dati.html">open data</a> (sdo.json).</p>
`;

  return page({
    title: 'I volumi degli ospedali: quanti ricoveri e dove — Ospedali Trasparenti',
    description: `${numeroIt(sdo.nazionale.dimissioni)} dimissioni ospedaliere nel ${sdo.anno}: i volumi di attività per regione e per struttura, normalizzati per abitante. Dati SDO del Ministero della Salute.`,
    active: 'approfondimenti.html',
    canonical: 'sdo.html',
    jsonld,
    body,
  });
}
