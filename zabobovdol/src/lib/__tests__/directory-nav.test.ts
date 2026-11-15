import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FOOTER_GROUPS, FOOTER_NAV, LEGAL_NAV, NAV_GROUPS, PRIMARY_NAV, QUICK_NAV, TOP_NAV, isFeedHref, localPhone } from "@/lib/site";
import { KNOWN_SECTIONS, groupPath, isExcludedPath } from "@/lib/analytics-core";
import { SECTION, type SectionKey } from "@/lib/section-names";
import { NAV_ICONS } from "@/components/nav-icons";

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

test("групите на менюто съдържат всеки раздел точно веднъж", () => {
  const grouped = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
  assert.equal(new Set(grouped).size, grouped.length, "раздел в две групи");
  assert.deepEqual([...grouped].sort(), PRIMARY_NAV.map((i) => i.href).sort(), "групите ≠ PRIMARY_NAV");
  // „Най-търсени“ е първата група — разделите от основното меню на компютър
  // в същия ред, без тези, които имат своя група („Пари и документи“).
  assert.equal(NAV_GROUPS[0].title, SECTION.popular);
  const first = NAV_GROUPS[0].items;
  assert.deepEqual(first, TOP_NAV.filter((i) => first.includes(i)), "редът ≠ основното меню");
  for (const i of TOP_NAV) {
    if (first.includes(i)) continue;
    const g = NAV_GROUPS.find((x) => x.items.includes(i));
    assert.ok(g, `${i.href} от основното меню липсва в групите`);
  }
  assert.ok(TOP_NAV.length >= 4 && TOP_NAV.length <= 6, "основното меню е 4–6 раздела");
});

// eyebrow над страницата: `eyebrow={SECTION.x}` в src/app/<адрес>/page.tsx.
function eyebrowOf(href: string): string | null {
  const file = join(APP, ...href.split("/").filter(Boolean), "page.tsx");
  if (!existsSync(file)) return null;
  const m = /eyebrow=\{SECTION\.(\w+)\}/.exec(readFileSync(file, "utf8"));
  return m ? SECTION[m[1] as SectionKey] ?? `неизвестен ключ SECTION.${m[1]}` : null;
}

test("заглавията на групите са от SECTION и съвпадат с eyebrow над страниците", () => {
  const names = new Set<string>(Object.values(SECTION));
  for (const [menu, groups] of [["NAV_GROUPS", NAV_GROUPS], ["FOOTER_GROUPS", FOOTER_GROUPS]] as const) {
    const titles = new Set(groups.map((g) => g.title));
    for (const g of groups) {
      assert.ok(names.has(g.title), `${menu}: „${g.title}“ не е в SECTION (src/lib/section-names.ts)`);
      for (const i of g.items) {
        const eb = eyebrowOf(i.href);
        // Страница, чийто eyebrow е име на група в същото меню, стои точно в нея —
        // иначе над страницата и в менюто има различни имена на един раздел.
        if (eb && titles.has(eb)) {
          assert.equal(eb, g.title, `${menu}: ${i.href} е в „${g.title}“, а над страницата пише „${eb}“`);
        }
      }
    }
  }
  // Всяка група в менюто (без „Най-търсени“) е раздел: ВСЯКА страница в нея
  // носи точно нейното име над заглавието.
  for (const g of NAV_GROUPS.slice(1)) {
    for (const i of g.items) {
      assert.equal(eyebrowOf(i.href), g.title, `${i.href}: над заглавието трябва да пише „${g.title}“`);
    }
  }
  // „Най-търсени“ не е раздел — страниците в нея носят своя раздел, но имат.
  for (const i of NAV_GROUPS[0].items) {
    assert.ok(eyebrowOf(i.href), `${i.href}: липсва eyebrow над заглавието`);
  }
});

test("подстраниците носят eyebrow на своя раздел (H1 не подскача при преход)", () => {
  const expected: Record<string, string> = {
    "/zov-za-pomosht/[slug]": SECTION.community,
    "/dobrovolci/stani": SECTION.community,
    "/spomeni/[slug]": SECTION.city,
    "/spodeleno-patuvane": SECTION.participate,
    "/spodeleno-patuvane/[slug]": SECTION.participate,
  };
  for (const [href, name] of Object.entries(expected)) {
    assert.equal(eyebrowOf(href), name, `${href}: над заглавието трябва да пише „${name}“`);
  }
});

test("иконите на разделите са различни — двойка с една икона не се различава", () => {
  const seen = new Map<unknown, string>();
  for (const [href, Icon] of Object.entries(NAV_ICONS)) {
    const prev = seen.get(Icon);
    assert.equal(prev, undefined, `${href} и ${prev} са с една и съща икона`);
    seen.set(Icon, href);
  }
  for (const i of PRIMARY_NAV) assert.ok(NAV_ICONS[i.href], `${i.href} няма икона в nav-icons.ts`);
});

test("футърът: групи без повторения, правните връзки отделно", () => {
  const hrefs = FOOTER_GROUPS.flatMap((g) => g.items.map((i) => i.href));
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const l of LEGAL_NAV) assert.ok(!hrefs.includes(l.href), `${l.href} е и в групите`);
  assert.deepEqual(
    LEGAL_NAV.map((i) => i.href),
    ["/pravila", "/poveritelnost", "/biskvitki", "/dostapnost"],
  );
  assert.equal(FOOTER_NAV.length, hrefs.length + LEGAL_NAV.length);
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
