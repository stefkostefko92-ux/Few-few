// Контрастът на текстовите токени — сметнат, не погледнат.
//
// ЗАЩО ТУК, А НЕ САМО В БРАУЗЪРА. `tests/e2e/accessibilita.spec.ts` вижда само
// двойките, които СЛУЧАЙНО се срещат на проверените страници. Ако утре някой
// сложи `text-text-3` върху `--surface-3` на страница, която не е в списъка,
// axe няма да я погледне. Тук се проверява самата ДЕФИНИЦИЯ: всеки текстов
// токен срещу всяка повърхност, в двете теми. Числата се четат от
// `globals.css`, тоест тестът не може да се разсинхронизира с истината.
//
// Прагът е 4,5:1 (WCAG 2.1, критерий 1.4.3, ниво AA) — това, което EN 301 549
// изисква, а EAA прави задължително от 28 юни 2025 г.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../app/globals.css"),
  "utf8",
);

/** OKLCH → sRGB по CSS Color 4 (матриците на Ottosson). */
function oklchSuRgb(
  L: number,
  C: number,
  hGradi: number,
): [number, number, number] {
  const h = (hGradi * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lineare = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lineare.map((v) =>
    Math.min(
      1,
      Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055),
    ),
  ) as [number, number, number];
}

function luminanza([r, g, b]: [number, number, number]): number {
  const f = (v: number) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrasto(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const [alto, basso] = [luminanza(a), luminanza(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (basso + 0.05);
}

/**
 * Чете токен от даден блок на CSS-а.
 *
 * Липсващият токен е ПРОВАЛ, не пропуснат случай: преименуван токен иначе би
 * махнал проверката мълчаливо и точно тогава контрастът се чупи.
 */
function token(blocco: string, nome: string): [number, number, number] {
  const m = new RegExp(
    `--${nome}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`,
  ).exec(blocco);
  assert.ok(m, `токенът --${nome} липсва (преименуван?)`);
  return oklchSuRgb(Number(m[1]) / 100, Number(m[2]), Number(m[3]));
}

function blocco(selettore: string): string {
  const i = CSS.indexOf(selettore);
  assert.ok(i >= 0, `блокът ${selettore} липсва`);
  return CSS.slice(i, CSS.indexOf("}", i));
}

const SUPERFICI = ["bg", "surface", "surface-2", "surface-3"];
const TESTI = ["text-1", "text-2", "text-3"];
const SOGLIA = 4.5;

for (const [tema, selettore] of [
  ["светла", ":root"],
  ["тъмна", ".dark"],
] as const) {
  describe(`${tema} тема`, () => {
    const b = blocco(selettore);

    // ЙЕРАРХИЯТА МЕЖДУ НИВАТА, не само спрямо фона.
    //
    // Мрежата отдолу мери текст срещу ПОВЪРХНОСТ и е сляпа за друг вид
    // регресия: затъмняване на `--text-3` до 51 % задържа 4,79:1 срещу фона,
    // но свали разликата спрямо `--text-2` от 1,98:1 на 1,47:1 — и съседни
    // етикети на 11 px (типът и заглавието в клетка на календара) престанаха
    // да се различават. Прагът е скромен нарочно: това е въпрос на видима
    // стъпка, не на четимост, и по-строг праг би карал някого да чупи
    // истинското изискване, за да го изпълни.
    test("трите нива на текст остават РАЗЛИЧИМИ помежду си", () => {
      const min = 1.6;
      for (const [a, c] of [
        ["text-1", "text-2"],
        ["text-2", "text-3"],
      ] as const) {
        const r = contrasto(token(b, a), token(b, c));
        assert.ok(
          r >= min,
          `--${a} срещу --${c} дава ${r.toFixed(2)}:1 (иска се ${min}:1)`,
        );
      }
    });

    for (const t of TESTI)
      for (const s of SUPERFICI)
        test(`${t} върху ${s} ≥ ${SOGLIA}:1`, () => {
          const r = contrasto(token(b, t), token(b, s));
          assert.ok(
            r >= SOGLIA,
            `--${t} върху --${s} дава ${r.toFixed(2)}:1 (иска се ${SOGLIA}:1)`,
          );
        });
  });
}

describe("сметката е вярна", () => {
  test("възпроизвежда числа, известни отвън", () => {
    // Черно върху бяло е 21:1 по определение — ако това не излезе, грешката е
    // в преобразуването, а не в цветовете, и всички други числа са боклук.
    assert.equal(Math.round(contrasto([0, 0, 0], [1, 1, 1])), 21);
    assert.equal(contrasto([1, 1, 1], [1, 1, 1]), 1);
    // Стойността, която axe измери за счупения токен (#757b81 върху бяло).
    const vecchio = oklchSuRgb(0.58, 0.012, 250);
    assert.equal(contrasto(vecchio, [1, 1, 1]).toFixed(2), "4.28");
  });
});
