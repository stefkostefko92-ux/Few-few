// @ts-check
// Начална страница на сайта: национални KPI + топ сигнали.
// Изнесена дословно от build-site.js — само местене.

import { esc, numeroIt } from '../lib/format.js';
import { page, badge, siteUrl, CSS_HOME } from '../lib/site-ui.js';

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

  // „Il conto“: агрегираният отчет като счетоводен регистър. Редът „altre
  // componenti“ (финансови, извънредни, данъци) е разликата, за да се СЪБИРА
  // визуално: produzione − costi + altre = risultato (счетоводна цялост).
  // Разликата се смята от ЗАКРЪГЛЕНИТЕ (до 0,1 mld) стойности — както в отчетите,
  // иначе показаните редове не се събират заради закръглянето.
  /** @param {number} v */
  const r1 = (v) => Math.round(v / 1e8) * 1e8;
  const altre = r1(totRisultato) - r1(totRicavi) + r1(totCosti);
  const quotaPerdita = conDati ? inPerdita / conDati : 0;
  // милиарди с ЕДИН знак след запетаята (110,0 · −111,1) — в регистъра
  // закръглението до цял милиард крие разлики от стотици милиони
  /** @param {number} v */
  const mld = (v) =>
    `${v < 0 ? '−' : ''}${(r1(Math.abs(v)) / 1e9).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mld €`;
  /** @param {number} v */
  const segno = (v) => (v > 0 ? `+${mld(v)}` : mld(v));
  const body = `
<section class="hero" aria-labelledby="hero-t">
<div>
<h1 id="hero-t">I conti degli ospedali pubblici italiani, in chiaro</h1>
<p class="lead">Quanto incassano e quanto spendono le aziende del Servizio Sanitario Nazionale,
struttura per struttura e anno per anno, con l’evidenza automatica delle anomalie nei bilanci e negli appalti.
Solo dati ufficiali <em>open data</em> di ANAC, RGS/MEF e Ministero della Salute.</p>
<form class="hero-s" role="search" action="dove.html" method="get">
  <label class="sr" for="hero-q">Cerca il tuo comune o il tuo ospedale</label>
  <input id="hero-q" name="q" type="search" placeholder="Il tuo comune o il tuo ospedale" autocomplete="off" enterkeyhint="search">
  <button class="btn" type="submit">Trova i conti</button>
</form>
<div class="hero-a"><a class="btn ghost" href="inchiesta.html">Leggi l’inchiesta</a><a class="btn ghost" href="regioni.html">Esplora per regione</a></div>
</div>
<figure class="conto" aria-labelledby="conto-t">
  <div class="conto-h"><b id="conto-t">Il conto del SSN</b><span>esercizio ${ultimoAnnoCe}</span></div>
  <dl>
    <div class="r"><dt>Valore della produzione</dt><dd>${mld(totRicavi)}</dd></div>
    <div class="r"><dt>Costi della produzione</dt><dd>${mld(-totCosti)}</dd></div>
    <div class="r"><dt>Gestione finanziaria, straordinaria e imposte</dt><dd>${segno(altre)}</dd></div>
    <div class="r tot"><dt>Risultato d’esercizio aggregato</dt><dd class="${totRisultato < 0 ? 'neg' : 'pos'}">${segno(totRisultato)}</dd></div>
  </dl>
  <div class="conto-p">
    <p><strong>${numeroIt(inPerdita)}</strong> aziende su ${numeroIt(conDati)} chiudono in perdita.</p>
    <div class="conto-bar" role="img" aria-label="${numeroIt(inPerdita)} su ${numeroIt(conDati)} in perdita"><i style="width:${(quotaPerdita * 100).toFixed(1)}%"></i></div>
  </div>
  <figcaption>Somma dei modelli CE delle ${numeroIt(conDati)} aziende con bilancio completo nel ${ultimoAnnoCe},
  esclusa la Gestione Sanitaria Accentrata regionale; importi arrotondati. Fonte: BDAP — RGS/MEF.
  <a href="metodologia.html">Come lo calcoliamo</a></figcaption>
</figure>
</section>

<ul class="percorsi">
  <li><a href="dove.html"><b>Trova la tua struttura</b><span>Dal tuo comune all’azienda sanitaria che ne gestisce i conti.</span></a></li>
  <li><a href="appalti.html"><b>Segui gli appalti</b><span>Quanto si compra senza gara, da chi e per quali importi.</span></a></li>
  <li><a href="guida-verifica.html"><b>Verifica da solo</b><span>Dal codice CIG alla determina, fino all’accesso civico.</span></a></li>
</ul>

<h2>«Non è possibile che ogni ospedale sia in perdita»</h2>
<p>Giusto: nel ${ultimoAnnoCe}, ${sis.aziendeInUtile} aziende su ${sis.aziende} chiudono in utile o in pareggio, e il rosso
delle altre è in gran parte coperto dalla Gestione Sanitaria Accentrata regionale. La domanda vera è <em>dove</em>
finiscono i soldi: <a href="inchiesta.html">l’inchiesta</a> e <a href="classifiche.html">le classifiche di spesa</a>
partono da qui.</p>

<h2>Strutture da tenere d’occhio</h2>
<p class="muted small">Ordinate per numero e gravità delle segnalazioni automatiche. Non sono giudizi:
sono anomalie contabili da verificare. <a href="segnalazioni.html">Tutte le segnalazioni →</a></p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Struttura</th><th scope="col">Gravità</th><th class="num" scope="col">Segn.</th><th scope="col">Prima segnalazione</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>

<div class="statstrip">
  <div><b>${numeroIt(segn.totaleSegnalazioni)}</b><span>segnalazioni automatiche</span></div>
  <div><b class="neg">${numeroIt(segn.perGravita.alta)}</b><span>di gravità alta</span></div>
  <div><b>${numeroIt(segn.entiConSegnalazioni)} su ${numeroIt(enti.length)}</b><span>strutture con almeno una segnalazione</span></div>
</div>

<p><a class="btn ghost" href="strutture.html">Esplora tutte le ${numeroIt(enti.length)} strutture</a>
<a class="btn ghost" href="metodologia.html">Come funziona</a></p>
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
    css: CSS_HOME,
    jsonld,
    body,
  });
}
