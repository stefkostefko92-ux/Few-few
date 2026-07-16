// @ts-check
// „Pagella" — 5-те спии (semafori) на всяка структура, събрани на едно място.
// ЧИСТА логика (тестваема, без I/O): всяка спия е verde/giallo/rosso/nd по
// ВЕЧЕ ПУБЛИКУВАНИТЕ данни и прагове — нула нови твърдения. Езикът навсякъде:
// „spia da verificare, non prova" — броим индикатори, не издаваме присъди.
//
// Праговете са декларирани и консервативни (точност > покритие):
// - bilanci:    сигналите от analyze.js (gravità alta → rosso)
// - spesa:      форензик флаговете от forensics.js (≥2 → rosso)
// - senza gara: спрямо националната медиана на свързаните болници (>1.5× → rosso);
//               n<50 договора → nd (малка извадка, не съдим)
// - concorrenza: дял гари с един оферент (базата на участниците е ЧАСТИЧНА →
//               изискваме ≥20 гари с данни; ≥50% → rosso, ≥30% → giallo)
// - sotto soglia: дял договори в лентите точно под праговете 40k/140k спрямо
//               медианата на свързаните (>2× и ≥10 договора → rosso)

/** @typedef {import('./models.js').SegnEnte} SegnEnte */
/** @typedef {import('./models.js').ForenseEnte} ForenseEnte */
/** @typedef {import('./models.js').Autorita} Autorita */

/**
 * @typedef {object} Spia една лампа от pagella-та
 * @property {string} key
 * @property {string} label италиански етикет
 * @property {'verde'|'giallo'|'rosso'|'nd'} stato
 * @property {string} dettaglio кратко „защо" (италиански)
 */

/**
 * Смята 5-те спии на една структура. Всички входове са по избор (null = липсва
 * данен източник → nd където съдим, verde където липсата значи „няма сигнали").
 * @param {object} p
 * @param {SegnEnte|null|undefined} p.seg сигнали от analyze.js (null = нула сигнали)
 * @param {ForenseEnte|null|undefined} p.forse форензик профил (flags)
 * @param {Autorita|null|undefined} p.app свързан ANAC възложител
 * @param {number|null|undefined} p.medianaSenzaGara национална медиана на quotaSenzaGaraNum
 * @param {number|null|undefined} p.medianaSottoSoglia медиана на дела band40+band140
 * @returns {Spia[]}
 */
export function semaforoStruttura({ seg, forse, app, medianaSenzaGara, medianaSottoSoglia }) {
  /** @type {Spia[]} */
  const spie = [];

  // 1 · Bilanci (счетоводни сигнали). Липса на seg = нула сигнали → verde.
  if (seg && seg.segnalazioni.length) {
    const n = seg.segnalazioni.length;
    spie.push({
      key: 'bilanci',
      label: 'Bilanci',
      stato: seg.gravitaMax === 'alta' ? 'rosso' : 'giallo',
      dettaglio: `${n} segnalazion${n === 1 ? 'e' : 'i'} contabil${n === 1 ? 'e' : 'i'} (gravità massima: ${seg.gravitaMax})`,
    });
  } else {
    spie.push({ key: 'bilanci', label: 'Bilanci', stato: 'verde', dettaglio: 'nessuna segnalazione contabile automatica' });
  }

  // 2 · Spesa anomala (форензик флагове спрямо peer групата).
  const nFlags = forse && forse.flags ? forse.flags.length : 0;
  spie.push({
    key: 'spesa',
    label: 'Spesa anomala',
    stato: nFlags >= 2 ? 'rosso' : nFlags === 1 ? 'giallo' : 'verde',
    dettaglio: nFlags
      ? `${nFlags} vo${nFlags === 1 ? 'ce' : 'ci'} di spesa molto sopra le aziende simili`
      : 'nessuna voce di spesa fuori scala rispetto alle aziende simili',
  });

  // 3 · Senza gara (спрямо националната медиана). Малка извадка → nd.
  if (app && app.n >= 50 && app.quotaSenzaGaraNum != null && medianaSenzaGara != null) {
    const q = app.quotaSenzaGaraNum;
    spie.push({
      key: 'senzagara',
      label: 'Senza gara',
      stato: q > medianaSenzaGara * 1.5 ? 'rosso' : q > medianaSenzaGara ? 'giallo' : 'verde',
      dettaglio: `${Math.round(q * 100)}% dei contratti senza gara (mediana nazionale ${Math.round(medianaSenzaGara * 100)}%)`,
    });
  } else {
    spie.push({ key: 'senzagara', label: 'Senza gara', stato: 'nd', dettaglio: 'dati ANAC non abbinati o campione troppo piccolo' });
  }

  // 4 · Concorrenza (гари с единствен оферент; базата на участниците е частична).
  const ag = app && app.aggiu ? app.aggiu : null;
  if (ag && ag.gareConPartecipanti >= 20 && ag.quotaUnicoOfferente != null) {
    const q = ag.quotaUnicoOfferente;
    spie.push({
      key: 'concorrenza',
      label: 'Concorrenza',
      stato: q >= 0.5 ? 'rosso' : q >= 0.3 ? 'giallo' : 'verde',
      dettaglio: `${Math.round(q * 100)}% delle gare con un solo offerente (su dati parziali)`,
    });
  } else {
    spie.push({ key: 'concorrenza', label: 'Concorrenza', stato: 'nd', dettaglio: 'dati sui partecipanti insufficienti' });
  }

  // 5 · Sotto soglia (ленти 35–40k и 130–140k — възможен frazionamento).
  if (app && app.n >= 50 && medianaSottoSoglia != null && medianaSottoSoglia > 0) {
    const bande = (app.band40 || 0) + (app.band140 || 0);
    const q = bande / app.n;
    spie.push({
      key: 'sottosoglia',
      label: 'Sotto soglia',
      stato: q > medianaSottoSoglia * 2 && bande >= 10 ? 'rosso' : q > medianaSottoSoglia * 1.3 ? 'giallo' : 'verde',
      dettaglio: `${bande} affidamenti appena sotto le soglie di legge (${Math.round(q * 1000) / 10}% dei contratti)`,
    });
  } else {
    spie.push({ key: 'sottosoglia', label: 'Sotto soglia', stato: 'nd', dettaglio: 'dati ANAC non abbinati o campione troppo piccolo' });
  }

  return spie;
}

/**
 * Дял на договорите в лентите под праговете (за медианата по всички свързани).
 * @param {Autorita} a
 * @returns {number|null}
 */
export function quotaSottoSoglia(a) {
  if (!a || !a.n) return null;
  return ((a.band40 || 0) + (a.band140 || 0)) / a.n;
}

/**
 * Брои спиите по състояние (за класацията и за резюмето на страницата).
 * @param {Spia[]} spie
 * @returns {{ rosse: number, gialle: number, verdi: number, nd: number }}
 */
export function contaSpie(spie) {
  const c = { rosse: 0, gialle: 0, verdi: 0, nd: 0 };
  for (const s of spie) {
    if (s.stato === 'rosso') c.rosse++;
    else if (s.stato === 'giallo') c.gialle++;
    else if (s.stato === 'verde') c.verdi++;
    else c.nd++;
  }
  return c;
}
