// frontend/src/__tests__/paletteDrift.test.js
// Всеки цвят в компонентите е ОТ палитрата — не просто „някакъв цвят“.
//
// ДЕФЕКТЪТ (одит на екраните, 07.08.2026): heatmap-ът в Analytics рисуваше
// клетките си с `rgba(51, 177, 255, …)` — синьо, инлайн, в продукт, чийто
// акцент е неоново-зелен. Единственият син елемент в целия интерфейс, и то на
// екрана, който клиентът показва на екипа си.
//
// Ботът има такъв гейт отдавна (`bot/src/utils/colors.js`), но той пази
// embed-ите и лови `#rrggbb`. Фронтендът нямаше нищо, а `rgba()` не е hex.
//
// ЗАЩО ПРАВИЛОТО Е „ИЗВЪН ПАЛИТРАТА“, А НЕ „НУЛА ЛИТЕРАЛИ“: първата версия
// забраняваше всеки цветен литерал и обяви 22 нарушения — включително герба на
// тарифите (законни брандови стойности), валидираната палитра на графиките и
// blurple-а на Discord. Гейт, който крещи при всяко трето поле, спира да се
// чете; същата грешка вече я направих веднъж с ценовия гейт. Затова тук се
// сравняват СТОЙНОСТИ: познат цвят минава, непознат пада.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { walk(p, acc); continue; }
    if (/\.(jsx?|tsx?)$/.test(e)) acc.push(p);
  }
  return acc;
}

/** Позволените цветове, като „r,g,b“. Източник: `tailwind.config.js`. */
const ALLOWED = new Set([
  // ── Брандови ──────────────────────────────────────────────────────────────
  "143,230,0",    // cs.cyan — акцентът (неоново-лимонено)
  "108,176,0",    // cs.cyanDim
  "240,194,76",   // cs.gold — премиум значки
  "200,153,47",   // cs.goldDim
  // ── Семантични ────────────────────────────────────────────────────────────
  "74,222,128",   // success
  "251,191,36",   // warning
  "239,68,68",    // danger
  // ── Повърхности и текст ──────────────────────────────────────────────────
  "7,10,6", "13,19,11", "20,29,16", "75,90,68", "93,112,82",
  "240,240,235", "170,170,170", "154,154,154",
  // ── Валидирана палитра за графики (`components/charts/palette.js`) ───────
  // Извън брандовите нарочно: #8fe600 е твърде светъл за серия и убива
  // четимостта на съседната. Стойностите са минали през dataviz валидатора.
  "90,147,0", "37,136,197",
  // ── Чужд бранд ────────────────────────────────────────────────────────────
  "88,101,242",   // Discord blurple — техният цвят, не нашият, и точно затова
                  // не бива да се „поправя“ към нашия акцент.
]);

/** Неутрално (бяло/черно с прозрачност) — сенки и наслагвания. */
const isNeutral = (r, g, b) =>
  (r === g && g === b) && (r === 0 || r === 255);

const hexToRgb = (h) => {
  const v = h.replace("#", "");
  const f = v.length === 3 ? v.split("").map((c) => c + c).join("") : v.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
};

const FILES = [...walk(join(SRC, "pages")), ...walk(join(SRC, "components"))];

function offendersIn(file) {
  const out = [];
  const code = readFileSync(file, "utf8").split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");

  for (const m of code.match(/\brgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g) || []) {
    const [r, g, b] = m.match(/\d+/g).map(Number);
    if (isNeutral(r, g, b) || ALLOWED.has(`${r},${g},${b}`)) continue;
    out.push(`${relative(SRC, file)} → rgb(${r}, ${g}, ${b})`);
  }
  for (const m of code.match(/(background|backgroundColor|color|fill|stroke|borderColor)\s*:\s*["'`](#[0-9a-fA-F]{3,6})/g) || []) {
    const [r, g, b] = hexToRgb(m.match(/#[0-9a-fA-F]{3,6}/)[0]);
    if (isNeutral(r, g, b) || ALLOWED.has(`${r},${g},${b}`)) continue;
    out.push(`${relative(SRC, file)} → ${m.trim()}`);
  }
  return out;
}

describe("нито един цвят не е извън палитрата", () => {
  it("компонентите и страниците ползват само познати стойности", () => {
    const offenders = FILES.flatMap(offendersIn);
    expect(
      offenders,
      `цвят извън палитрата — вземи токен от tailwind.config.js или го добави в ALLOWED със обосновка:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

describe("гейтът реално гледа нещо", () => {
  it("обхожда поне 30 файла — мълчанието да е от чистота, не от слепота", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(30);
  });

  it("непознат цвят наистина пада (проверка на самия детектор)", () => {
    // Точният цвят, който heatmap-ът ползваше, преди да го поправим.
    const [r, g, b] = [51, 177, 255];
    expect(isNeutral(r, g, b)).toBe(false);
    expect(ALLOWED.has(`${r},${g},${b}`)).toBe(false);
  });
});
