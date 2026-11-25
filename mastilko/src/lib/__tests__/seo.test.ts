import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import path from "path";
import { LAST_MODIFIED, SITEMAP_PATHS } from "@/app/sitemap";
import { CATALOG, catalogParagraphs } from "@/lib/mcp/catalog";

// Заключва поправките след спада в индексирането (GSC, 2026-10): 1 индексирана
// страница от 22. Всеки тест тук пази конкретна първопричина — виж съобщенията.

const APP = path.join(process.cwd(), "src/app");

/** Всички page.tsx → маршрут ("" за началната). */
function pages(dir = APP): Array<{ route: string; src: string }> {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return pages(p);
    if (n !== "page.tsx") return [];
    const route = path.relative(APP, path.dirname(p)).split(path.sep).join("/");
    return [{ route: route ? `/${route}` : "", src: readFileSync(p, "utf8") }];
  });
}

const isNoindex = (src: string) => /index: false/.test(src);

test("seo: layout НЕ задава canonical (иначе 404 и noindex страниците сочат началната)", () => {
  const layout = readFileSync(path.join(APP, "layout.tsx"), "utf8");
  assert.doesNotMatch(layout, /canonical:/);
});

test("seo: всяка индексируема страница е каноничен адрес на СЕБЕ СИ", () => {
  let checked = 0;
  for (const { route, src } of pages()) {
    if (route.startsWith("/admin") || isNoindex(src)) continue;
    const m = /canonical: "([^"]*)"/.exec(src);
    assert.ok(m, `${route || "/"}: липсва alternates.canonical`);
    assert.equal(m[1], route || "/", `${route || "/"}: canonical сочи ${m[1]}`);
    checked++;
  }
  assert.ok(checked >= 19, `проверени са само ${checked} страници`);
});

test("seo: sitemap съдържа точно индексируемите страници, всяка с реална дата", () => {
  const indexable = pages()
    .filter(({ route, src }) => !route.startsWith("/admin") && !isNoindex(src))
    .map((p) => p.route)
    .sort();
  assert.deepEqual([...SITEMAP_PATHS].sort(), indexable);
  for (const p of SITEMAP_PATHS) {
    const d = LAST_MODIFIED[p];
    assert.ok(d && /^\d{4}-\d{2}-\d{2}$/.test(d), `${p || "/"}: липсва lastmod дата`);
  }
  // Еднаква дата за ВСИЧКО = отново „моментът на билда“ под друго име.
  assert.ok(new Set(Object.values(LAST_MODIFIED)).size > 1, "всички lastmod са еднакви");
});

test("seo: HowTo в JSON-LD е и ВИДИМ на страницата (ToolGuide със същия HOWTO)", () => {
  let checked = 0;
  for (const { route, src } of pages()) {
    if (!/howTo: HOWTO/.test(src)) continue;
    assert.match(
      src,
      new RegExp(`<ToolGuide current="${route}" howTo=\\{HOWTO\\} />`),
      `${route}: HowTo е само в JSON-LD — Google иска маркираното да се вижда`,
    );
    checked++;
  }
  assert.equal(checked, 14);
});

test("seo: каталогът дава видим текст за всеки инструмент, без бележките за асистенти", () => {
  for (const e of CATALOG) {
    assert.ok(existsSync(path.join(APP, e.id, "page.tsx")), `${e.id}: няма такава страница`);
    const ps = catalogParagraphs(e.id);
    assert.ok(ps.length >= 1, `${e.id}: няма абзаци`);
    for (const p of ps) {
      assert.doesNotMatch(p, /\n/, `${e.id}: ръчният пренос на ред не е слят`);
      assert.doesNotMatch(p, /AI асистенти/, `${e.id}: бележка за асистенти изтича в сайта`);
    }
  }
  assert.deepEqual(catalogParagraphs("няма-такъв"), []);
});
