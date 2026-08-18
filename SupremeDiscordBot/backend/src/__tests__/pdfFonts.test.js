// backend/src/__tests__/pdfFonts.test.js
// Регресия: кирилицата в PDF транскрипта.
//
// Докладвано от продукцията — българският текст излизаше празен. Причината не
// е кодиране на низа, а шрифтът: PDFKit носи само 14-те стандартни PDF шрифта
// (Helvetica/Times/Courier), които са AFM с WinAnsi и физически НЯМАТ кирилски
// глифи. Затова вграждаме DejaVu Sans.
//
// Тестът пази трите неща, които могат да го счупят пак: файловете да ги има,
// да се вграждат наистина (FontFile2 в потока), и export.js да не се върне
// към литерала "Helvetica".
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FONTS = join(ROOT, "assets", "fonts");
const CYRILLIC = "Здравейте! Тикетът е затворен — възстановени 24,90 лв.";

function renderPdf(register) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    register(doc);
    doc.fontSize(14).text(CYRILLIC);
    doc.end();
  });
}

describe("PDF шрифтове (кирилица)", () => {
  it("вградените TTF файлове съществуват и не са празни", () => {
    for (const f of ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"]) {
      const p = join(FONTS, f);
      expect(existsSync(p), `липсва ${f}`).toBe(true);
      expect(statSync(p).size).toBeGreaterThan(100_000);
    }
  });

  it("лицензът пътува заедно с шрифта", () => {
    expect(existsSync(join(FONTS, "LICENSE-DejaVu.txt"))).toBe(true);
  });

  it("кирилицата се рендира с ВГРАДЕН шрифт (стандартният Helvetica не вгражда нищо)", async () => {
    const withDejaVu = await renderPdf((doc) => {
      doc.registerFont("Body", join(FONTS, "DejaVuSans.ttf"));
      doc.font("Body");
    });
    expect(withDejaVu.includes("FontFile2"), "TTF не е вграден в PDF-а").toBe(true);
    expect(withDejaVu.toString("latin1")).toMatch(/DejaVu/);

    // Контра-проверка: точно това беше счупеното поведение.
    const withHelvetica = await renderPdf((doc) => doc.font("Helvetica"));
    expect(withHelvetica.includes("FontFile2")).toBe(false);
  });

  it("export.js не ползва стандартните PDF шрифтове (само в коментари)", () => {
    const src = readFileSync(join(ROOT, "src", "routes", "export.js"), "utf8");
    const offenders = src.split("\n").filter((l) => {
      const t = l.trim();
      if (t.startsWith("//") || t.startsWith("*")) return false;
      return /font\(\s*["'](Helvetica|Times|Courier)/.test(t);
    });
    expect(offenders, `върнат стандартен шрифт:\n${offenders.join("\n")}`).toEqual([]);
  });
});
