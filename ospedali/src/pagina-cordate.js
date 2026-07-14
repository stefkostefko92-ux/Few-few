// Страница „Le cordate" — двойки фирми, които се явяват заедно в конкурентни гари,
// където едната печели, а другата НИКОГА. Възможен cover bidding (OECD).
//
// ⚠️ Изключително предпазливо рамкиране: това е СТАТИСТИЧЕСКИ ИНДИКАТОР, НЕ
// доказателство за картел. Има законни обяснения (специализация, клинично
// предпочитание към марка, тесен пазар). Само юридически лица (P.IVA).

import { page, kpi } from './lib/site-ui.js';
import { euroCompact, numeroIt, percentualeIt, esc } from './lib/format.js';

export function renderCordate({ cordate }) {
  const c = cordate.cordate || [];
  const tot = cordate.totaleCordate || c.length;
  const forte = c[0];

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
<p class="lead">C’è una firma della concorrenza simulata che gli esperti chiamano <em>cover bidding</em>: due imprese si
presentano puntualmente alle stesse gare, ma una vince e l’altra <strong>non vince mai</strong> — come se fosse lì solo
per far numero. Qui isoliamo le coppie di fornitori della sanità che si ritrovano più spesso una di fronte all’altra
con questo schema. <strong>Non è una prova di accordo</strong>: è un indicatore statistico da verificare.</p>
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
    <th scope="col">Vince (quasi) sempre</th>
    <th scope="col">Non vince mai</th>
    <th class="num" scope="col">Gare insieme</th>
    <th class="num" scope="col">Vinte dalla prima</th>
    <th class="num" scope="col">Valore</th>
    <th class="num" scope="col">Stazioni</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<div class="note"><strong>Come leggere — e le cautele.</strong> Questo è l’indicatore più delicato del sito.
Due imprese che concorrono spesso insieme, dove una vince e l’altra resta sempre a mani vuote, <em>possono</em>
disegnare uno schema di gara concordata (una fa la «comparsa» per simulare concorrenza). Ma ci sono spiegazioni
del tutto lecite: mercati di nicchia con pochi operatori, specializzazioni di prodotto, preferenze cliniche verso
una marca, lotti tecnicamente diversi. Per questo:
<ul>
<li>Consideriamo solo <strong>persone giuridiche</strong> (P.IVA a 11 cifre): nessun nome di persona fisica.</li>
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
    body,
  });
}
