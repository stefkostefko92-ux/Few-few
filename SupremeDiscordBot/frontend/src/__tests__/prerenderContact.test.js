import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Доверие (tools/seo/doverie.md): обхождач без JavaScript трябва да види от началната кой стои зад
// продукта и как се свързва с него. Footer-ът на SPA-то се рисува в браузъра, затова снимката на
// prerender.mjs носи свой: контакт (mailto), правните страници и дружеството.
// Проверява се ГЕНЕРАТОРЪТ, не изходът — както в noOrphanPages (dist/ може да липсва).
const pre = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "prerender.mjs"), "utf8");

describe("prerender — контакт и правни връзки в снимката на началните страници", () => {
  it("contactFooter() съдържа mailto, правните страници и дружеството", () => {
    const m = pre.match(/function contactFooter\(\)\s*\{[\s\S]*?\n\}/);
    expect(m, "няма function contactFooter()").not.toBeNull();
    const body = m[0];
    expect(body).toContain('href="mailto:legal@carbonstealth.eu"');
    for (const p of ["/terms", "/privacy", "/cookies", "/accessibility"]) expect(body).toContain(`href="${p}"`);
    expect(body).toContain("Carbon Stealth VCC");
    expect(body).toContain("Samuil 3");
  });

  it("и двете снимки (локализираните начални и английският корен) го викат", () => {
    expect((pre.match(/\$\{contactFooter\(\)\}/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
