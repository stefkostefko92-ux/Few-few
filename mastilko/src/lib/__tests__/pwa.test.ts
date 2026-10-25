import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import path from "path";

// Офлайн режимът кешира всички инструменти ПРИ ИНСТАЛИРАНЕ (public/sw.js).
// Нов инструмент, добавен в sitemap-а, но не и в service worker-а, тихо няма
// да работи без мрежа — затова двата списъка се сверяват.
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const paths = (block: string) => [...block.matchAll(/"(\/[a-z-]+)"/g)].map((m) => m[1]).sort();

test("service worker кешира точно инструментите от sitemap-а", () => {
  const sw = /const TOOL_PAGES = \[([\s\S]*?)\]/.exec(read("public/sw.js"));
  const sitemap = /const TOOLS = \[([\s\S]*?)\]/.exec(read("src/app/sitemap.ts"));
  assert.ok(sw && sitemap, "не намирам списъците");
  const a = paths(sw[1]!);
  assert.equal(a.length, 14);
  assert.deepEqual(a, paths(sitemap[1]!));
});
