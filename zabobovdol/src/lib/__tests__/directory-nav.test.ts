import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FOOTER_NAV, PRIMARY_NAV, QUICK_NAV, isFeedHref, localPhone } from "@/lib/site";
import { KNOWN_SECTIONS, groupPath, isExcludedPath } from "@/lib/analytics-core";

// Навигацията и броенето на посещенията трябва да са в синхрон със страниците:
// връзка без страница е 404 за възрастен човек, а раздел, който липсва в
// KNOWN_SECTIONS, се брои като „/other“ и изчезва от статистиката.

const APP = join(process.cwd(), "src", "app");
// Служебни папки — не са публични раздели и не се броят като прегледи.
const NOT_SECTIONS = new Set(["admin", "api", "p"]);

function routeExists(href: string): boolean {
  const dir = join(APP, ...href.split("/").filter(Boolean));
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return false;
  return ["page.tsx", "page.ts", "route.ts", "route.tsx"].some((f) => existsSync(join(dir, f)));
}

const ALL = [...PRIMARY_NAV, ...FOOTER_NAV, ...QUICK_NAV];

test("всяка връзка в менютата води до съществуваща страница или канал", () => {
  for (const item of ALL) {
    assert.ok(item.href.startsWith("/"), `${item.href}: само вътрешни адреси`);
    assert.ok(routeExists(item.href), `${item.label} → ${item.href}: няма такава страница в src/app`);
  }
});

test("в едно меню няма повтаряща се връзка", () => {
  for (const [name, list] of [["PRIMARY_NAV", PRIMARY_NAV], ["FOOTER_NAV", FOOTER_NAV], ["QUICK_NAV", QUICK_NAV]] as const) {
    const hrefs = list.map((i) => i.href);
    assert.equal(new Set(hrefs).size, hrefs.length, `${name} има повтаряща се връзка`);
  }
});

test("всеки публичен раздел в src/app се брои поименно, не като „/other“", () => {
  const dirs = readdirSync(APP).filter((n) => statSync(join(APP, n)).isDirectory() && !NOT_SECTIONS.has(n));
  assert.ok(dirs.length > 20, "очакват се публичните раздели");
  for (const d of dirs) {
    if (!routeExists(`/${d}`)) continue; // папка без собствена страница
    if (isExcludedPath(`/${d}`)) continue; // файлове (llms.txt, indexnow-key.txt) не са прегледи
    assert.ok(KNOWN_SECTIONS.has(d), `/${d} липсва в KNOWN_SECTIONS (src/lib/analytics-core.ts)`);
  }
  for (const item of ALL) {
    if (isFeedHref(item.href)) continue;
    assert.notEqual(groupPath(item.href), "/other", `${item.href} се брои като „/other“`);
  }
  assert.equal(groupPath("/izvestiya"), "/izvestiya");
  assert.equal(groupPath("/pomeni"), "/pomeni");
});

test("новите раздели са в навигацията, а некролозите не са сред едрите плочки", () => {
  const primary = PRIMARY_NAV.map((i) => i.href);
  const footer = FOOTER_NAV.map((i) => i.href);
  assert.ok(primary.includes("/pomeni"));
  assert.ok(primary.indexOf("/pomeni") >= 6, "„Некролози и помени“ — тихо, не сред първите шест плочки");
  for (const h of ["/izvestiya", "/instaliraj", "/za-blizkite", "/pechat/sedmitsa", "/biznes/nova", "/novini/rss.xml"]) {
    assert.ok(footer.includes(h), `${h} липсва във футъра`);
  }
});

test("isFeedHref и localPhone", () => {
  assert.equal(isFeedHref("/novini/rss.xml"), true);
  assert.equal(isFeedHref("/novini"), false);
  assert.equal(localPhone("+359877414874"), "0877 414 874");
  assert.equal(localPhone("00359888123456"), "0888 123 456");
  assert.equal(localPhone("0877414874"), "0877 414 874");
  // Непознат формат (стационарен, кратък) → непроменен.
  assert.equal(localPhone("112"), "112");
  assert.equal(localPhone("070011311"), "070011311");
});
