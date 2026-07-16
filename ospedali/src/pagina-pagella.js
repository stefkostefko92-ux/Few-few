// @ts-check
// Страница „La pagella delle strutture" — обзор на 5-те спии за всички
// структури, подредени по брой светнали лампи. НЕ е „класация на лошите":
// формулировките броят индикатори за проверка, не издават присъди — това е
// изрично казано в увода, в бележката и в легендата (правна рамка на проекта).

import { esc, numeroIt } from './lib/format.js';
import { page, kpi } from './lib/site-ui.js';

/** @typedef {import('./lib/pagella.js').Spia} Spia */

/**
 * @typedef {object} RigaPagella
 * @property {string} codice
 * @property {string} denominazione
 * @property {string} regione
 * @property {Spia[]} spie
 * @property {{ rosse: number, gialle: number, verdi: number, nd: number }} conti
 */

/** Малка цветна точка за една спия. @param {Spia} s @returns {string} */
function lampada(s) {
  return `<span class="dot ${s.stato}" title="${esc(s.label)}: ${esc(s.dettaglio)}" aria-label="${esc(s.label)}: ${esc(s.stato === 'nd' ? 'dato non disponibile' : s.stato)}"></span>`;
}

/**
 * @param {{ righe: RigaPagella[], href: (cod: string) => string, jsonld: Record<string, unknown>|null }} p
 * @returns {string}
 */
export function renderPagella({ righe, href, jsonld }) {
  const accese = righe.filter((r) => r.conti.rosse > 0);
  const pulite = righe.filter((r) => r.conti.rosse === 0 && r.conti.gialle === 0);
  const ordinate = [...righe].sort(
    (a, b) => b.conti.rosse - a.conti.rosse || b.conti.gialle - a.conti.gialle || a.denominazione.localeCompare(b.denominazione, 'it')
  );
  const rows = ordinate
    .map(
      (r) => `<tr>
      <td><a href="${href(r.codice)}">${esc(r.denominazione)}</a><div class="small muted">${esc(r.regione)}</div></td>
      <td class="sem">${r.spie.map(lampada).join('')}</td>
      <td class="num">${r.conti.rosse}</td>
      <td class="num">${r.conti.gialle}</td>
    </tr>`
    )
    .join('');

  const body = `
<a class="backlink" href="inchiesta.html">← Inchiesta</a>
<h1>La pagella: tutte le spie, struttura per struttura</h1>
<p class="lead">Cinque indicatori per ogni azienda sanitaria — bilanci, spesa anomala, quota senza gara, concorrenza
nelle gare, affidamenti sotto soglia — riuniti in un colpo d'occhio. Una spia accesa è un <strong>invito a
verificare, non un'accusa</strong>: ogni indicatore può avere spiegazioni pienamente legittime, e le soglie
(dichiarate qui sotto) sono volutamente prudenti.</p>

<div class="grid kpis">
  ${kpi('Strutture in pagella', numeroIt(righe.length))}
  ${kpi('Con almeno una spia rossa', numeroIt(accese.length), 'neg')}
  ${kpi('Senza alcuna spia accesa', numeroIt(pulite.length), 'pos')}
</div>

<div class="note" id="legenda"><strong>Legenda e soglie (dichiarate).</strong>
<span class="dot verde"></span> nessun segnale ·
<span class="dot giallo"></span> sopra la norma, da guardare ·
<span class="dot rosso"></span> molto sopra la norma, da verificare ·
<span class="dot nd"></span> dato non disponibile (campione piccolo o ente non abbinato ad ANAC — <em>non</em> è un giudizio).
<br><strong>Bilanci</strong>: segnalazioni contabili automatiche (rosso = gravità alta).
<strong>Spesa anomala</strong>: voci di costo molto sopra le aziende simili (rosso = 2 o più).
<strong>Senza gara</strong>: quota di contratti senza confronto competitivo vs mediana nazionale (rosso = oltre 1,5×; solo enti con ≥50 contratti).
<strong>Concorrenza</strong>: gare con un solo offerente, su dati parziali (rosso = ≥50%, con ≥20 gare).
<strong>Sotto soglia</strong>: affidamenti appena sotto i limiti di legge vs mediana (rosso = oltre 2× e ≥10 casi).
Metodo completo → <a href="metodologia.html">metodologia</a>.</div>

<div class="tablewrap"><table>
  <thead><tr><th scope="col">Struttura</th><th scope="col">Spie</th><th class="num" scope="col" title="Spie rosse">Rosse</th><th class="num" scope="col" title="Spie gialle">Gialle</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>

<div class="note"><strong>Da leggere prima di citare questa pagina.</strong> La pagella <strong>non è una classifica
di colpevolezza</strong>: conta indicatori statistici costruiti su dati ufficiali (BDAP/MEF, ANAC), ciascuno dei
quali può derivare da circostanze legittime — fusioni aziendali, mercati di nicchia, urgenze reali, casistica
complessa. Le strutture senza dati ANAC abbinati mostrano «n.d.» e non sono penalizzate. Ritieni un dato inesatto?
<a href="note-legali.html#rettifiche">Richiedi una rettifica</a>.</div>

<p class="small muted"><strong>Continua:</strong> <a href="segnalazioni.html">tutte le segnalazioni contabili</a> ·
<a href="segnali-gare.html">i semafori delle gare</a> · <a href="guida-verifica.html">come verificare un appalto in 5 minuti</a> ·
<a href="segnalare.html">a chi segnalare cosa hai trovato</a>.</p>
`;
  return page({
    title: 'La pagella delle strutture: tutte le spie in un colpo d’occhio — Ospedali Trasparenti',
    description: 'Cinque indicatori per ogni azienda sanitaria italiana — bilanci, spesa anomala, senza gara, concorrenza, sotto soglia — con soglie dichiarate. Indicatori da verificare, non accuse.',
    active: 'inchiesta.html',
    canonical: 'pagella.html',
    jsonld,
    body,
  });
}
