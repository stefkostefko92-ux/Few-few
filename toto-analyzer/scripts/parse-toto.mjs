/*
 * Споделен парсер за официалната страница с резултати на toto.bg.
 *
 * Ползва се и от fetch-results.mjs (текущи тегления), и от
 * backfill-wayback.mjs (исторически снимки). Държим логиката на едно място,
 * за да се поддържа лесно при промяна на сайта.
 */

// Игрите, които извличаме: pool/picks + как изглежда името в HTML.
export const GAMES = {
  "5x35": { id: "5x35", pool: 35, picks: 5, label: "5 / 35" },
  "6x42": { id: "6x42", pool: 42, picks: 6, label: "6 / 42" },
  "6x49": { id: "6x49", pool: 49, picks: 6, label: "6 / 49" },
};

// Нормализира заглавие като "6 / 49" / "6/49" → "6x49".
function nameToId(name) {
  const m = name.replace(/\s+/g, "").match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  const id = m[1] + "x" + m[2];
  return GAMES[id] ? id : null;
}

// Дата "ДД.ММ.ГГГГ" → "ГГГГ-ММ-ДД".
function normDate(d) {
  const m = d.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const pad = (x) => (String(x).length < 2 ? "0" + x : String(x));
  return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
}

/*
 * Парсва HTML на /results страницата. Връща масив от:
 *   { gameId, draw, date, numbers }
 * Страницата показва последния тираж само за изтеглените този ден игри,
 * затова резултатът може да съдържа 1–3 игри.
 */
export function parseResultsPage(html) {
  const out = [];
  // Всеки блок с резултат започва с <h3 class="game-name-blue">ИМЕ</h3>.
  const headerRe = /<h3 class="game-name-blue">\s*([^<]+?)\s*<\/h3>/g;
  let m;
  while ((m = headerRe.exec(html)) !== null) {
    const id = nameToId(m[1]);
    if (!id) continue;
    const game = GAMES[id];
    // Прозорец след заглавието, в който се намират тиражът и числата.
    const region = html.slice(m.index, m.index + 3500);

    const tirajM = region.match(/class="tiraj">\s*Тираж\s*(\d+)\s*-\s*([\d.]+)/i);
    const draw = tirajM ? parseInt(tirajM[1], 10) : null;
    const date = tirajM ? normDate(tirajM[2]) : null;

    // Печелившите числа са в <span class="ball-white" ...>NN</span>.
    const numbers = [];
    const ballRe = /class="ball-white"[^>]*>\s*(\d+)\s*</g;
    let bm;
    while ((bm = ballRe.exec(region)) !== null && numbers.length < game.picks) {
      numbers.push(parseInt(bm[1], 10));
    }

    if (numbers.length === game.picks) {
      out.push({ gameId: id, draw, date, numbers });
    }
  }
  return out;
}
