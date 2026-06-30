/*
 * Слой за данните.
 *
 * Тегленията се пазят в localStorage (по една игра). Поддържа:
 *   - зареждане на стартови (seed) данни от data/<game>.json
 *   - импорт от CSV или JSON, който потребителят постави
 *   - ръчно добавяне на единичен тираж
 *   - демо генератор, за да е сайтът използваем веднага
 *
 * Формат на едно тегление: { date: "ГГГГ-ММ-ДД", numbers: [n1, n2, ...] }
 * Масивите се пазят подредени от НАЙ-СТАР към НАЙ-НОВ тираж.
 */
(function () {
  "use strict";

  const STORAGE_PREFIX = "toto:draws:";
  const META_PREFIX = "toto:meta:";

  function key(gameId) {
    return STORAGE_PREFIX + gameId;
  }
  function metaKey(gameId) {
    return META_PREFIX + gameId;
  }

  function load(gameId) {
    try {
      const raw = localStorage.getItem(key(gameId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function save(gameId, draws) {
    sortDraws(draws);
    localStorage.setItem(key(gameId), JSON.stringify(draws));
  }

  function getMeta(gameId) {
    try {
      return JSON.parse(localStorage.getItem(metaKey(gameId)) || "{}");
    } catch (e) {
      return {};
    }
  }
  function setMeta(gameId, meta) {
    localStorage.setItem(metaKey(gameId), JSON.stringify(meta));
  }

  function clear(gameId) {
    localStorage.removeItem(key(gameId));
    localStorage.removeItem(metaKey(gameId));
  }

  // Подрежда по дата възходящо; тиражите без дата запазват реда си най-отзад.
  function sortDraws(draws) {
    draws.sort((a, b) => {
      if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });
  }

  // Валидира едно тегление спрямо правилата на играта.
  function validateDraw(numbers, game) {
    if (!Array.isArray(numbers)) return "Числата трябва да са списък.";
    if (numbers.length !== game.picks)
      return `Очакват се точно ${game.picks} числа, а са подадени ${numbers.length}.`;
    const seen = new Set();
    for (const n of numbers) {
      if (!Number.isInteger(n)) return `„${n}" не е цяло число.`;
      if (n < 1 || n > game.pool)
        return `Числото ${n} е извън диапазона 1–${game.pool}.`;
      if (seen.has(n)) return `Числото ${n} се повтаря в тиража.`;
      seen.add(n);
    }
    return null; // валидно
  }

  // Парсва текст (CSV или JSON) в масив от тегления + събира грешки по редове.
  // CSV формат на ред: ДАТА, n1, n2, ... (датата е по желание; разделител , ; или интервал/таб)
  // JSON формат: [{ "date": "...", "numbers": [..] }, ...] или [[n1,n2,..], ...]
  function parse(text, game) {
    text = (text || "").trim();
    if (!text) return { draws: [], errors: ["Полето е празно."] };

    // Пробваме JSON първо.
    if (text[0] === "[" || text[0] === "{") {
      try {
        const data = JSON.parse(text);
        const arr = Array.isArray(data) ? data : [data];
        return parseObjects(arr, game);
      } catch (e) {
        // пада към CSV
      }
    }
    return parseCsv(text, game);
  }

  function parseObjects(arr, game) {
    const draws = [];
    const errors = [];
    arr.forEach((row, i) => {
      let date = null,
        numbers = null;
      if (Array.isArray(row)) {
        numbers = row.map(Number);
      } else if (row && typeof row === "object") {
        date = row.date || row.Date || null;
        numbers = (row.numbers || row.nums || []).map(Number);
      }
      const err = validateDraw(numbers, game);
      if (err) {
        errors.push(`Запис ${i + 1}: ${err}`);
      } else {
        draws.push({ date: normalizeDate(date), numbers: numbers.slice() });
      }
    });
    return { draws, errors };
  }

  function parseCsv(text, game) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const draws = [];
    const errors = [];
    lines.forEach((line, i) => {
      // Пропускаме заглавен ред.
      if (/[a-zа-я]/i.test(line) && !/^\d{4}-\d{2}-\d{2}/.test(line) && i === 0) {
        if (!/\d/.test(line.replace(/\d{4}/g, ""))) return;
      }
      const tokens = line.split(/[,;\t ]+/).filter(Boolean);
      let date = null;
      let nums = tokens;
      // Ако първият токен прилича на дата, го отделяме.
      if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(tokens[0]) || /^\d{1,2}[-./]\d{1,2}[-./]\d{4}$/.test(tokens[0])) {
        date = tokens[0];
        nums = tokens.slice(1);
      }
      const numbers = nums.map((t) => parseInt(t, 10));
      if (numbers.some((x) => Number.isNaN(x))) {
        // вероятно заглавен ред — пропускаме мълчаливо, ако е първият
        if (i === 0) return;
        errors.push(`Ред ${i + 1}: има стойности, които не са числа.`);
        return;
      }
      const err = validateDraw(numbers, game);
      if (err) {
        errors.push(`Ред ${i + 1}: ${err}`);
      } else {
        draws.push({ date: normalizeDate(date), numbers });
      }
    });
    return { draws, errors };
  }

  function normalizeDate(d) {
    if (!d) return null;
    d = String(d).trim();
    let m = d.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = d.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
    if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    return d;
  }
  function pad(x) {
    x = String(x);
    return x.length < 2 ? "0" + x : x;
  }

  function toCsv(draws) {
    const lines = ["date,numbers"];
    for (const d of draws) {
      lines.push((d.date || "") + "," + d.numbers.join(","));
    }
    return lines.join("\n");
  }

  // Демо генератор — равномерно случайни тегления. Дава населен интерфейс при
  // първо отваряне. Ясно е маркирано като ДЕМО и се заменя при импорт.
  function generateDemo(game, count) {
    count = count || 260;
    const draws = [];
    const today = new Date();
    for (let i = 0; i < count; i++) {
      const set = new Set();
      while (set.size < game.picks) {
        set.add(1 + Math.floor(Math.random() * game.pool));
      }
      const numbers = Array.from(set).sort((a, b) => a - b);
      // Тиражи назад във времето, ~2 на седмица.
      const dt = new Date(today.getTime() - (count - i) * 3.5 * 86400000);
      draws.push({ date: dt.toISOString().slice(0, 10), numbers });
    }
    return draws;
  }

  // Зарежда локален архивен файл data/<игра>.json, ако ти си го поставил
  // (напр. свой експорт). Не се сваля нищо външно — само твой файл в проекта.
  async function fetchOfficial(game) {
    try {
      const res = await fetch("data/" + game.id + ".json", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) return null;
      const out = parseObjects(data, game);
      return out.draws.length ? out.draws : null;
    } catch (e) {
      return null;
    }
  }

  /*
   * Връща тегленията за играта по приоритет:
   *   1. Ако потребителят сам е импортирал данни — те имат предимство.
   *   2. Иначе локален архивен файл data/<игра>.json, ако си го поставил.
   *   3. Запазени данни, ако има.
   *   4. Демо данни (случайни) — само за да е сайтът използваем без архив.
   */
  async function ensure(game) {
    const meta = getMeta(game.id);
    const stored = load(game.id);

    // 1. Ръчно импортираните данни на потребителя са с приоритет.
    if (meta.source === "imported" && stored && stored.length) {
      return { draws: stored, source: "imported" };
    }

    // 2. Локален архивен файл (ако е наличен в проекта).
    const official = await fetchOfficial(game);
    if (official) {
      save(game.id, official);
      setMeta(game.id, { source: "file" });
      return { draws: official, source: "file" };
    }

    // 3. Каквото е запазено в браузъра.
    if (stored && stored.length) {
      return { draws: stored, source: meta.source || "stored" };
    }

    // 4. Демо.
    const draws = generateDemo(game);
    save(game.id, draws);
    setMeta(game.id, { source: "demo" });
    return { draws, source: "demo" };
  }

  window.TotoData = {
    load,
    save,
    clear,
    getMeta,
    setMeta,
    validateDraw,
    parse,
    toCsv,
    generateDemo,
    ensure,
    fetchOfficial,
    sortDraws,
  };
})();
