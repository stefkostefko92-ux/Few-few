// Автоматично сигнализиране на подозрителни/тревожни модели в счетоводните
// данни на публичните болници. Всяко правило се основава на официалните CE/SP
// показатели, обяснено е на италиански и има тежест (gravità).
//
// ВАЖНО: това са АВТОМАТИЧНИ индикатори, които изискват проверка от човек —
// не са обвинения. Аномалия може да има напълно законно обяснение
// (сливане на структури, извънредно финансиране, промяна на модела и т.н.).
//
// Изход: data/segnalazioni.json.

// @ts-check
import { loadDataset, tipoEnte, anniConCe } from './lib/dataset.js';
import { writeJson } from './lib/http.js';
import { SEGNALAZIONI_FILE } from './lib/paths.js';
// median/percentile са изнесени в общ модул (DRY) — реекспорт за обратна
// съвместимост с тестовете, които ги вземат оттук.
import { median, percentile } from './lib/stats.js';
export { median, percentile };

/** @typedef {import('./lib/dataset.js').Ente} Ente */
/** @typedef {import('./lib/dataset.js').SerieAnno} SerieAnno */
/**
 * @typedef {object} Derivati производни коефициенти за една година
 * @property {number} [deficitRatio]
 * @property {number} [coperturaCosti]
 * @property {number} [personaleRatio]
 * @property {number} [debitiSuAttivo]
 */
/**
 * @typedef {object} Segnalazione единичен сигнал
 * @property {string} regola
 * @property {string} gravita
 * @property {number} peso
 * @property {string} titolo
 * @property {string} dettaglio
 * @property {number|null} [anno]
 */
/**
 * @typedef {object} AnalyzeCtx контекст с националните прагове
 * @property {number} ultimoAnnoCe
 * @property {number|null} personaleP90
 * @property {number|null} personaleMediano
 */

// Прагове (обосновани, консервативни — да не се вдига шум).
export const SOGLIE = {
  disavanzoGrave: 0.05, // резултат < -5% от приходите → тежък дефицит
  annoRecenteDa: 5, // разглеждаме последните N години за устойчивост
  saltoRicavi: 0.3, // YoY скок в приходите > 30%
  saltoCosti: 0.25, // YoY скок в разходите > 25%
  crescitaDebiti: 0.4, // ръст на задълженията > 40% за периода
  arrotondamento: 100_000, // резултат — точно кратно на това → възможен корекционен запис
};

/** @type {Record<string, number>} */
const PESO = { alta: 100, media: 30, bassa: 8 };

const fmtEur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtPct = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 1 });
/**
 * @param {number|null|undefined} v
 * @returns {string}
 */
function eur(v) {
  return v == null ? '—' : fmtEur.format(Math.round(v));
}
/**
 * @param {number|null|undefined} v
 * @param {boolean} [segno]
 * @returns {string}
 */
function pct(v, segno = false) {
  if (v == null) return '—';
  const s = fmtPct.format(v);
  return segno && v > 0 ? `+${s}` : s;
}

/**
 * Производни коефициенти за една година.
 * @param {SerieAnno} y
 * @returns {Derivati}
 */
export function derivati(y) {
  /** @type {Derivati} */
  const d = {};
  if (y.risultatoEsercizio != null && y.valoreProduzione > 0)
    d.deficitRatio = y.risultatoEsercizio / y.valoreProduzione;
  if (y.costiProduzione != null && y.valoreProduzione > 0)
    d.coperturaCosti = y.costiProduzione / y.valoreProduzione;
  if (y.costoPersonale != null && y.valoreProduzione > 0)
    d.personaleRatio = y.costoPersonale / y.valoreProduzione;
  if (y.debiti != null && y.totaleAttivo > 0) d.debitiSuAttivo = y.debiti / y.totaleAttivo;
  return d;
}

/**
 * Прилага всички правила върху една структура и връща сортиран списък сигнали.
 * @param {Ente} ente
 * @param {AnalyzeCtx} ctx
 * @returns {Segnalazione[]}
 */
export function analizzaEnte(ente, ctx) {
  const { ultimoAnnoCe, personaleP90, personaleMediano } = ctx;
  /** @type {Segnalazione[]} */
  const seg = [];
  /**
   * @param {string} regola
   * @param {string} gravita
   * @param {string} titolo
   * @param {string} dettaglio
   * @param {number|null} [anno]
   */
  const push = (regola, gravita, titolo, dettaglio, anno) =>
    seg.push({ regola, gravita, peso: PESO[gravita] ?? 1, titolo, dettaglio, anno });

  const anni = [...ente.serie.keys()].sort((a, b) => a - b);
  const anniCe = anniConCe(ente);
  const anniRecenti = anniCe.filter((a) => a > ultimoAnnoCe - SOGLIE.annoRecenteDa);
  const ultimo = anniCe.at(-1);
  const yUlt = ultimo != null ? ente.serie.get(ultimo) : null;
  const dUlt = yUlt ? derivati(yUlt) : {};

  // 1) Тежък дефицит в последната година
  if (dUlt.deficitRatio != null && dUlt.deficitRatio < -SOGLIE.disavanzoGrave) {
    push(
      'disavanzo_grave',
      'alta',
      'Disavanzo grave nell’ultimo esercizio',
      `Nel ${ultimo} il risultato d’esercizio è pari al ${pct(dUlt.deficitRatio)} del valore della produzione ` +
        `(${eur(yUlt?.risultatoEsercizio)} su ${eur(yUlt?.valoreProduzione)}).`,
      ultimo
    );
  }

  // 2) Устойчив дефицит
  const negativi = anniRecenti.filter((a) => {
    const r = ente.serie.get(a)?.risultatoEsercizio;
    return r != null && r < 0;
  });
  if (anniRecenti.length >= 3 && negativi.length >= anniRecenti.length - 1 && negativi.length >= 3) {
    push(
      'disavanzo_persistente',
      'media',
      'Disavanzo persistente',
      `Risultato d’esercizio negativo in ${negativi.length} degli ultimi ${anniRecenti.length} esercizi ` +
        `(${negativi.join(', ')}).`,
      ultimo
    );
  }

  // 3) Отрицателно нетно имущество (техническа несъстоятелност)
  const spUlt = [...ente.serie.entries()]
    .filter(([, y]) => y.patrimonioNetto != null)
    .sort((a, b) => a[0] - b[0])
    .at(-1);
  if (spUlt && spUlt[1].patrimonioNetto < 0) {
    push(
      'patrimonio_netto_negativo',
      'alta',
      'Patrimonio netto negativo',
      `Nel ${spUlt[0]} il patrimonio netto è negativo (${eur(spUlt[1].patrimonioNetto)}): ` +
        `situazione di potenziale squilibrio patrimoniale.`,
      spUlt[0]
    );
  }

  // 4) Задължения над целия актив
  if (dUlt.debitiSuAttivo != null && dUlt.debitiSuAttivo > 1) {
    const ySp = (spUlt ? ente.serie.get(spUlt[0]) : undefined) || yUlt;
    push(
      'debiti_oltre_attivo',
      'alta',
      'Debiti superiori al totale attivo',
      `I debiti (${eur(ySp?.debiti)}) superano il totale attivo (${eur(ySp?.totaleAttivo)}).`,
      spUlt?.[0] ?? ultimo
    );
  }

  // 5) Структурен дисбаланс: разходите надвишават приходите ≥3 г.
  const squilibrio = anniRecenti.filter((a) => {
    const d = derivati(ente.serie.get(a) ?? {});
    return d.coperturaCosti != null && d.coperturaCosti > 1;
  });
  if (squilibrio.length >= 3) {
    push(
      'squilibrio_strutturale',
      'media',
      'Squilibrio strutturale costi/ricavi',
      `Costi della produzione superiori al valore della produzione in ${squilibrio.length} esercizi recenti ` +
        `(${squilibrio.join(', ')}).`,
      ultimo
    );
  }

  // 6) Аномален годишен скок в приходите/разходите
  for (let i = 1; i < anniCe.length; i++) {
    const a0 = anniCe[i - 1];
    const a1 = anniCe[i];
    const y0 = ente.serie.get(a0);
    const y1 = ente.serie.get(a1);
    if (!y0 || !y1) continue; // невъзможно — a0/a1 са ключове от серията
    if (y0.valoreProduzione > 0 && y1.valoreProduzione != null) {
      const g = (y1.valoreProduzione - y0.valoreProduzione) / y0.valoreProduzione;
      if (Math.abs(g) > SOGLIE.saltoRicavi) {
        push(
          'salto_ricavi',
          'bassa',
          `Variazione anomala dei ricavi (${a1})`,
          `Il valore della produzione varia del ${pct(g, true)} tra ${a0} (${eur(y0.valoreProduzione)}) ` +
            `e ${a1} (${eur(y1.valoreProduzione)}). Possibile riorganizzazione, fusione o discontinuità di rendicontazione.`,
          a1
        );
      }
    }
    if (y0.costiProduzione > 0 && y1.costiProduzione != null) {
      const g = (y1.costiProduzione - y0.costiProduzione) / y0.costiProduzione;
      if (Math.abs(g) > SOGLIE.saltoCosti) {
        push(
          'salto_costi',
          'media',
          `Variazione anomala dei costi (${a1})`,
          `I costi della produzione variano del ${pct(g, true)} tra ${a0} (${eur(y0.costiProduzione)}) ` +
            `e ${a1} (${eur(y1.costiProduzione)}).`,
          a1
        );
      }
    }
  }

  // 7) Много висок дял на разходите за персонал спрямо сектора
  if (dUlt.personaleRatio != null && personaleP90 != null && dUlt.personaleRatio > personaleP90) {
    push(
      'personale_elevato',
      'bassa',
      'Incidenza del personale tra le più alte',
      `Nel ${ultimo} il costo del personale è il ${pct(dUlt.personaleRatio)} del valore della produzione ` +
        `(mediana nazionale ${pct(personaleMediano)}). Indicatore contestuale, da valutare con l’attività svolta.`,
      ultimo
    );
  }

  // 8) Силен ръст на задълженията през периода
  const debitiSerie = /** @type {[number, number][]} */ (
    anni.map((a) => [a, ente.serie.get(a)?.debiti]).filter(([, v]) => v != null && v > 0)
  );
  if (debitiSerie.length >= 2) {
    const [a0, v0] = debitiSerie[0];
    const [a1, v1] = debitiSerie[debitiSerie.length - 1];
    const g = (v1 - v0) / v0;
    if (g > SOGLIE.crescitaDebiti) {
      push(
        'crescita_debiti',
        'bassa',
        'Forte crescita dell’indebitamento',
        `I debiti crescono del ${pct(g, true)} tra ${a0} (${eur(v0)}) e ${a1} (${eur(v1)}).`,
        a1
      );
    }
  }

  // 9) Дупка в рилевацията (липсваща година в средата на серията)
  if (anniCe.length >= 2) {
    /** @type {number[]} */
    const mancanti = [];
    for (let a = anniCe[0]; a < anniCe[anniCe.length - 1]; a++) {
      if (!anniCe.includes(a)) mancanti.push(a);
    }
    if (mancanti.length > 0) {
      push(
        'buco_rendicontazione',
        'bassa',
        'Buco nella rendicontazione',
        `Mancano i dati CE per: ${mancanti.join(', ')} (serie ${anniCe[0]}–${anniCe.at(-1)}).`,
        anniCe.at(-1)
      );
    }
  }

  // 10) Подозрително „кръгъл“ резултат — възможен корекционен/балансиращ запис
  if (
    yUlt?.risultatoEsercizio != null &&
    yUlt.risultatoEsercizio !== 0 &&
    Math.abs(yUlt.risultatoEsercizio) >= SOGLIE.arrotondamento &&
    yUlt.risultatoEsercizio % SOGLIE.arrotondamento === 0
  ) {
    push(
      'risultato_arrotondato',
      'bassa',
      'Risultato d’esercizio “troppo tondo”',
      `Nel ${ultimo} il risultato è esattamente ${eur(yUlt.risultatoEsercizio)} (multiplo netto di ` +
        `${eur(SOGLIE.arrotondamento)}): possibile arrotondamento o scrittura di pareggio da verificare.`,
      ultimo
    );
  }

  seg.sort((a, b) => b.peso - a.peso || (b.anno ?? 0) - (a.anno ?? 0));
  return seg;
}

async function main() {
  const { enti, ultimoAnnoCe } = await loadDataset();

  // Динамичен праг за дела на разходите за персонал (90-и персентил за
  // последната година), за да е контекстуален спрямо реалния сектор.
  const personaleRatios = [];
  for (const ente of enti) {
    const y = ente.serie.get(ultimoAnnoCe);
    if (y) {
      const d = derivati(y);
      if (d.personaleRatio != null) personaleRatios.push(d.personaleRatio);
    }
  }
  const personaleP90 = percentile(personaleRatios, 90);
  const personaleMediano = median(personaleRatios);
  const ctx = { ultimoAnnoCe, personaleP90, personaleMediano };

  const perEnte = [];
  const tutte = [];
  for (const ente of enti) {
    const seg = analizzaEnte(ente, ctx);
    if (seg.length === 0) continue;
    perEnte.push({
      codice: ente.codice,
      denominazione: ente.denominazione,
      regione: ente.regione,
      tipo: tipoEnte(ente.codEnte, ente.anag),
      gravitaMax: seg[0].gravita,
      pesoTotale: seg.reduce((s, x) => s + x.peso, 0),
      segnalazioni: seg,
    });
    for (const s of seg) tutte.push({ codice: ente.codice, denominazione: ente.denominazione, regione: ente.regione, ...s });
  }

  perEnte.sort((a, b) => b.pesoTotale - a.pesoTotale || a.codice.localeCompare(b.codice));

  /** @type {Record<string, number>} */
  const perRegola = {};
  /** @type {Record<string, number>} */
  const perGravita = { alta: 0, media: 0, bassa: 0 };
  for (const s of tutte) {
    perRegola[s.regola] = (perRegola[s.regola] || 0) + 1;
    perGravita[s.gravita]++;
  }

  const out = {
    generatoIl: new Date().toISOString(),
    ultimoAnnoCe,
    entiAnalizzati: enti.length,
    entiConSegnalazioni: perEnte.length,
    totaleSegnalazioni: tutte.length,
    perGravita,
    perRegola,
    soglie: {
      disavanzoGrave: SOGLIE.disavanzoGrave,
      saltoRicavi: SOGLIE.saltoRicavi,
      saltoCosti: SOGLIE.saltoCosti,
      crescitaDebiti: SOGLIE.crescitaDebiti,
      personaleP90,
      personaleMediano,
    },
    enti: perEnte,
  };
  await writeJson(SEGNALAZIONI_FILE, out);
  console.log(
    `Готово: ${tutte.length} сигнала за ${perEnte.length}/${enti.length} структури ` +
      `(alta ${perGravita.alta}, media ${perGravita.media}, bassa ${perGravita.bassa}) → ${SEGNALAZIONI_FILE}`
  );
}

// изпълни main() само когато файлът се стартира директно (не при import от тест)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Грешка:', err);
    process.exitCode = 1;
  });
}
