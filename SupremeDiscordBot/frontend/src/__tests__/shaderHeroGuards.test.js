// frontend/src/__tests__/shaderHeroGuards.test.js
// Предпазителите на hero шейдъра са ИЗМЕРЕНИ стойности, не вкус.
//
// ДЕФЕКТЪТ (измерено с Chromium + CPU 4×, 12.08.2026): landing страницата
// изпускаше 23–25 кадъра от ~75 при скрол, p95 ≈ 100ms. A/B по слоеве показа
// един-единствен виновник — canvas-ът (без него: 1 изпуснат кадър, p95 21ms).
// Причината НЕ е наш JavaScript (CPU профилът дава 1% за него), а raymarch
// шейдърът, смятан пиксел по пиксел.
//
// Пазачът съществуваше, но се предаваше чак след ДВА прозореца по 1.5s, тоест
// до ~3 секунди накъсване. Измерено преди/след, без загряване:
//     преди: сек0 7 изпуснати · сек1 12/12 · сек2 12/12 · сек3 7 → чак сек4 чисто
//     след:  сек0 4 изпуснати (цената на самото зареждане) → сек1 нататък чисто
//
// Тези три секунди са точно моментът, в който човек си съставя мнение за
// продукта. Затова: 700ms прозорец + незабавно падане под 24fps.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(SRC, "components", "ShaderHero.jsx"), "utf8");

describe("ShaderHero — предпазителите не се разхлабват тихо", () => {
  it("не тръгва изобщо на софтуерен растеризатор", () => {
    // `failIfMajorPerformanceCaveat` НЕ хваща SwiftShader — проверено на живо,
    // върна валиден WebGL2 контекст. Затова се гледа ИМЕТО на растеризатора.
    expect(src, "липсва проверка за софтуерен рендер").toMatch(/isSoftwareRenderer/);
    for (const soft of ["swiftshader", "llvmpipe", "software"]) {
      expect(src.toLowerCase(), `не разпознава ${soft}`).toContain(soft);
    }
    // Проверката трябва да е ПРЕДИ компилацията на шейдъра — иначе плащаме
    // компилация и линкване точно на машината, която не ги издържа.
    //
    // ВНИМАНИЕ — ДВЕ сляпи петна, всяко хванато с мутация:
    //   1. `indexOf(...) < indexOf(...)` само по себе си минаваше при махнат
    //      гард, защото −1 е по-малко от всичко.
    //   2. Търсенето на подниза „isSoftwareRenderer(gl)" пък се хващаше за
    //      САМАТА ДЕФИНИЦИЯ (`function isSoftwareRenderer(gl) {`), значи
    //      „дефиниран" се четеше като „ползван". Затова се търси ПОВИКВАНЕТО
    //      в условие — единственото място, което реално спира тръгването.
    const call = /if\s*\(\s*isSoftwareRenderer\(\s*gl\s*\)\s*\)/.exec(src);
    expect(call, "гардът не се ПОВИКВА в условие — само е дефиниран").not.toBeNull();
    expect(call.index).toBeLessThan(src.indexOf("gl.VERTEX_SHADER"));
  });

  it("прозорецът на пазача остава къс (≤700ms)", () => {
    const m = src.match(/elapsed\s*>\s*(\d+)/);
    expect(m, "не намирам прозореца на пазача").not.toBeNull();
    expect(Number(m[1]), "прозорец над 700ms = по-дълго накъсване").toBeLessThanOrEqual(700);
  });

  it("катастрофалният кадров бюджет пада ВЕДНАГА, без втори шанс", () => {
    // Под 24fps няма какво да се доказва — точно това правеше трите секунди.
    expect(src, "липсва незабавен праг").toMatch(/fps\s*<\s*24[\s\S]{0,80}loseAndStop/);
  });

  it("предаването е пълно — контекстът се освобождава, не само се спира кадърът", () => {
    expect(src).toMatch(/WEBGL_lose_context/);
  });
});
