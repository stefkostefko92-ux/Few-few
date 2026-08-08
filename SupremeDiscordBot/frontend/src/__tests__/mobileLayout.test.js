// frontend/src/__tests__/mobileLayout.test.js
// Правилата за телефон са ГЕЙТ, не добро намерение.
//
// СИГНАЛЪТ (собственикът, 08.08.2026): „не сме оптимизирали сайта за мобилни
// телефони". Мобилен блок в CSS-а имаше — но той беше сляп пластир с
// `!important`, който сам въведе дефекти:
//
//   • `main table { display: block }` — това УБИВА подравняването по колони.
//     Таблицата не става тясна, а счупена.
//   • обвивките на таблиците бяха `overflow-hidden` — десните колони се
//     ОТРЯЗВАТ и няма как да се стигне до тях (по-лошо от скрол).
//   • полетата остават `text-sm` (14px) — iOS Safari зуумва цялата страница при
//     всеки фокус под 16px. Това е усещането „не е за телефон“.
//   • `main .cs-btn { font-size: 0.75rem }` — целта за пръст СТАВАШЕ по-малка.
//   • `grid-cols-2` с полета за въвеждане = input на ~170px.
//
// Защо тест върху ИЗХОДНИЯ КОД, а не в браузър: нямаме headless браузър в CI, а
// добавянето на такъв прави гейта бавен и капризен (три пробега — три числа).
// Тези правила са детерминистични и се четат от текста — точно като
// bundle-budget: гейтваме това, което не мига.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = join(SRC, "pages");
const jsx = readdirSync(PAGES).filter((f) => f.endsWith(".jsx"));
const read = (f) => readFileSync(join(PAGES, f), "utf8");
const lineOf = (s, i) => s.slice(0, i).split("\n").length;

describe("таблиците са ДОСТИЖИМИ на тесен екран", () => {
  it("нито една таблица не е в обвивка, която я отрязва", () => {
    const bad = [];
    for (const f of jsx) {
      const s = read(f);
      for (const m of s.matchAll(/className="([^"]*\boverflow-hidden\b[^"]*)"/g)) {
        if (/<table\b/.test(s.slice(m.index, m.index + 300))) bad.push(`${f}:${lineOf(s, m.index)}`);
      }
    }
    expect(bad, `overflow-hidden около таблица ОТРЯЗВА десните колони: ${bad.join(", ")}`).toEqual([]);
  });

  it("CSS-ът не превръща таблица в блок (това чупи колоните)", () => {
    const css = readFileSync(join(SRC, "index.css"), "utf8");
    expect(css).not.toMatch(/table\s*\{[^}]*display:\s*block/);
  });
});

describe("полетата не карат iOS да зуумва", () => {
  const css = readFileSync(join(SRC, "index.css"), "utf8");

  it("под 640px шрифтът на полетата е точно 16px", () => {
    const block = css.slice(css.indexOf("@media (max-width: 640px)"));
    expect(block, "под 16px iOS Safari зуумва при всеки фокус").toMatch(/font-size:\s*16px/);
  });

  it("бутоните не се смаляват на телефон", () => {
    const block = css.slice(css.indexOf("@media (max-width: 640px)"));
    const btn = block.slice(block.indexOf(".cs-btn"), block.indexOf(".cs-btn") + 260);
    expect(btn, "по-малък шрифт на бутон = по-малка цел за пръст").not.toMatch(/font-size:\s*0\.75rem/);
    expect(btn).toMatch(/min-height:\s*44px/);
  });
});

describe("решетките с полета падат на една колона", () => {
  const FIELD = /cs-input|cs-textarea|cs-select|<input|<select|<textarea/;

  it("нито една grid-cols-N с поле за въвеждане не е без мобилна база", () => {
    const bad = [];
    for (const f of jsx) {
      const s = read(f);
      for (const m of s.matchAll(/className="([^"]*\bgrid-cols-([2-9])\b[^"]*)"/g)) {
        const cls = m[1];
        if (/(sm|md|lg|xl):grid-cols-/.test(cls)) continue;
        if (!FIELD.test(s.slice(m.index + m[0].length, m.index + m[0].length + 700))) continue;
        bad.push(`${f}:${lineOf(s, m.index)} (${cls.match(/grid-cols-\d/)[0]})`);
      }
    }
    expect(bad, `поле в ${bad.length > 1 ? "тези решетки" : "тази решетка"} става ~170px широко на телефон: ${bad.join(", ")}`).toEqual([]);
  });
});

describe("отстоянията не изяждат екрана", () => {
  it("корените на страниците не ползват фиксирано p-8", () => {
    const bad = [];
    for (const f of jsx) {
      const s = read(f);
      for (const m of s.matchAll(/className="p-8(?![\w-])/g)) bad.push(`${f}:${lineOf(s, m.index)}`);
    }
    // p-8 = 64px хоризонтално = 16% от екран 390px, похарчени за нищо.
    expect(bad, `ползвай p-4 sm:p-6 lg:p-8: ${bad.join(", ")}`).toEqual([]);
  });
});
