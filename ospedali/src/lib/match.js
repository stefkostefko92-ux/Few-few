// @ts-check
// Свързване на болничните структури (BDAP enti) с възложителите в ANAC по име.
// За разследващ инструмент точността е по-важна от покритието: приемаме само
// уверени, еднозначни съвпадения (ядро на името + регион + уникалност).

/**
 * @typedef {object} EnteMatch болнична структура за свързване
 * @property {string} codice ключ на структурата (regione+ente)
 * @property {string} denominazione име
 * @property {string} regione регион
 */
/**
 * @typedef {object} AutoritaMatch възложител от ANAC за свързване
 * @property {string} cf данъчен код (CF/P.IVA)
 * @property {string} den денонимация
 * @property {string} reg регион (sezione_regionale)
 */

const TYPE_WORDS = new Set(
  ('AZIENDA AZIENZA SANITARIA SANITARIO SANITARIE LOCALE OSPEDALIERA OSPEDALIERO ' +
    'UNIVERSITARIA UNIVERSITARIO PROVINCIALE SOCIO TERRITORIALE UNITA USL ULSS AULSS ' +
    'IRCCS FONDAZIONE ISTITUTO OSPEDALE OSPEDALI OSPEDALIERI ENTE AGENZIA TUTELA SALUTE ' +
    'REGIONE REGIONALE ZERO ASST ARNAS SERVIZIO ASP AUSL AO AOU ASL RICOVERO CURA ' +
    'CARATTERE SCIENTIFICO POLICLINICO')
    .split(' ')
);
const STOP = new Set('DI DELLA DEL DELLE DEI E LA IL LO GLI PER DA IN CON A NORD SUD EST OVEST CITTA'.split(' '));

/**
 * Отличителни токени от името (без типовата фраза и стоп-думите).
 * @param {string} name
 * @returns {Set<string>}
 */
export function coreTokens(name) {
  let s = String(name)
    .toUpperCase()
    .replace(/À/g, "A'").replace(/È|É/g, "E'").replace(/Ì/g, "I'").replace(/Ò/g, "O'").replace(/Ù/g, "U'");
  s = s
    .replace(/\bA\.?O\.?U\.?\b/g, ' ')
    .replace(/\bA\.?O\.?\b/g, ' ')
    .replace(/\bA\.?S\.?L\.?\b/g, ' ')
    .replace(/\bA\.?U\.?S\.?L\.?\b/g, ' ')
    .replace(/\bA\.?S\.?P\.?\b/g, ' ')
    .replace(/\bA\.?S\.?S\.?T\.?\b/g, ' ')
    .replace(/\bA\.?U\.?L\.?S\.?S\.?\b/g, ' ');
  s = s.replace(/[^A-Z0-9]+/g, ' ').trim();
  // събиране на „код + число“ (TO 1 → TO1) за да съвпадне с ANAC „TO1“
  s = s.replace(/\b([A-Z]{1,3})\s+(\d{1,2})\b/g, '$1$2');
  const toks = new Set();
  for (const t of s.split(' ')) {
    if (!t || t.length < 2 || TYPE_WORDS.has(t) || STOP.has(t)) continue;
    toks.add(t);
  }
  return toks;
}

/**
 * Каноничен ключ на регион (за сравнение BDAP ↔ ANAC sezione_regionale).
 * @param {string} r
 * @returns {string}
 */
export function normReg(r) {
  return String(r)
    .toUpperCase()
    .replace('SEZIONE REGIONALE ', '')
    .replace('PROVINCIA AUTONOMA DI ', '')
    .replace(/[^A-Z]/g, '')
    .slice(0, 6);
}

/**
 * Жакардова прилика между два комплекта токени.
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number}
 */
function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Свързва възложители (ANAC) с enti (BDAP). autorita:[{cf,den,reg}].
 * Връща { byCf: Map<cf,codice>, byCodice: Map<codice,cf>, coverage }.
 * Приема само еднозначни съвпадения: най-добрият Jaccard ≥ soglia и ясно
 * по-добър от втория (разлика ≥ 0.15), при съвпадащ регион.
 * @param {EnteMatch[]} enti
 * @param {AutoritaMatch[]} autorita
 * @param {{ soglia?: number, margine?: number }} [opts]
 * @returns {{ byCf: Map<string, string>, byCodice: Map<string, string>, coverage: { enti: number, abbinate: number } }}
 */
export function matchAutoritaEnti(enti, autorita, { soglia = 0.6, margine = 0.15 } = {}) {
  const E = enti.map((e) => ({ ...e, core: coreTokens(e.denominazione), rk: normReg(e.regione) }));
  const A = autorita.map((a) => ({ ...a, core: coreTokens(a.den), rk: normReg(a.reg) }));
  const byCf = new Map();
  const byCodice = new Map();
  for (const e of E) {
    if (!e.core.size) continue;
    const cands = A.filter((a) => a.rk === e.rk && a.core.size)
      .map((a) => ({ cf: a.cf, j: jaccard(e.core, a.core) }))
      .sort((x, y) => y.j - x.j);
    if (!cands.length || cands[0].j < soglia) continue;
    if (cands.length > 1 && cands[1].j > cands[0].j - margine) continue; // двусмислено
    if (byCf.has(cands[0].cf)) continue; // вече заето от друг ente
    byCf.set(cands[0].cf, e.codice);
    byCodice.set(e.codice, cands[0].cf);
  }
  return {
    byCf,
    byCodice,
    coverage: { enti: enti.length, abbinate: byCodice.size },
  };
}
