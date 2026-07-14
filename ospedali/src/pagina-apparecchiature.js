// Страница „Технологична обезпеченост" — голямата диагностична/терапевтична
// апаратура per регион, нормализирана на населението. НЕ е за възраст (източникът
// няма година), а за наличност: колко TAC/РМН/ПЕТ/ускорители/роботи на милион души.

import { page, kpi, hbars } from './lib/site-ui.js';
import { numeroIt, esc } from './lib/format.js';

const GRUPPI = [
  { key: 'TAC', label: 'TC', tipi: ['TAC'] },
  { key: 'RMN', label: 'Risonanza magnetica', tipi: ['RMN'] },
  { key: 'PET', label: 'PET', tipi: ['PET'] },
  { key: 'MEDNUC', label: 'Medicina nucleare', tipi: ['GCC', 'GTT'] },
  { key: 'ACC', label: 'Acceleratori (radioterapia)', tipi: ['ACC'] },
  { key: 'ROB', label: 'Robot chirurgici', tipi: ['ROB'] },
];

const perMilione = (n, pop) => (pop > 0 ? (n / pop) * 1e6 : 0);
const f1 = (x) => x.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function sommaGruppo(cat, tipi) {
  return tipi.reduce((s, t) => s + (cat[t] || 0), 0);
}

export function renderApparecchiature({ app, popolazione, nomeReg, jsonld }) {
  const pop = popolazione.regioni || {};
  const naz = app.nazionale;
  const totNaz = Object.values(naz).reduce((a, b) => a + b, 0);
  const popIt = popolazione.italia || Object.values(pop).reduce((a, b) => a + b, 0);

  // Ред per регион с бройки по група + обща апаратура/млн.
  const righe = Object.entries(app.perRegione)
    .map(([key, v]) => {
      const totPM = perMilione(v.tot, pop[key]);
      const cells = GRUPPI.map((g) => perMilione(sommaGruppo(v.cat, g.tipi), pop[key]));
      return { key, nome: nomeReg(key), tot: v.tot, totPM, cells, strutture: v.strutture };
    })
    .sort((a, b) => b.totPM - a.totPM);

  const thead = `<tr><th scope="col">Regione</th>${GRUPPI.map((g) => `<th class="num" scope="col">${g.label}</th>`).join('')}<th class="num" scope="col">Tot./mln</th></tr>`;
  const tbody = righe
    .map(
      (r) =>
        `<tr><td>${esc(r.nome)}</td>${r.cells.map((c) => `<td class="num">${f1(c)}</td>`).join('')}<td class="num">${f1(r.totPM)}</td></tr>`
    )
    .join('');

  // Роботи: абсолютни бройки (нишова, скъпа техника — интересна per se).
  const robTop = Object.entries(app.perRegione)
    .map(([key, v]) => ({ label: nomeReg(key), valore: v.cat.ROB || 0, quota: (v.cat.ROB || 0) / Math.max(1, naz.ROB || 1) }))
    .filter((r) => r.valore > 0)
    .sort((a, b) => b.valore - a.valore)
    .slice(0, 12);

  const body = `
<h1>La dotazione tecnologica degli ospedali</h1>
<p class="lead">Quante grandi apparecchiature — TC, risonanze, PET, acceleratori per la radioterapia, robot
chirurgici — ha ogni regione, ogni milione di abitanti. In tutta Italia il registro ministeriale conta
<strong>${numeroIt(totNaz)}</strong> grandi apparecchiature, ${f1(perMilione(totNaz, popIt))} per milione di
abitanti. La dotazione dice cosa una regione <em>può</em> fare: dove è bassa, l’accesso a diagnosi e cure avanzate
è più difficile.</p>
<div class="grid kpis">
  ${kpi('Grandi apparecchiature', numeroIt(totNaz))}
  ${kpi('TC installate', numeroIt(naz.TAC || 0))}
  ${kpi('Risonanze magnetiche', numeroIt(naz.RMN || 0))}
  ${kpi('Robot chirurgici', numeroIt(naz.ROB || 0))}
</div>
<h2>Apparecchiature per milione di abitanti, regione per regione</h2>
<p>Ordinate per dotazione totale pro capite. Le regioni piccole (Valle d’Aosta, Molise) risultano in alto per il
semplice effetto della popolazione ridotta.</p>
<div class="tablewrap"><table>
  <thead>${thead}</thead>
  <tbody>${tbody}</tbody>
</table></div>
<h2>I robot chirurgici, dove sono</h2>
<p>Sistemi robotizzati per chirurgia (tipo Da Vinci): tecnologia costosa e concentrata negli hub maggiori.</p>
${hbars(robTop, { fmt: (v) => numeroIt(v), maxLabel: 'Robot chirurgici per regione' })}
<div class="note"><strong>Come leggere — e i limiti.</strong> Questa è <em>dotazione</em>, non vetustà: la fonte
ministeriale elenca tipo, classe CND e numero di apparecchiature per struttura, ma <strong>non riporta l’anno di
installazione</strong>, quindi non possiamo dire quali macchinari siano vecchi. Il dato riflette anche la
<em>completezza delle dichiarazioni</em> al registro: alcune regioni sotto-dichiarano (una dotazione anomalmente
bassa va letta con prudenza, può essere un buco di comunicazione più che di macchinari). Una dotazione alta non è
di per sé un bene o un male: va incrociata con i volumi di attività e con la popolazione servita.</div>
<p class="small muted">Fonte: <a href="${esc(app.url)}" target="_blank" rel="noopener">Ministero della Salute —
Grandi apparecchiature sanitarie</a> (DM 22/04/2014, IODL 2.0). Popolazione: Istat ${popolazione.anno}. Normalizzazione
propria per milione di abitanti.</p>
`;
  return page({
    title: 'La dotazione tecnologica degli ospedali italiani, regione per regione — Ospedali Trasparenti',
    description: `TC, risonanze, PET, acceleratori e robot chirurgici per milione di abitanti in ogni regione. ${numeroIt(totNaz)} grandi apparecchiature nel registro del Ministero della Salute.`,
    active: 'approfondimenti.html',
    canonical: 'apparecchiature.html',
    jsonld,
    body,
  });
}
