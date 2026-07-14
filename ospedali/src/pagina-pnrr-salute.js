// Страница „Missione 6: i soldi del PNRR per la sanità, regione per regione".
// Измеримият регионален слой над наративната pnrr.html: разпределеното PNRR
// финансиране по Missione 6 Salute (M6C1 = Case/Ospedali di Comunità, COT;
// M6C2 = болници, технологии), абсолютно и на глава от населението.
//
// Тон: като renderPagamenti/renderMobilita — честна рамка, „indicatore, non prova".
// Това са ПЛАНИРАНИ/разпределени средства и брой проекти по ReGiS, не физически
// напредък на строежите (той се следи от ReGiS/Italiadomani).

import { page, kpi, hbars } from './lib/site-ui.js';
import { euroCompact, euroIt, numeroIt, esc } from './lib/format.js';

export function renderPnrrSalute({ pnrr, popolazione, nomeReg, href, jsonld }) {
  const naz = pnrr.nazionale;
  const nome = (key) => (typeof nomeReg === 'function' ? nomeReg(key) : nomeReg?.[key]) || key;
  const link = (key) => (typeof href === 'function' ? href(key) : null);
  const m6c1 = naz.perMisura.M6C1 || { n: 0, importo: 0 };
  const m6c2 = naz.perMisura.M6C2 || { n: 0, importo: 0 };

  // Регионите, подредени по абсолютно финансиране.
  const righe = Object.entries(pnrr.perRegione)
    .map(([key, v]) => {
      const pop = popolazione?.regioni?.[key] || null;
      return {
        key,
        nome: nome(key),
        importo: v.finanziamentoPnrr,
        nProgetti: v.nProgetti,
        pop,
        proCapite: pop ? v.finanziamentoPnrr / pop : null,
      };
    })
    .sort((a, b) => b.importo - a.importo);

  // hbars екранира етикета → само чисто име (без HTML връзки, иначе излиза сурово).
  const label = (r) => r.nome;

  const maxImporto = Math.max(...righe.map((r) => r.importo), 1);
  const barreImporto = hbars(
    righe.map((r) => ({ label: label(r), valore: r.importo, quota: r.importo / maxImporto })),
    { fmt: euroCompact, maxLabel: 'Finanziamento PNRR Missione 6 per regione' }
  );

  const conPop = righe.filter((r) => r.proCapite != null).sort((a, b) => b.proCapite - a.proCapite);
  const maxPc = Math.max(...conPop.map((r) => r.proCapite), 1);
  const barrePc = hbars(
    conPop.map((r) => ({ label: label(r), valore: r.proCapite, quota: r.proCapite / maxPc })),
    { fmt: (v) => `${euroIt(v)}/ab.`, maxLabel: 'Finanziamento PNRR Missione 6 per abitante' }
  );

  const body = `
<a class="backlink" href="approfondimenti.html">← Approfondimenti</a>
<h1>Missione 6: i soldi del PNRR per la sanità, regione per regione</h1>
<p class="lead">Il Piano Nazionale di Ripresa e Resilienza destina alla <strong>Missione 6 «Salute»</strong>
circa <strong>${euroCompact(naz.finanziamentoPnrr)}</strong> su <strong>${numeroIt(naz.nProgetti)}</strong> progetti:
Case della Comunità, Ospedali di Comunità e Centrali Operative Territoriali (M6C1), e ammodernamento tecnologico,
sicurezza e ricerca degli ospedali (M6C2). Ecco come si distribuiscono sul territorio.</p>

<div class="grid kpis">
  ${kpi('Finanziamento M6 (PNRR)', euroCompact(naz.finanziamentoPnrr))}
  ${kpi('Progetti Missione 6', numeroIt(naz.nProgetti))}
  ${kpi('M6C1 — territorio (Case/Ospedali di Comunità, COT)', euroCompact(m6c1.importo))}
  ${kpi('M6C2 — ospedali (tecnologia, sicurezza, ricerca)', euroCompact(m6c2.importo))}
</div>

<h2>Quanto arriva a ogni regione</h2>
<p class="muted small">Finanziamento PNRR della Missione 6 attribuito a ciascuna regione (progetti localizzati in una
sola regione). ${euroCompact(m6c1.importo)} vanno alla componente territoriale (M6C1), ${euroCompact(m6c2.importo)}
agli ospedali (M6C2).</p>
${barreImporto}

<h2>Per abitante</h2>
<p class="muted small">Lo stesso finanziamento diviso per la popolazione residente: mostra dove il PNRR pesa di più
in rapporto ai cittadini da servire. Le regioni piccole e quelle del Mezzogiorno — dove la rete territoriale era più
debole — tendono ad avere un valore pro capite più alto.</p>
${barrePc}

<div class="note"><strong>Come leggere (e i limiti).</strong> Sono <strong>fondi assegnati</strong> e numero di
progetti registrati nel sistema ufficiale <em>ReGiS</em>, non l’avanzamento fisico dei cantieri: un finanziamento
assegnato non significa un’opera già conclusa e collaudata. Lo stato di attuazione reale (cantieri aperti,
Case della Comunità attive) è monitorato da ReGiS e pubblicato su <em>Italia Domani</em>. I progetti che coprono
più regioni o l’intero territorio nazionale sono conteggiati solo nel totale nazionale, non attribuiti a una singola
regione: per questo la somma regionale è leggermente inferiore al totale. È un <strong>indicatore, non una prova</strong>
di efficienza o ritardo.</div>

<p class="small muted">Per la cornice generale e gli appalti finanziati dal PNRR, vedi
<a href="pnrr.html">Il PNRR nella sanità</a>. Fonte: <a href="${esc(pnrr.url)}" target="_blank" rel="noopener">OpenPNRR
(Openpolis)</a> su dati <strong>ReGiS</strong> (Ragioneria Generale dello Stato / MEF), Missione 6 Salute — licenza ODbL 1.0.
Dato scaricabile in <a href="dati.html">dati aperti</a> (pnrr-salute.json).</p>
`;

  return page({
    title: 'PNRR e sanità: i fondi della Missione 6 regione per regione — Ospedali Trasparenti',
    description: `${euroCompact(naz.finanziamentoPnrr)} del PNRR per la sanità (Missione 6): Case e Ospedali di Comunità, ammodernamento tecnologico. La distribuzione regionale e pro capite, dai dati ufficiali ReGiS.`,
    active: 'approfondimenti.html',
    canonical: 'pnrr-salute.html',
    jsonld,
    body,
  });
}
