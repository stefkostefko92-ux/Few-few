// @ts-check
// Начална страница на сайта: национални KPI + топ сигнали.
// Изнесена дословно от build-site.js — само местене.

import { esc, numeroIt, euroCompact } from '../lib/format.js';
import { page, kpi, badge, siteUrl } from '../lib/site-ui.js';

/** @typedef {import('../lib/dataset.js').Ente} Ente */
/** @typedef {import('../lib/models.js').SegnData} SegnData */
/** @typedef {import('../lib/models.js').SegnEnte} SegnEnte */
/** @typedef {import('../lib/models.js').ForenseData} ForenseData */

// ---------- HOME ----------
/**
 * @param {object} p
 * @param {Ente[]} p.enti
 * @param {SegnData} p.segn
 * @param {ForenseData} p.forense
 * @param {number} p.ultimoAnnoCe
 * @param {number} p.totRicavi
 * @param {number} p.totCosti
 * @param {number} p.totRisultato
 * @param {number} p.inPerdita
 * @param {number} p.conDati
 * @param {(cod: string) => string} p.href
 * @param {Map<string, SegnEnte>} p.segnByCod
 * @returns {string}
 */
export function renderHome({ enti, segn, forense, ultimoAnnoCe, totRicavi, totCosti, totRisultato, inPerdita, conDati, href, segnByCod }) {
  const sis = forense.sistema.perAnno[ultimoAnnoCe];
  const top = segn.enti.slice(0, 12);
  const rows = top
    .map((e) => {
      const segCount = e.segnalazioni.length;
      return `<tr>
        <td><a href="${href(e.codice)}">${esc(e.denominazione)}</a><div class="small muted">${esc(e.regione)}</div></td>
        <td>${badge(e.gravitaMax)}</td>
        <td class="num">${segCount}</td>
        <td class="small">${esc(e.segnalazioni[0].titolo)}</td>
      </tr>`;
    })
    .join('');

  const body = `
<h1>I conti degli ospedali pubblici italiani, in chiaro</h1>
<p class="lead">Le <strong>${numeroIt(conDati)} aziende</strong> del Servizio Sanitario Nazionale valgono circa
<strong>${euroCompact(totRicavi)}</strong> di produzione (${ultimoAnnoCe}), con un risultato d’esercizio aggregato di
<strong>${euroCompact(totRisultato)}</strong> e <strong>${numeroIt(inPerdita)} strutture in perdita</strong>. Questo sito
ricostruisce — struttura per struttura, anno per anno — quanto incassano e spendono, con l’evidenza automatica delle
anomalie contabili e degli appalti. Dati ufficiali <em>open data</em> di RGS/MEF e Ministero della Salute.</p>

<div class="grid kpis" style="margin-top:22px">
  ${kpi(`Strutture con bilancio (${ultimoAnnoCe})`, numeroIt(conDati))}
  ${kpi('Valore della produzione', euroCompact(totRicavi))}
  ${kpi('Risultato d’esercizio aggregato', euroCompact(totRisultato), totRisultato < 0 ? 'neg' : 'pos')}
  ${kpi('Strutture in perdita', `${numeroIt(inPerdita)} / ${numeroIt(conDati)}`, inPerdita > conDati / 2 ? 'neg' : '')}
</div>

<div class="note" style="margin-top:22px"><strong>«Non è possibile che ogni ospedale sia in perdita.»</strong>
Giusto: nel ${ultimoAnnoCe}, ${sis.aziendeInUtile} aziende su ${sis.aziende} chiudono in utile o pareggio, e il rosso
delle altre è in gran parte coperto dalla Gestione Sanitaria Accentrata regionale. La domanda vera è <em>dove</em>
finiscono i soldi. → <a href="inchiesta.html">Leggi l’inchiesta</a> · <a href="classifiche.html">Le classifiche di spesa</a></div>

<h2>Strutture da tenere d’occhio</h2>
<p class="muted small">Ordinate per numero e gravità delle segnalazioni automatiche. Non sono giudizi:
sono anomalie contabili da verificare. <a href="segnalazioni.html">Tutte le segnalazioni →</a></p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Struttura</th><th scope="col">Gravità</th><th class="num" scope="col">Segn.</th><th scope="col">Prima segnalazione</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>

<div class="grid kpis" style="margin-top:26px">
  ${kpi('Segnalazioni totali', numeroIt(segn.totaleSegnalazioni))}
  ${kpi('Gravità alta', numeroIt(segn.perGravita.alta), 'neg')}
  ${kpi('Strutture segnalate', `${numeroIt(segn.entiConSegnalazioni)} / ${numeroIt(enti.length)}`)}
  ${kpi('Anno più recente', String(ultimoAnnoCe))}
</div>

<p style="margin-top:24px"><a class="chip" href="strutture.html">Esplora tutte le ${numeroIt(enti.length)} strutture →</a>
<a class="chip" href="metodologia.html">Come funziona →</a></p>
`;
  const su = siteUrl();
  const jsonld = su
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            '@id': `${su}/#org`,
            name: 'Ospedali Trasparenti',
            url: `${su}/`,
            logo: `${su}/logo.png`,
            description: 'Progetto di trasparenza civica sui conti e gli appalti degli ospedali pubblici italiani.',
            parentOrganization: { '@type': 'Organization', name: 'Carbon Stealth VCC', url: 'https://carbonstealth.eu' },
            sameAs: ['https://carbonstealth.eu'],
            knowsAbout: [
              'sanità pubblica italiana',
              'appalti pubblici della sanità',
              'bilanci delle aziende sanitarie',
              'affidamenti diretti ASL',
              'trasparenza della spesa sanitaria',
              'dati aperti ANAC',
              'modelli CE/SP BDAP',
            ],
          },
          {
            '@type': 'WebSite',
            '@id': `${su}/#website`,
            url: `${su}/`,
            name: 'Ospedali Trasparenti',
            inLanguage: 'it',
            publisher: { '@id': `${su}/#org` },
            potentialAction: {
              '@type': 'SearchAction',
              target: { '@type': 'EntryPoint', urlTemplate: `${su}/cerca.html?q={search_term_string}` },
              'query-input': 'required name=search_term_string',
            },
          },
        ],
      }
    : null;
  return page({
    title: 'I conti della sanità pubblica italiana, in chiaro — Ospedali Trasparenti',
    description: 'Entrate e spese delle strutture della sanità pubblica italiana, con segnalazione automatica delle anomalie contabili e degli appalti senza gara. Dati open data ANAC, RGS/MEF e Ministero della Salute.',
    active: 'index.html',
    canonical: '/', // canonical към корена на домейна, не /index.html
    jsonld,
    body,
  });
}
