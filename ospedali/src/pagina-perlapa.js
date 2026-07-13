// Страница „Le consulenze esterne della sanità“ (на италиански).
// Показва САМО агрегати от data/consulenze.json — никога имена на физически лица.
// Рамкиране: „indicatore, non prova“.

import { page, kpi, hbars, lineChart } from './lib/site-ui.js';
import { euroIt, euroCompact, numeroIt } from './lib/format.js';

/**
 * @param {Object}   p
 * @param {Object}   p.cons         — съдържанието на data/consulenze.json
 * @param {Function} [p.nomePerCod] — по избор: код→име (не се ползва, join-ът е по име)
 */
export function renderConsulenze({ cons, nomePerCod }) {
  void nomePerCod; // join-ът е по ИМЕ на структурата, не по код

  const anni = Object.keys(cons.perAnno).map(Number).sort((a, b) => a - b);
  const totImporto = anni.reduce((s, a) => s + cons.perAnno[a].importo, 0);
  const totIncarichi = anni.reduce((s, a) => s + cons.perAnno[a].nIncarichi, 0);
  const nEnti = Object.keys(cons.perEnte).length;
  const ultimo = anni.at(-1);
  const primo = anni[0];

  // Топ 15 структури по обща сума (по нормализирано име — показваме го както е).
  const top = Object.entries(cons.perEnte)
    .sort((a, b) => b[1].importo - a[1].importo)
    .slice(0, 15)
    .map(([nome, v]) => ({
      label: nome,
      valore: v.importo,
      quota: totImporto > 0 ? v.importo / totImporto : 0,
    }));

  const body = `
<a class="backlink" href="approfondimenti.html">← Approfondimenti</a>
<h1>Le consulenze esterne della sanità</h1>
<p class="lead">Tra il ${primo} e il ${ultimo} le strutture del Servizio Sanitario Nazionale hanno conferito
<strong>${numeroIt(totIncarichi)}</strong> incarichi di consulenza e collaborazione esterna, per un totale di
<strong>${euroIt(totImporto)}</strong> distribuiti su <strong>${numeroIt(nEnti)}</strong> aziende. Sono incarichi
<strong>legali e obbligatoriamente pubblici</strong> (art. 15 D.Lgs. 33/2013): una spesa alta non è di per sé
un’irregolarità, ma un <em>indicatore</em> di quanto un’azienda dipenda da competenze esterne.</p>

<div class="grid kpis">
  ${kpi(`Spesa totale (${primo}–${ultimo})`, euroCompact(totImporto))}
  ${kpi('Incarichi conferiti', numeroIt(totIncarichi))}
  ${kpi('Aziende coinvolte', numeroIt(nEnti))}
  ${kpi(`Spesa ${ultimo}`, euroCompact(cons.perAnno[ultimo].importo))}
</div>

<h2>La spesa anno per anno</h2>
${lineChart(
    [
      {
        label: 'Spesa per consulenze esterne (€)',
        color: 'var(--brand)',
        points: anni.map((a) => [a, cons.perAnno[a].importo]),
      },
    ],
    { caption: 'Importo erogato per incarichi di consulenza — strutture del SSN (fonte: PerlaPA — Anagrafe delle Prestazioni)' }
  )}

<h2>Le aziende che spendono di più</h2>
<p class="muted small">Prime 15 strutture sanitarie per spesa complessiva ${primo}–${ultimo}. La percentuale è la quota
sul totale nazionale della sanità.</p>
${hbars(top, { fmt: euroCompact, maxLabel: 'Prime 15 aziende sanitarie per spesa in consulenze esterne' })}

<div class="note"><strong>Come leggere questo dato.</strong> Si tratta di incarichi <strong>leciti e trasparenti</strong>:
la legge (art. 15 D.Lgs. 33/2013) impone alle amministrazioni di pubblicarli tutti. Una spesa elevata può riflettere
esigenze reali — progettazione PNRR, direzione lavori, assistenza legale o informatica specialistica — oppure una
carenza strutturale di competenze interne. È un <strong>indicatore, non una prova</strong> di cattiva gestione.</div>

<div class="note"><strong>Tutela dei dati personali.</strong> Il dataset di origine contiene i nomi dei singoli
professionisti incaricati (persone fisiche): qui <strong>non vengono mai mostrati</strong>. Pubblichiamo solo aggregati
(importi e numero di incarichi) per azienda.</div>

<p class="small muted">Il collegamento con le aziende sanitarie avviene <strong>per denominazione</strong> (la fonte non
riporta un codice fiscale univoco): possibili disallineamenti o omonimie. Fonte:
<a href="${cons.url}" target="_blank" rel="noopener">Dipartimento della Funzione Pubblica — PerlaPA, Anagrafe delle
Prestazioni</a> (CC BY 4.0). Elaborazione propria; i nomi delle persone fisiche sono esclusi in fase di elaborazione.</p>
`;

  return page({
    title: 'Le consulenze esterne della sanità — Ospedali Trasparenti',
    description: `${numeroIt(totIncarichi)} incarichi di consulenza esterna delle aziende sanitarie per ${euroCompact(totImporto)} (${primo}–${ultimo}). Aggregati per azienda, senza nomi di persone. Fonte PerlaPA.`,
    active: 'approfondimenti.html',
    canonical: 'consulenze.html',
    body,
  });
}
