// @ts-check
// Страница „Tutte le strutture" (списък с филтър/търсене) + детайлната страница
// на всяка структура (SVG графики + финанси + сигнали + приложения).
// Изнесени дословно от build-site.js — само местене.

import { esc, euroIt, euroCompact, numeroIt, slugify } from '../lib/format.js';
import { page, kpi, badge, lineChart, barChart, hbars, siteUrl } from '../lib/site-ui.js';
import { tipoEnte, postiLettoEnte, ricoveriEnte, CE_INDICATORS, SP_INDICATORS, CE_FORENSICS } from '../lib/dataset.js';
import { ultimoCe, briciole, collezioneLd, FOR_LABEL, isDetailLine, isTopLevelSp } from '../lib/site-shared.js';
import { appaltiBlock, contrattiBlock } from './appalti.js';

/** @typedef {import('../lib/dataset.js').Ente} Ente */
/** @typedef {import('../lib/dataset.js').Anagrafica} Anagrafica */
/** @typedef {import('../lib/dataset.js').StrutturaAnag} StrutturaAnag */
/** @typedef {import('../lib/dataset.js').SerieAnno} SerieAnno */
/** @typedef {import('../lib/models.js').SegnEnte} SegnEnte */
/** @typedef {import('../lib/models.js').ForenseEnte} ForenseEnte */
/** @typedef {import('../lib/models.js').Autorita} Autorita */
/** @typedef {import('../lib/models.js').AppMatch} AppMatch */
/** @typedef {import('../lib/models.js').RegCtx} RegCtx */
/** @typedef {import('./appalti.js').Contratto} Contratto */

/** @typedef {(ente: Ente) => { anno: number|null, y: SerieAnno }} UltimoCe */

// ---------- STRUTTURE (con filtro) ----------
/**
 * @param {object} p
 * @param {Ente[]} p.enti
 * @param {number} p.ultimoAnnoCe
 * @param {(cod: string) => string} p.href
 * @param {Map<string, SegnEnte>} p.segnByCod
 * @param {UltimoCe} p.ultimoCe
 * @returns {string}
 */
export function renderStrutture({ enti, ultimoAnnoCe, href, segnByCod, ultimoCe }) {
  const regioni = [...new Set(enti.map((e) => e.regione))].sort();
  const rows = enti
    .map((e) => {
      const { y } = ultimoCe(e);
      const s = segnByCod.get(e.codice);
      const ris = y.risultatoEsercizio;
      const g = s ? s.gravitaMax : '';
      return `<tr data-regione="${esc(e.regione)}" data-grav="${g}" data-nome="${esc(e.denominazione.toLowerCase())}">
      <td><a href="${href(e.codice)}">${esc(e.denominazione)}</a><div class="small muted">${esc(e.regione)} · ${esc(tipoEnte(e.codEnte, e.anag))}</div></td>
      <td class="num">${euroCompact(y.valoreProduzione)}</td>
      <td class="num ${ris < 0 ? 'neg' : ris > 0 ? 'pos' : ''}">${euroCompact(ris)}</td>
      <td>${s ? badge(s.gravitaMax) + ` <span class="small muted">${s.segnalazioni.length}</span>` : '<span class="small muted">—</span>'}</td>
    </tr>`;
    })
    .join('');
  const opts = regioni.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('');

  const body = `
<h1>Tutte le strutture</h1>
<p class="lead">Le ${numeroIt(enti.length)} aziende del SSN con bilancio nei modelli CE/SP.
Cerca per nome, filtra per regione o per gravità delle segnalazioni. Valori dell’ultimo esercizio disponibile (${ultimoAnnoCe}).</p>
<div class="controls">
  <input type="search" id="q" placeholder="Cerca per nome…" aria-label="Cerca">
  <select id="reg" aria-label="Regione"><option value="">Tutte le regioni</option>${opts}</select>
  <select id="grav" aria-label="Gravità">
    <option value="">Qualsiasi segnalazione</option>
    <option value="alta">Solo gravità alta</option>
    <option value="media">Media o alta</option>
    <option value="__seg">Con segnalazioni</option>
    <option value="__none">Senza segnalazioni</option>
  </select>
</div>
<p class="small muted" id="count"></p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Struttura</th><th class="num" scope="col">Valore produzione</th><th class="num" scope="col">Risultato</th><th scope="col">Segnalazioni</th></tr></thead>
  <tbody id="rows">${rows}</tbody>
</table></div>
<script>
(function(){
  var q=document.getElementById('q'),reg=document.getElementById('reg'),
      grav=document.getElementById('grav'),count=document.getElementById('count'),
      rows=[].slice.call(document.querySelectorAll('#rows tr'));
  var rank={alta:3,media:2,bassa:1,'':0};
  function apply(){
    var t=q.value.trim().toLowerCase(),r=reg.value,g=grav.value,n=0;
    rows.forEach(function(row){
      var ok=true;
      if(t&&row.dataset.nome.indexOf(t)<0)ok=false;
      if(r&&row.dataset.regione!==r)ok=false;
      var gv=row.dataset.grav;
      if(g==='alta'&&gv!=='alta')ok=false;
      else if(g==='media'&&rank[gv]<2)ok=false;
      else if(g==='__seg'&&!gv)ok=false;
      else if(g==='__none'&&gv)ok=false;
      row.classList.toggle('hidden',!ok);
      if(ok)n++;
    });
    count.textContent=n+' strutture';
  }
  q.addEventListener('input',apply);reg.addEventListener('change',apply);grav.addEventListener('change',apply);
  apply();
})();
</script>
`;
  // Топ структури по стойност на продукцията → ItemList в графа (по избор, по задание).
  const topStrutture = [...enti]
    .map((e) => ({ e, v: ultimoCe(e).y.valoreProduzione ?? 0 }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 15)
    .map(({ e }) => ({ nome: e.denominazione, url: href(e.codice) }));
  return page({
    title: 'Tutte le strutture — Ospedali Trasparenti',
    description: 'Elenco filtrabile delle aziende sanitarie e ospedaliere pubbliche italiane con valore della produzione e risultato d’esercizio.',
    active: 'strutture.html',
    jsonld: collezioneLd(
      'Strutture',
      'strutture.html',
      'Elenco filtrabile delle aziende sanitarie e ospedaliere pubbliche italiane con valore della produzione e risultato d’esercizio.',
      'Aziende sanitarie e ospedaliere pubbliche italiane',
      topStrutture
    ),
    body,
  });
}

// ---------- DETTAGLIO STRUTTURA ----------
/**
 * @param {object} p
 * @param {Ente} p.ente
 * @param {Map<string, StrutturaAnag>} p.struttureByCod
 * @param {Anagrafica} p.anagrafica
 * @param {SegnEnte} [p.seg]
 * @param {ForenseEnte} [p.forse]
 * @param {Autorita} [p.app]
 * @param {Contratto[]|null} p.contratti
 * @param {AppMatch|null} p.appMatch
 * @param {number} p.ultimoAnnoCe
 * @param {{ cplMed?: number|null, cprMed?: number|null }} [p.bench]
 * @param {RegCtx|null} [p.reg]
 * @returns {string}
 */
export function renderStruttura({ ente, struttureByCod, anagrafica, seg, forse, app, contratti, appMatch, ultimoAnnoCe, bench = {}, reg = null }) {
  const anag = ente.anag;
  const anni = [...ente.serie.keys()].sort((a, b) => a - b);
  /** @param {string} k @returns {number[][]} */
  const val = (k) => /** @type {number[][]} */ (anni.map((a) => [a, ente.serie.get(a)?.[k]]).filter(([, v]) => v != null));
  const { anno: annoUlt, y: yUlt } = ultimoCe(ente);

  const chartCR = lineChart(
    [
      { label: 'Valore della produzione', color: 'var(--brand)', points: val('valoreProduzione') },
      { label: 'Costi della produzione', color: 'var(--neg)', points: val('costiProduzione') },
    ],
    { caption: 'Ricavi e costi della produzione per anno (€)' }
  );
  const chartRis = barChart(val('risultatoEsercizio'), { caption: 'Risultato d’esercizio per anno (€)' });

  // KPI за последната година
  const ris = yUlt.risultatoEsercizio;
  const kpis = `<div class="grid kpis">
    ${kpi(`Valore produzione (${annoUlt ?? '—'})`, euroIt(yUlt.valoreProduzione))}
    ${kpi('Costi produzione', euroIt(yUlt.costiProduzione))}
    ${kpi('Risultato d’esercizio', euroIt(ris), ris < 0 ? 'neg' : ris > 0 ? 'pos' : '')}
    ${kpi('Costo del personale', euroIt(yUlt.costoPersonale))}
  </div>`;

  // Benchmark €/легло и €/приемане срещу националната медиана (ако има анаграфика)
  const lettiB = postiLettoEnte(ente, anagrafica);
  const ricB = ricoveriEnte(ente, anagrafica);
  let benchBlk = '';
  if (yUlt.costiProduzione && (lettiB != null || ricB != null) && (bench.cplMed || bench.cprMed)) {
    const cpl = lettiB != null ? yUlt.costiProduzione / lettiB : null;
    const cpr = ricB != null ? yUlt.costiProduzione / ricB : null;
    /**
     * @param {number|null} v
     * @param {number|null|undefined} med
     * @param {string} lab
     * @returns {string}
     */
    const cella = (v, med, lab) =>
      v && med
        ? kpi(lab, euroCompact(v), v > med * 1.5 ? 'neg' : '', `(mediana ${euroCompact(med)})`)
        : '';
    benchBlk = `<h2>Quanto costa, in proporzione</h2>
  <div class="grid kpis">${cella(cpl, bench.cplMed, 'Costi per posto letto')}${cella(cpr, bench.cprMed, 'Costi per ricovero')}</div>
  <p class="small muted">Costi della produzione (${annoUlt}) rapportati a posti letto e ricoveri dell'anagrafe ospedaliera,
  confrontati con la mediana nazionale. Le ASL territoriali spendono anche fuori dagli ospedali (territorio, farmaceutica
  convenzionata): il confronto è indicativo, più solido tra aziende dello stesso tipo.</p>`;
  }

  // Панел „La tua regione" — свързва болницата с регионалните анализи (100% надежден
  // регионален join; кодовете на отделните структури между министерските датасети
  // не съвпадат, затова тук е регионалният контекст, не собствената дотация).
  let regBlk = '';
  if (reg && reg.href) {
    /** @param {number|null} x */
    const f1 = (x) => (x == null ? null : x.toLocaleString('it-IT', { maximumFractionDigits: 1 }));
    /**
     * @param {string} href
     * @param {string} lab
     * @param {string|null} val
     * @returns {string}
     */
    const cardReg = (href, lab, val) =>
      val == null ? '' : `<a class="seg media" href="${href}" style="text-decoration:none"><div class="t">${lab}</div><div class="d"><strong>${val}</strong></div></a>`;
    const celle = [
      cardReg('apparecchiature.html', 'Dotazione tecnologica', reg.tacPerMln != null ? `${f1(reg.tacPerMln)} TC/mln${reg.robot ? ` · ${reg.robot} robot` : ''}` : null),
      cardReg('sdo.html', 'Volumi di ricovero', reg.ricoveriPer1000 != null ? `${f1(reg.ricoveriPer1000)} ric./1.000 ab.` : null),
      cardReg('siope.html', 'Cassa di dicembre', reg.siopeDic != null ? `${reg.siopeDic.toLocaleString('it-IT', { maximumFractionDigits: 2 })}× il mese medio` : null),
      cardReg('pnrr-salute.html', 'PNRR Missione 6', reg.pnrrProCapite != null ? `${euroIt(Math.round(reg.pnrrProCapite))}/ab.` : null),
    ].filter(Boolean).join('');
    if (celle) {
      regBlk = `<h2>La regione: ${esc(reg.nome)}</h2>
  <p class="small muted">Indicatori della regione a cui appartiene questa azienda (dato regionale, non della singola struttura). Approfondisci in <a href="${reg.href}">${esc(reg.nome)}</a>.</p>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">${celle}</div>`;
    }
  }

  // Оперативен профил
  const own = struttureByCod.get(ente.codice);
  const presidi = anagrafica.strutture.filter(
    (s) => s.codiceRegione === ente.codReg && s.codiceAsl === ente.codEnte && s.codice !== ente.codice
  );
  const opRows = own ? [own] : presidi;
  const opTable = opRows.length
    ? `<h2>Profilo operativo <span class="small muted">(anagrafe ospedaliera, ${opRows[0].anno})</span></h2>
       <div class="tablewrap"><table>
       <thead><tr><th scope="col">Ospedale</th><th class="num" scope="col">Posti letto</th><th class="num" scope="col">Personale</th><th class="num" scope="col">di cui medici</th><th class="num" scope="col">Ricoveri</th><th class="num" scope="col">Giornate</th></tr></thead>
       <tbody>${opRows
         .map(
           (s) => `<tr><td>${esc(s.denominazione)}<div class="small muted">${esc(s.comune)} (${esc(s.provincia)})</div></td>
           <td class="num">${numeroIt(s.postiLetto)}</td><td class="num">${numeroIt(s.personale)}</td>
           <td class="num">${numeroIt(s.medici)}</td><td class="num">${numeroIt(s.ricoveri)}</td><td class="num">${numeroIt(s.giornateDegenza)}</td></tr>`
         )
         .join('')}</tbody></table></div>`
    : '';

  // Таблица показатели по години
  const indicators = [...CE_INDICATORS, ...SP_INDICATORS];
  const finTable = `<h2>Indicatori per anno</h2>
    <div class="tablewrap"><table>
    <thead><tr><th scope="col">Anno</th>${indicators.map((i) => `<th class="num" scope="col">${esc(i.label)}</th>`).join('')}</tr></thead>
    <tbody>${anni
      .map((a) => {
        const y = ente.serie.get(a);
        return `<tr><td>${a}</td>${indicators
          .map((i) => {
            const v = y?.[i.key];
            const cls = i.key === 'risultatoEsercizio' && v != null ? (v < 0 ? 'neg' : 'pos') : '';
            return `<td class="num ${cls}">${euroIt(v)}</td>`;
          })
          .join('')}</tr>`;
      })
      .join('')}</tbody></table></div>`;

  // „Dove vanno i soldi“ — разходен разбор + форензик флагове
  let soldiBlock = '';
  if (forse && forse.cat && Object.keys(forse.cat).length) {
    const flaggedCats = new Set(forse.flags.map((f) => f.categoria));
    const items = /** @type {import('../lib/site-ui.js').HbarItem[]} */ (
      CE_FORENSICS.map((c) => forse.cat[c.key] && ({
        label: FOR_LABEL[c.key],
        valore: forse.cat[c.key].valore,
        quota: forse.cat[c.key].quotaCosti,
        flag: flaggedCats.has(c.key),
      })).filter(Boolean)
    )
      .sort((a, b) => b.quota - a.quota);
    const flagList = forse.flags.length
      ? `<h3>Segnali «follow the money» <span class="small muted">(${forse.flags.length})</span></h3>` +
        forse.flags
          .map(
            (f) => `<div class="seg alta"><div class="t"><span class="badge alta">!</span> <span>${esc(f.label)}</span></div>
            <div class="d">${esc(f.testo)}</div></div>`
          )
          .join('')
      : '';
    const peerTxt = forse.peer
      ? ` · confronto con aziende simili (${esc(forse.peer.replace('|', ', '))})`
      : '';
    soldiBlock = `<h2>Dove vanno i soldi <span class="small muted">(${forse.anno}, quota dei costi della produzione${peerTxt})</span></h2>
      <div class="card">${hbars(items, { fmt: euroCompact, maxLabel: 'Composizione della spesa per categoria' })}</div>
      ${flagList}`;
  }

  // Сигнали
  const segBlock = seg
    ? `<h2>Segnalazioni <span class="small muted">(${seg.segnalazioni.length})</span></h2>${seg.segnalazioni
        .map(
          (s) => `<div class="seg ${s.gravita}"><div class="t">${badge(s.gravita)} <span>${esc(s.titolo)}</span></div>
          <div class="d">${esc(s.dettaglio)}</div></div>`
        )
        .join('')}`
    : `<h2>Segnalazioni</h2><p class="note">Nessuna anomalia rilevata dai controlli automatici sui dati disponibili.</p>`;

  // Подробен CE (последна година)
  const ceRows = ente.ceUltimo
    .filter((v) => isDetailLine(v.desc) && v.importo !== 0)
    .map((v) => `<tr><td>${esc(v.desc)}</td><td class="num">${euroIt(v.importo)}</td></tr>`)
    .join('');
  const ceBlock = ceRows
    ? `<h2>Conto economico dettagliato <span class="small muted">(${ente.ceUltimoAnno})</span></h2>
       <div class="tablewrap"><table><thead><tr><th scope="col">Voce</th><th class="num" scope="col">Importo</th></tr></thead><tbody>${ceRows}</tbody></table></div>`
    : '';

  const spRows = ente.spUltimo
    .filter((v) => isTopLevelSp(v.desc) && v.importo !== 0)
    .map((v) => `<tr><td>${esc(v.desc)}</td><td class="num">${euroIt(v.importo)}</td></tr>`)
    .join('');
  const spBlock = spRows
    ? `<h2>Stato patrimoniale <span class="small muted">(${ente.spUltimoAnno})</span></h2>
       <div class="tablewrap"><table><thead><tr><th scope="col">Voce</th><th class="num" scope="col">Importo</th></tr></thead><tbody>${spRows}</tbody></table></div>`
    : '';

  const meta = [
    `<span class="chip">${esc(ente.regione)}</span>`,
    `<span class="chip">${esc(tipoEnte(ente.codEnte, anag))}</span>`,
    anag && anag.comune ? `<span class="chip">${esc(anag.comune)} (${esc(anag.provincia)})</span>` : '',
    `<span class="chip">codice ${esc(ente.codice)}</span>`,
    seg ? `${badge(seg.gravitaMax)}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = `
<a class="backlink" href="../strutture.html">← Tutte le strutture</a>
<h1>${esc(ente.denominazione)}</h1>
<p>${meta}</p>
${anag && anag.indirizzo ? `<p class="muted small">${esc(anag.indirizzo)}${anag.comune ? ', ' + esc(anag.comune) : ''}</p>` : ''}

${kpis}
${benchBlk}
${segBlock}

<h2>Andamento economico</h2>
<div class="grid" style="grid-template-columns:1fr">
  <div class="card">${chartCR}</div>
  <div class="card">${chartRis}</div>
</div>

${soldiBlock}
${appaltiBlock(app, appMatch)}
${contrattiBlock(ente, contratti)}
${opTable}
${regBlk}
${finTable}
${ceBlock}
${spBlock}

<p class="small muted" style="margin-top:26px">Fonte: <a href="https://openbdap.rgs.mef.gov.it/it/SSN/Analizza">BDAP — RGS/MEF</a>
(modelli CE/SP del SSN) e <a href="https://www.dati.salute.gov.it/">dati.salute.gov.it</a>. Importi in euro dai consuntivi.</p>
`;
  const percorso = `struttura/${ente.codice}-${slugify(ente.denominazione)}.html`;
  const su = siteUrl();
  // entity граф за дългата опашка („bilancio <болница>"): breadcrumb + субект
  const jsonld = su
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          briciole([['Home', '/'], ['Strutture', 'strutture.html'], [ente.denominazione, percorso]]),
          {
            '@type': 'GovernmentOrganization',
            name: ente.denominazione,
            address: { '@type': 'PostalAddress', addressRegion: ente.regione, addressCountry: 'IT' },
            subjectOf: {
              '@type': 'Dataset',
              name: `Bilancio e appalti — ${ente.denominazione}`,
              temporalCoverage: '2012/2024',
              license: 'https://creativecommons.org/licenses/by/4.0/',
              url: `${su}/${percorso}`,
            },
          },
        ],
      }
    : null;
  return page({
    title: `${ente.denominazione} — Ospedali Trasparenti`,
    description: `Bilancio, entrate, spese e segnalazioni contabili di ${ente.denominazione} (${ente.regione}).`,
    active: 'strutture.html',
    rel: '../',
    canonical: percorso,
    jsonld,
    body,
  });
}
