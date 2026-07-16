// Страница „Esiti clinici e spesa" (PNE — Programma Nazionale Esiti, AGENAS).
// Кръстосва РЕГИОНАЛНИ клинични резултати (риск-нагласени) с разхода на глава,
// за да покаже КЪДЕ се харчи много И се лекува относително по-зле — като ВЪПРОС,
// не като присъда. Рамка: „indicatore, non prova" — риск-нагласени стойности,
// различни обеми, различни казуистики.
//
// ⚠️ ЛИЦЕНЗ: PNE няма изричен open-data лиценз → показваме само РЕГИОНАЛНИ
// агрегати (не суровата таблица) + изрична атрибуция „Fonte: AGENAS — PNE" и
// видима връзка към pne.agenas.it като първоизточник.
//
// Изнася само render функцията; данните се подават от build-site.js:
//   pne             = обектът от data/pne.json (fetch-pne aggregaRegione)
//   costiPerAbitante = { key → разход на глава (€) } (по избор; крие се при липса)
//   nomeReg         = (key) → четимо име на региона (при липса покажи ключа)

// @ts-check
import { page, kpi, hbars } from './lib/site-ui.js';
import { numeroIt, euroIt, esc } from './lib/format.js';

/** Процент от PNE (стойността е вече в проценти, напр. 25,3 → „25,3%").
 * @param {number|null|undefined} v @returns {string} */
function pct(v) {
  return v == null ? '—' : `${v.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`;
}

/** Клас за клетка спрямо националната средна и посоката на „по-добре".
 * @param {number|null|undefined} v @param {number|null|undefined} naz @param {string} [tipoMigliore] @returns {string} */
function classeCella(v, naz, tipoMigliore) {
  if (v == null || naz == null) return '';
  const soglia = 0.05; // ±5% относителна разлика → неутрално
  const rel = (v - naz) / (Math.abs(naz) || 1);
  const migliore = tipoMigliore === 'basso' ? rel < -soglia : rel > soglia;
  const peggiore = tipoMigliore === 'basso' ? rel > soglia : rel < -soglia;
  return migliore ? 'pos' : peggiore ? 'neg' : '';
}

/**
 * @param {{ pne: { indicatori?: any[], perRegione?: Record<string, any>, nazionale?: Record<string, any>, copertura?: Record<string, any>, edizione?: string }, costiPerAbitante: Record<string, number>|unknown, nomeReg: ((k: string) => string)|unknown }} p
 * @returns {string}
 */
export function renderPne({ pne, costiPerAbitante, nomeReg }) {
  /** @type {(k: string) => string} */
  const nome = typeof nomeReg === 'function' ? /** @type {(k: string) => string} */ (nomeReg) : (k) => k;
  /** @type {Record<string, number>} */
  const costi = costiPerAbitante && typeof costiPerAbitante === 'object' ? /** @type {Record<string, number>} */ (costiPerAbitante) : {};
  const conCosti = Object.keys(costi).length > 0;
  const inds = Array.isArray(pne.indicatori) ? pne.indicatori : [];
  const perRegione = pne.perRegione || {};
  const nazionale = pne.nazionale || {};
  /** @param {string} codice */
  const nInd = (codice) => (nazionale[codice] ? nazionale[codice].valore : null);

  // редовете (региони), които имат поне един подбран индикатор
  const chiavi = Object.keys(perRegione);

  // ---- KPI: национални стойности за 3-4 водещи индикатора ----
  const kpiOrder = ['cesarei', 'femore48', 'mortalitaIma', 'mortalitaIctus'];
  /** @type {Record<string, string>} */
  const etichetteKpi = {
    cesarei: 'Parti cesarei primari',
    femore48: 'Femore operato entro 48h',
    mortalitaIma: 'Mortalità a 30gg — infarto',
    mortalitaIctus: 'Mortalità a 30gg — ictus',
    mortalitaScompenso: 'Mortalità a 30gg — scompenso',
    colecistectomia: 'Colecistectomia laparoscopica',
  };
  const kpiCards = kpiOrder
    .map((ch) => inds.find((i) => i.chiave === ch))
    .filter(Boolean)
    .map((i) => kpi(etichetteKpi[i.chiave] || i.chiave, pct(nInd(i.codice))))
    .join('');

  // ---- Таблица „soldi vs esiti": региони × (spesa pro capite + индикатори) ----
  const cols = inds;
  const righe = chiavi
    .map((key) => {
      const spesa = conCosti ? costi[key] ?? null : null;
      const celle = cols
        .map((ind) => {
          const g = perRegione[key][ind.codice];
          const v = g ? g.valore : null;
          const cls = classeCella(v, nInd(ind.codice), ind.tipoMigliore);
          return `<td class="num ${cls}">${pct(v)}</td>`;
        })
        .join('');
      return {
        key,
        spesa,
        html: `<tr><td><a href="regione/${esc(key)}.html">${esc(nome(key) || key)}</a></td>${
          conCosti ? `<td class="num">${spesa == null ? '—' : euroIt(spesa)}</td>` : ''
        }${celle}</tr>`,
      };
    })
    // подредба: при налични разходи — по разход низходящо (най-скъпите горе);
    // иначе по име
    .sort((a, b) =>
      conCosti ? (b.spesa ?? -Infinity) - (a.spesa ?? -Infinity) : String(nome(a.key)).localeCompare(String(nome(b.key)), 'it')
    )
    .map((r) => r.html)
    .join('');

  const intestazioni = cols
    .map((ind) => {
      const verso = ind.tipoMigliore === 'basso' ? '↓ meglio' : '↑ meglio';
      return `<th class="num" scope="col">${esc(shortLabel(ind.chiave))}<br><span class="small muted" style="font-weight:400">${verso}</span></th>`;
    })
    .join('');

  // ---- Един илюстративен hbars: цезарови сечения per регион ----
  const indCes = inds.find((i) => i.chiave === 'cesarei');
  let hbarsCes = '';
  if (indCes) {
    const items = /** @type {Array<{ key: string, valore: number, nStrutture: any }>} */ (
      chiavi
        .map((key) => {
          const g = perRegione[key][indCes.codice];
          return g && g.valore != null ? { key, valore: g.valore, nStrutture: g.nStrutture } : null;
        })
        .filter(Boolean)
    )
      .sort((a, b) => b.valore - a.valore)
      .map((r) => {
        const naz = nInd(indCes.codice);
        return {
          label: nome(r.key) || r.key,
          valore: r.valore,
          quota: r.valore / 100, // стойността е процент → дял [0..1]
          flag: naz != null && r.valore > naz * 1.1, // над +10% спрямо нац. → маркер
        };
      });
    hbarsCes = hbars(items, {
      fmt: (v) => pct(v),
      maxLabel: 'Parti cesarei primari per regione (percentuale risk-adjusted)',
    });
  }

  const cop = pne.copertura || {};
  const parziale =
    (cop.pagineFallite || 0) > 0 || (cop.totalPages != null && (cop.pagineLette || 0) < cop.totalPages);

  const body = `
<h1>Spendere di più cura meglio? Esiti clinici e spesa a confronto</h1>
<p class="lead">Un bilancio grande non dice se un ospedale <em>cura bene</em>. Il Programma Nazionale Esiti (PNE)
di AGENAS misura i <strong>risultati clinici</strong> — quanti pazienti sopravvivono a 30 giorni da un infarto, quanti
femori vengono operati in tempo, quanti parti finiscono in cesareo — corretti per il rischio dei pazienti. Qui li
mettiamo, regione per regione, accanto a <strong>quanto si spende</strong>: dove la spesa è alta e gli esiti restano
deboli non c'è una colpa, c'è una <strong>domanda</strong> da porre.</p>

${kpiCards ? `<div class="grid kpis">${kpiCards}</div>` : ''}

${
  indCes
    ? `<h2>Un esempio: i parti cesarei</h2>
<p class="muted small">Percentuale di parti con taglio cesareo primario (valore <strong>risk-adjusted</strong>),
per regione. L'OMS indica come fisiologica una quota molto più bassa della media italiana: valori alti segnalano un
ricorso al cesareo oltre la necessità clinica — un <em>indicatore</em>, non una prova. In rosso le regioni oltre il
+10% rispetto alla media nazionale (${pct(nInd(indCes.codice))}).</p>
${hbarsCes}`
    : ''
}

<h2>Soldi contro esiti, regione per regione</h2>
<p class="muted small">${
    conCosti
      ? 'Ordinate per <strong>spesa sanitaria pro capite</strong> (dai bilanci CE, decrescente). '
      : ''
  }Per ogni esito è indicata la direzione «meglio»: <span class="pos">verde</span> = migliore della media nazionale,
<span class="neg">rosso</span> = peggiore (oltre ±5%). Le colonne non sono sommabili tra loro: sono indicatori diversi,
su casistiche e volumi diversi.</p>
<div class="tablewrap"><table>
  <thead><tr><th scope="col">Regione</th>${
    conCosti ? '<th class="num" scope="col">Spesa pro capite</th>' : ''
  }${intestazioni}</tr></thead>
  <tbody>${righe}</tbody>
</table></div>

<div class="note"><strong>Come leggere — e i molti limiti.</strong> I valori sono <strong>risk-adjusted</strong>:
tengono conto della gravità dei pazienti, ma restano stime. Le medie regionali qui riportate sono una
<strong>ricomposizione</strong> dei dati per singola struttura, ponderata per volume di casi: schiacciano le differenze
enormi <em>dentro</em> ogni regione (un ottimo hub e un piccolo reparto finiscono nella stessa media). Volumi bassi
rendono un singolo indicatore instabile. «Spendere di più» e «curare peggio» sullo stesso rigo <strong>non provano</strong>
un nesso: la spesa pro capite dipende anche da età della popolazione, mobilità e mix di prestazioni. Questa pagina apre
domande, non emette giudizi — le risposte stanno nei dati di dettaglio di AGENAS, struttura per struttura.</div>

${
  parziale
    ? `<div class="note"><strong>Copertura parziale.</strong> L'API di PNE è fragile: sono state lette
${numeroIt(cop.pagineLette || 0)} pagine su ${numeroIt(cop.totalPages || 0)} (${numeroIt(cop.pagineFallite || 0)} saltate).
Le medie regionali sono calcolate sulle strutture effettivamente scaricate e possono essere incomplete.</div>`
    : ''
}

<p class="small muted">Fonte: <a href="https://pne.agenas.it/" target="_blank" rel="noopener">AGENAS —
Programma Nazionale Esiti (PNE)</a>, edizione ${esc(pne.edizione || '2025')} (per il Ministero della Salute).
Elaborazione propria: <strong>aggregati regionali</strong> ponderati per volume di alcuni indicatori selezionati —
<strong>non</strong> una ripubblicazione integrale del dataset. PNE non ha una licenza aperta esplicita; i valori
per singola struttura restano consultabili sul portale ufficiale. Spesa pro capite: bilanci CE (BDAP/RGS-MEF) su
popolazione residente Istat. Dati grezzi aggregati: <a href="dati.html">open data</a> (pne.json).</p>
`;

  return page({
    title: 'Spendere di più cura meglio? Esiti clinici e spesa — Ospedali Trasparenti',
    description:
      'Gli esiti clinici del Programma Nazionale Esiti (AGENAS) — mortalità, cesarei, tempi di intervento — messi a confronto con la spesa sanitaria pro capite, regione per regione. Indicatori, non prove.',
    active: 'approfondimenti.html',
    canonical: 'pne.html',
    body,
  });
}

/** Кратък етикет за колона в таблицата. @param {string} chiave @returns {string} */
function shortLabel(chiave) {
  return (
    /** @type {Record<string, string>} */ ({
      cesarei: 'Cesarei',
      femore48: 'Femore <48h',
      mortalitaIma: 'Mort. infarto',
      mortalitaIctus: 'Mort. ictus',
      mortalitaScompenso: 'Mort. scompenso',
      colecistectomia: 'Colecist. lap.',
    })[chiave] || chiave
  );
}
