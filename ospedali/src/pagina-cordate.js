// Страница „Le cordate" — двойки фирми, които се явяват заедно в конкурентни гари,
// където едната печели, а другата НИКОГА. Възможен cover bidding (OECD).
//
// ⚠️ Изключително предпазливо рамкиране: това е СТАТИСТИЧЕСКИ ИНДИКАТОР, НЕ
// доказателство за картел. Има законни обяснения (специализация, клинично
// предпочитание към марка, тесен пазар). Само юридически лица (P.IVA).

import { page, kpi } from './lib/site-ui.js';
import { euroCompact, numeroIt, percentualeIt, esc } from './lib/format.js';

export function renderCordate({ cordate, jsonld }) {
  const c = cordate.cordate || [];
  const tot = cordate.totaleCordate || c.length;
  const forte = c[0];
  const vinc = cordate.vincitori || [];
  const vincRows = vinc
    .map(
      (v) => `<tr><td>${esc(v.den)}</td><td class="num">${v.domini}</td>
      <td class="num">${v.vinteTot}/${v.gareTot} <span class="small muted">(${percentualeIt(v.winRate)})</span></td>
      <td class="num">${euroCompact(v.valore)}</td></tr>`
    )
    .join('');
  const vincBlk = vinc.length
    ? `<h2>Chi vince (quasi) sempre: i dominatori locali</h2>
<p class="small muted">Imprese che vincono almeno l’80% delle gare competitive a cui partecipano, presso lo stesso
committente, in almeno 6 gare. «Domìni» = quanti committenti diversi dove si ripete lo schema. Anche qui: può essere
competitività reale o specializzazione, è un <strong>indicatore</strong>.</p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Impresa</th><th class="num" scope="col">Committenti dominati</th><th class="num" scope="col">Gare vinte/partecipate</th><th class="num" scope="col">Valore</th></tr></thead>
  <tbody>${vincRows}</tbody>
</table></div>`
    : '';

  const rows = c
    .map((x) => {
      const dom = x.insieme ? x.vinteDalVincitore / x.insieme : 0;
      return `<tr>
      <td>${esc(x.vincitoreDen)}</td>
      <td>${esc(x.coprDen)}</td>
      <td class="num">${x.insieme}</td>
      <td class="num">${x.vinteDalVincitore} <span class="small muted">(${percentualeIt(dom)})</span></td>
      <td class="num">${euroCompact(x.valore)}</td>
      <td class="num">${x.nAuth}</td></tr>`;
    })
    .join('');

  const body = `
<a class="backlink" href="inchiesta.html">← Inchiesta</a>
<h1>Le «cordate»: chi concorre sempre insieme, e chi non vince mai</h1>
<p class="lead">La letteratura anticorruzione (OECD) descrive uno schema chiamato <em>cover bidding</em>: due imprese si
presentano spesso alle stesse gare, ma una risulta aggiudicataria e l’altra no. Qui isoliamo le coppie di fornitori
della sanità che ricorrono con questo profilo statistico. È un profilo che <em>può</em> avere anche cause del tutto
lecite (mercati di nicchia, specializzazioni, requisiti tecnici). <strong>Non è una prova di accordo</strong>: è un
indicatore da verificare.</p>
<p class="note" style="margin-top:0"><strong>Importante.</strong> L’accostamento di due nomi in questa pagina
<strong>non implica alcun accordo tra le due imprese né alcuna condotta illecita</strong>: è un dato statistico sulle
gare. Ritieni un’informazione inesatta? <a href="note-legali.html#rettifiche">Richiedi una rettifica</a>.</p>
<div class="grid kpis">
  ${kpi('Coppie segnalate', numeroIt(tot))}
  ${forte ? kpi('Coppia più ricorrente', `${forte.insieme} gare insieme`) : ''}
  ${forte ? kpi('…di cui vinte da una sola', `${forte.vinteDalVincitore}`, 'neg') : ''}
  ${forte ? kpi('…vinte dall’altra', '0', 'neg') : ''}
</div>
<h2>Le coppie ricorrenti</h2>
<p class="small muted">Ordinate per numero di gare in cui compaiono entrambe. «Vince» = risulta aggiudicataria di
almeno un lotto della gara; se in una gara vincono entrambe (lotti diversi) la coppia <strong>non</strong> è conteggiata.</p>
<div class="tablewrap"><table>
  <thead><tr>
    <th scope="col">Risulta aggiudicataria</th>
    <th scope="col">Si presenta, non si aggiudica</th>
    <th class="num" scope="col">Gare insieme</th>
    <th class="num" scope="col">Vinte dalla prima</th>
    <th class="num" scope="col">Valore</th>
    <th class="num" scope="col">Stazioni</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table></div>
${vincBlk}
<div class="note"><strong>Come leggere — e le cautele.</strong> Questo è l’indicatore più delicato del sito.
Due imprese che concorrono spesso insieme, dove una si aggiudica la gara e l’altra no, <em>possono</em> — in astratto —
richiamare uno schema di concorrenza solo apparente. Ma nella grande maggioranza dei casi ci sono spiegazioni del tutto
lecite: mercati di nicchia con pochi operatori, specializzazioni di prodotto, preferenze cliniche verso una marca,
lotti tecnicamente diversi. Per questo:
<ul>
<li>Consideriamo solo <strong>società di capitali</strong> (S.p.A., S.r.l., cooperative, consorzi): mai ditte individuali o nomi di persona fisica.</li>
<li>Escludiamo i <strong>raggruppamenti</strong> (ATI, consorzi, avvalimento): lì le imprese sono <em>alleate</em> nella stessa offerta, non rivali.</li>
<li>Contiamo <strong>tutti</strong> gli aggiudicatari di una gara (per lotto): se entrambe vincono qualcosa, la coppia non è segnalata.</li>
</ul>
È un <strong>punto di partenza per una verifica</strong>, non un verdetto. La sede competente per gli accordi
di gara è l’<a href="https://www.agcm.it/" target="_blank" rel="noopener">Autorità Garante della Concorrenza (AGCM)</a>;
per la titolarità delle imprese, il Registro Imprese.</div>
<p class="small muted">Fonte: ${esc(cordate.fonte)}. Soglie: almeno ${cordate.soglie.insieme} gare insieme, la vincitrice ne
vince almeno ${cordate.soglie.minVittorie}, l’altra nessuna; escluse le gare con più di ${cordate.soglie.maxPartecipanti}
concorrenti. Dati grezzi: <a href="dati.html">open data</a> (cordate.json).</p>
`;
  return page({
    title: 'Le cordate: chi concorre sempre insieme e chi non vince mai — Ospedali Trasparenti',
    description: 'Coppie di imprese che concorrono spesso alle stesse gare sanitarie dove una vince e l’altra non vince mai: un indicatore di possibile cover bidding, da verificare. Dati ANAC.',
    active: 'inchiesta.html',
    canonical: 'cordate.html',
    jsonld,
    body,
  });
}
