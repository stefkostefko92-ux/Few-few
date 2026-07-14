// Регионални страници + географска карта на Италия (истински choropleth) и
// индексът им. Изнесени дословно от build-site.js — само местене.

import { esc, numeroIt, percentualeIt, euroCompact } from '../lib/format.js';
import { page, kpi, badge, siteUrl } from '../lib/site-ui.js';
import { REGIONI, PIANO_RIENTRO, ultimoCe, briciole } from '../lib/site-shared.js';
import { VIEWBOX, REGIONI_GEO } from '../lib/italia-geo.js';

// ---------- REGIONI (страници + схематична карта) ----------
// Цветова скала за дела „senza gara“: светло → тъмночервено (ColorBrewer Reds).
function scalaRossi(t) {
  const stops = [
    [0.0, [255, 245, 240]],
    [0.25, [252, 187, 161]],
    [0.5, [252, 146, 114]],
    [0.75, [222, 45, 38]],
    [1.0, [153, 0, 13]],
  ];
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const f = (x - a) / (b - a || 1);
      const c = ca.map((v, j) => Math.round(v + (cb[j] - v) * f));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return 'rgb(153,0,13)';
}

// Обединява няколко ANAC регионални реда (за Трентино: Болцано + Тренто).
export function mergeAppRows(rows) {
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];
  const out = { reg: rows[0].reg, n: 0, importo: 0, cat: {}, band40: 0, band140: 0, prorogaN: 0, urgenzaN: 0, pnrrImporto: 0 };
  for (const r of rows) {
    out.n += r.n || 0;
    out.importo += r.importo || 0;
    out.band40 += r.band40 || 0;
    out.band140 += r.band140 || 0;
    out.prorogaN += r.prorogaN || 0;
    out.urgenzaN += r.urgenzaN || 0;
    out.pnrrImporto += r.pnrrImporto || 0;
    for (const [k, v] of Object.entries(r.cat || {})) {
      if (!out.cat[k]) out.cat[k] = { n: 0, importo: 0 };
      out.cat[k].n += v.n || 0;
      out.cat[k].importo += v.importo || 0;
    }
  }
  return out;
}

// Ръчно нагласени котви на етикетите (viewBox 0 0 1000 1298). Изходна точка:
// ПЛОЩНИЯТ центроид на най-големия ринг (не средно на върховете — крайбрежната
// детайлност го дърпа), после визуални корекции. Малките/тънките региони
// (VdA, Liguria, Molise) са с ИЗНЕСЕН етикет + водеща линия, като в
// професионалната картография.
const MAP_LABELS = {
  '01': { x: 105, y: 230 }, // Piemonte
  '02': { fuori: { tx: 68, ty: 94, lx1: 66, ly1: 104, lx2: 64, ly2: 138 } }, // Valle d'Aosta
  '03': { x: 264, y: 168 }, // Lombardia
  '04': { x: 391, y: 82 }, // Trentino-Alto Adige
  '05': { x: 447, y: 168 }, // Veneto
  '06': { x: 545, y: 102 }, // Friuli-VG
  '07': { fuori: { tx: 148, ty: 415, lx1: 152, ly1: 400, lx2: 170, ly2: 348 } }, // Liguria
  '08': { x: 371, y: 290 }, // Emilia-Romagna
  '09': { x: 375, y: 412 }, // Toscana
  '10': { x: 486, y: 470 }, // Umbria
  '11': { x: 562, y: 406 }, // Marche
  '12': { x: 508, y: 577 }, // Lazio
  '13': { x: 614, y: 540 }, // Abruzzo
  '14': { fuori: { tx: 748, ty: 528, lx1: 728, ly1: 536, lx2: 688, ly2: 574 } }, // Molise
  '15': { x: 686, y: 702 }, // Campania
  '16': { x: 866, y: 692 }, // Puglia
  '17': { x: 798, y: 744 }, // Basilicata
  '18': { x: 834, y: 874 }, // Calabria
  '19': { x: 630, y: 1066 }, // Sicilia
  '20': { x: 202, y: 786 }, // Sardegna
};

// WCAG relative luminance на "rgb(r,g,b)" — за избора бял/тъмен текст на етикета.
function luminanza(rgb) {
  const m = rgb.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!m) return 0.5;
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(+m[1]) + 0.7152 * lin(+m[2]) + 0.0722 * lin(+m[3]);
}

function cartogramma(regioniData) {
  const byKey = new Map(regioniData.map((r) => [r.key, r]));
  const vals = regioniData.filter((r) => r.senzaGaraPct != null).map((r) => r.senzaGaraPct);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const shapes = Object.entries(REGIONI)
    .map(([key, meta]) => {
      const d = REGIONI_GEO[meta.istat];
      if (!d) return '';
      const r = byKey.get(key);
      const pctv = r ? r.senzaGaraPct : null;
      const t = pctv != null && max > min ? (pctv - min) / (max - min) : null;
      const fill = t != null ? scalaRossi(t) : '#c9d2db';
      const pct = pctv != null ? `${Math.round(pctv * 100)}%` : 'n.d.';
      const label = `${meta.nome}: senza gara ${pct}${r ? `, ${r.nEnti} strutture` : ''}`;
      const pos = MAP_LABELS[meta.istat] || null;
      let etichetta = '';
      if (pos && pctv != null) {
        if (pos.fuori) {
          // изнесен етикет: една линия „ABBR · %“ в цвета на темата + водеща линия
          const f = pos.fuori;
          etichetta = `<line x1="${f.lx1}" y1="${f.ly1}" x2="${f.lx2}" y2="${f.ly2}" stroke="var(--muted)" stroke-width="1.4" pointer-events="none"></line>
        <text x="${f.tx}" y="${f.ty}" text-anchor="middle" font-size="26" font-weight="650" fill="var(--ink)" stroke="var(--bg)" stroke-width="5" paint-order="stroke" stroke-linejoin="round" pointer-events="none">${esc(meta.abbr)} ${pct}</text>`;
        } else {
          // вътрешен етикет: контурен ореол (paint-order:stroke) → четимо върху всеки цвят.
          // Бял или тъмен текст се избира по РЕАЛНАТА светимост (WCAG relative
          // luminance) на запълването — прагът по t греши на средните тонове.
          const chiaro = luminanza(fill) < 0.25;
          const testo = chiaro ? '#fff' : '#26313c';
          const alone = chiaro ? 'rgba(60,10,5,.55)' : 'rgba(255,255,255,.9)';
          etichetta = `<text x="${pos.x}" y="${pos.y - 5}" text-anchor="middle" font-size="30" font-weight="700" letter-spacing=".5" fill="${testo}" stroke="${alone}" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round" pointer-events="none">${esc(meta.abbr)}</text>
        <text x="${pos.x}" y="${pos.y + 21}" text-anchor="middle" font-size="24" font-weight="600" fill="${testo}" stroke="${alone}" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round" pointer-events="none">${pct}</text>`;
        }
      }
      return `<a href="regione/${key}.html" role="listitem"><title>${esc(label)}</title>
      <path d="${d}" fill="${fill}" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"></path>${etichetta}</a>`;
    })
    .join('\n');
  const legW = 220;
  const legStops = [0, 0.25, 0.5, 0.75, 1].map((s) => `<stop offset="${s * 100}%" stop-color="${scalaRossi(s)}"></stop>`).join('');
  return `<figure class="mapfig">
<svg viewBox="${VIEWBOX}" role="list" aria-label="Carta dell’Italia: quota di appalti senza gara per regione" class="italia">
${shapes}
</svg>
<div class="maplegend">
  <span class="small muted">Quota senza gara:</span>
  <svg width="${legW}" height="14" aria-hidden="true"><defs><linearGradient id="lg">${legStops}</linearGradient></defs><rect width="${legW}" height="14" rx="3" fill="url(#lg)"></rect></svg>
  <span class="small muted">${Math.round(min * 100)}% → ${Math.round(max * 100)}%</span>
</div>
<figcaption class="small muted">Ogni regione è colorata per <strong>quota di appalti aggiudicati senza gara</strong>
(affidamento diretto + negoziata senza pubblicazione, sul numero di contratti). Passa il mouse per i dettagli, clicca per
la scheda. Confini: © <a href="https://www.istat.it/">ISTAT</a> (CC BY 4.0); dati appalti: ANAC.</figcaption>
</figure>`;
}

export function renderRegioniIndex({ regioniData }) {
  const ordinate = [...regioniData].filter((r) => r.senzaGaraPct != null).sort((a, b) => b.senzaGaraPct - a.senzaGaraPct);
  const rows = ordinate
    .map(
      (r) => `<tr>
      <td><a href="regione/${r.key}.html">${esc(r.nome)}</a></td>
      <td class="num">${percentualeIt(r.senzaGaraPct)}</td>
      <td class="num">${numeroIt(r.nEnti)}</td>
      <td class="num">${euroCompact(r.valore)}</td>
      <td class="num ${r.risultato < 0 ? 'neg' : 'pos'}">${euroCompact(r.risultato)}</td>
    </tr>`
    )
    .join('');
  const body = `
<h1>Le regioni a confronto</h1>
<p class="lead">La sanità è organizzata su base regionale: ogni Regione governa le proprie aziende. La carta mostra,
per regione, la <strong>quota di appalti senza gara</strong> — un indicatore di apertura del mercato, non una prova di
irregolarità. Clicca una regione per la scheda completa.</p>

${cartogramma(regioniData)}

<h2>Classifica per quota senza gara</h2>
<p class="muted small">Ordinate dalla quota più alta. Il «risultato» è la somma dei risultati d’esercizio delle sole
aziende (senza la Gestione Sanitaria Accentrata regionale), quindi non è il disavanzo «vero» della regione.</p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Regione</th><th class="num" scope="col">Senza gara</th><th class="num" scope="col">Strutture</th><th class="num" scope="col">Valore produzione</th><th class="num" scope="col">Risultato aziende</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<p class="small muted">La quota «senza gara» è calcolata sul 100% dei contratti ANAC di ogni sezione regionale
(dato robusto per il confronto tra regioni). Sette regioni sono in <strong>piano di rientro</strong> (Calabria e
Molise commissariate) — il contesto è indicato nelle rispettive schede. <a href="appalti.html">Dettaglio appalti →</a></p>
`;
  return page({
    title: 'Regioni a confronto — Ospedali Trasparenti',
    description: 'Carta schematica dell’Italia e classifica regionale della quota di appalti senza gara nella sanità pubblica. Dati ANAC.',
    active: 'regioni.html',
    body,
  });
}

export function renderRegione({ key, meta, g, appReg, senzaGaraPct, segnByCod, ultimoAnnoCe, slugByCod }) {
  const hrefStrut = (cod) => `../struttura/${cod}-${slugByCod.get(cod)}.html`;
  // структури, подредени по брой/тежест на сигналите
  const gravOrd = { alta: 3, media: 2, bassa: 1 };
  const strutture = [...g.enti]
    .map((e) => {
      const s = segnByCod.get(e.codice);
      const { y } = ultimoCe(e);
      return { e, nSeg: s ? s.segnalazioni.length : 0, gravMax: s ? s.gravitaMax : null, valore: y.valoreProduzione, ris: y.risultatoEsercizio };
    })
    .sort((a, b) => (gravOrd[b.gravMax] || 0) - (gravOrd[a.gravMax] || 0) || b.nSeg - a.nSeg || (b.valore || 0) - (a.valore || 0));
  const rows = strutture
    .map(
      (r) => `<tr>
      <td><a href="${hrefStrut(r.e.codice)}">${esc(r.e.denominazione)}</a></td>
      <td>${r.gravMax ? badge(r.gravMax) : '<span class="small muted">—</span>'}</td>
      <td class="num">${r.nSeg || ''}</td>
      <td class="num">${r.valore != null ? euroCompact(r.valore) : '—'}</td>
      <td class="num ${r.ris < 0 ? 'neg' : 'pos'}">${r.ris != null ? euroCompact(r.ris) : '—'}</td>
    </tr>`
    )
    .join('');
  // разбивка на поръчките за региона
  let appaltiBlk = '';
  if (appReg) {
    const cat = appReg.cat;
    const ordine = [
      ['diretto', 'Affidamento diretto'],
      ['negoziataSenza', 'Negoziata senza pubblicazione'],
      ['negoziata', 'Negoziata con pubblicazione'],
      ['competitiva', 'Procedura aperta/competitiva'],
      ['quadro', 'Accordo quadro/convenzione'],
      ['altro', 'Altro'],
    ];
    const catRows = ordine
      .filter(([k]) => cat[k] && cat[k].n)
      .map(([k, lab]) => `<tr><td>${lab}</td><td class="num">${numeroIt(cat[k].n)}</td><td class="num">${euroCompact(cat[k].importo)}</td></tr>`)
      .join('');
    appaltiBlk = `
<h2>Appalti sanitari della regione</h2>
<div class="grid kpis">
  ${kpi('Contratti (sezione regionale)', numeroIt(appReg.n))}
  ${kpi('Valore complessivo', euroCompact(appReg.importo))}
  ${kpi('Quota senza gara', senzaGaraPct != null ? percentualeIt(senzaGaraPct) : '—', senzaGaraPct > 0.5 ? 'neg' : '')}
  ${kpi('Sotto soglia (frazionamento?)', numeroIt((appReg.band40 || 0) + (appReg.band140 || 0)))}
</div>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Tipo di procedura</th><th class="num" scope="col">Contratti</th><th class="num" scope="col">Valore</th></tr></thead>
  <tbody>${catRows}</tbody>
</table></div>
<p class="small muted">«Senza gara» = affidamento diretto + negoziata senza pubblicazione (esclusi gli accordi quadro,
già messi a gara a monte), sul numero di contratti. Gli affidamenti sotto soglia appena inferiori ai limiti di legge
(35–40k / 130–140k €) sono un possibile segnale di frazionamento, <strong>non una prova</strong>.</p>`;
  }
  const body = `
<p class="small muted"><a href="../regioni.html">← Tutte le regioni</a></p>
<h1>${esc(meta.nome)}</h1>
${PIANO_RIENTRO[key] ? `<div class="seg ${PIANO_RIENTRO[key] === 'commissariata' ? 'alta' : 'media'}"><div class="t"><span class="badge ${PIANO_RIENTRO[key] === 'commissariata' ? 'alta' : 'media'}">${PIANO_RIENTRO[key] === 'commissariata' ? 'Commissariata' : 'Piano di rientro'}</span></div><div class="d">La sanità di questa regione è sottoposta a <strong>piano di rientro</strong>${PIANO_RIENTRO[key] === 'commissariata' ? ' con <strong>commissariamento</strong>' : ''}: i conti sono sotto controllo del Ministero della Salute e del MEF. Contesto essenziale per leggere deficit e vincoli di spesa. <a href="https://www.salute.gov.it/new/it/tema/piani-di-rientro/" target="_blank" rel="noopener">Fonte ufficiale</a>.</div></div>` : ''}
<div class="grid kpis">
  ${kpi('Strutture con bilancio', `${numeroIt(g.conCe)} / ${numeroIt(g.enti.length)}`)}
  ${kpi(`Valore produzione (${ultimoAnnoCe})`, euroCompact(g.valore))}
  ${kpi('Risultato aziende (aggregato)', euroCompact(g.risultato), g.risultato < 0 ? 'neg' : 'pos')}
  ${kpi('Strutture in perdita', `${numeroIt(g.nInPerdita)} / ${numeroIt(g.conCe)}`, g.nInPerdita > g.conCe / 2 ? 'neg' : '')}
</div>
<div class="note"><strong>Nota.</strong> Il «risultato aziende» somma i soli conti economici delle aziende della regione;
non include la Gestione Sanitaria Accentrata (GSA), che a livello regionale copre gran parte dei disavanzi. È quindi un
dato di contesto, non il disavanzo «vero» della regione. → <a href="../inchiesta.html">L’inchiesta sul deficit</a></div>
${appaltiBlk}
<h2>Strutture della regione</h2>
<p class="muted small">Ordinate per gravità e numero delle segnalazioni contabili automatiche (indicatori, non accuse).</p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Struttura</th><th scope="col">Gravità</th><th class="num" scope="col">Segn.</th><th class="num" scope="col">Valore prod.</th><th class="num" scope="col">Risultato</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
`;
  const su = siteUrl();
  const jsonldReg = su
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          briciole([['Home', '/'], ['Regioni', 'regioni.html'], [meta.nome, `regione/${key}.html`]]),
          {
            '@type': 'Dataset',
            name: `Sanità pubblica in ${meta.nome}: conti e appalti`,
            spatialCoverage: { '@type': 'Place', name: meta.nome, address: { '@type': 'PostalAddress', addressCountry: 'IT' } },
            temporalCoverage: '2012/2024',
            license: 'https://creativecommons.org/licenses/by/4.0/',
            url: `${su}/regione/${key}.html`,
          },
        ],
      }
    : null;
  return page({
    title: `${esc(meta.nome)} — sanità pubblica — Ospedali Trasparenti`,
    description: `Conti e appalti delle aziende sanitarie e ospedaliere pubbliche in ${esc(meta.nome)}: valore della produzione, risultato, quota di appalti senza gara.`,
    active: 'regioni.html',
    rel: '../',
    canonical: `regione/${key}.html`,
    jsonld: jsonldReg,
    body,
  });
}
