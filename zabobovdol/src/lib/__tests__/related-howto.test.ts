import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryPath,
  categorySlug,
  duplicateRedirects,
  formatBgDate,
  groupCategories,
  guidesLabel,
  hasTag,
  isoDay,
  normalizeQuestion,
  pageCount,
  pageSlice,
  pageWindow,
  parsePageParam,
  parseTags,
  splitLead,
  type GuideIndexItem,
} from "@/lib/howto";

const at = (s: string) => new Date(s);
const item = (p: Partial<GuideIndexItem> & { slug: string }): GuideIndexItem => ({
  id: p.slug,
  question: p.slug,
  category: "Общи",
  tags: "",
  order: 0,
  views: 0,
  createdAt: at("2026-01-01T00:00:00Z"),
  updatedAt: at("2026-01-01T00:00:00Z"),
  ...p,
});

test("categorySlug е детерминистичен и латински", () => {
  assert.equal(categorySlug("Еврото"), "evroto");
  assert.equal(categorySlug("Документи и плащания"), "dokumenti-i-plashtaniya");
  assert.equal(categorySlug("Viber, Messenger и WhatsApp"), "viber-messenger-i-whatsapp");
  assert.equal(categorySlug("Достъпност (за по-лесно ползване)"), "dostapnost-za-po-lesno-polzvane");
  assert.equal(categorySlug(categorySlug("Еврото")), "evroto", "slug от slug е същият");
});

test("categoryPath слага ?page= само след първата страница", () => {
  assert.equal(categoryPath("evroto"), "/kak-da/kategoriya/evroto");
  assert.equal(categoryPath("evroto", 1), "/kak-da/kategoriya/evroto");
  assert.equal(categoryPath("evroto", 3), "/kak-da/kategoriya/evroto?page=3");
});

test("guidesLabel склонява правилно", () => {
  assert.equal(guidesLabel(1), "1 ръководство");
  assert.equal(guidesLabel(5), "5 ръководства");
});

test("parseTags маха празни и повторения; hasTag не гледа регистъра", () => {
  assert.deepEqual(parseTags(" НОИ, пенсия,, нои ,"), ["НОИ", "пенсия"]);
  assert.ok(hasTag({ tags: "НОИ, пенсия" }, "нои"));
  assert.ok(!hasTag({ tags: "НОИ" }, "  "));
});

test("normalizeQuestion сравнява дословни дубли", () => {
  assert.equal(normalizeQuestion("Как да проверя глоби от КАТ онлайн?"), "как да проверя глоби от кат онлайн");
  assert.equal(normalizeQuestion("  как да  проверя глоби от кат онлайн "), "как да проверя глоби от кат онлайн");
});

test("duplicateRedirects пренасочва към най-стария запис, стабилно", () => {
  const rows = [
    item({ slug: "docs-kat-globi", question: "Как да проверя глоби от КАТ онлайн?", createdAt: at("2026-03-02T00:00:00Z") }),
    item({ slug: "c-proverya-globi-kat", question: "Как да проверя глоби от КАТ онлайн?", createdAt: at("2026-03-01T00:00:00Z") }),
    item({ slug: "unikalno", question: "Друго?" }),
    item({ slug: "b-same", question: "Еднакво", createdAt: at("2026-01-01T00:00:00Z") }),
    item({ slug: "a-same", question: "еднакво", createdAt: at("2026-01-01T00:00:00Z") }),
  ];
  const r = duplicateRedirects(rows);
  assert.equal(r.get("docs-kat-globi"), "c-proverya-globi-kat");
  assert.ok(!r.has("c-proverya-globi-kat"), "оригиналът не пренасочва");
  assert.ok(!r.has("unikalno"));
  // Равни дати → по азбучен slug
  assert.equal(r.get("b-same"), "a-same");
  assert.equal(r.size, 2);
  // Редът на входа не променя изхода
  assert.deepEqual([...duplicateRedirects([...rows].reverse())].sort(), [...r].sort());
});

test("groupCategories: брой, най-четени, реална последна редакция, азбучен ред", () => {
  const rows = [
    item({ slug: "e1", category: "Еврото", order: 2, views: 5, updatedAt: at("2026-05-01T00:00:00Z") }),
    item({ slug: "e2", category: "Еврото", order: 1, views: 50, updatedAt: at("2026-09-01T00:00:00Z") }),
    item({ slug: "e3", category: "еврото", order: 3, views: 1 }),
    item({ slug: "d1", category: "Документи и плащания", order: 1 }),
  ];
  const groups = groupCategories(rows, 2);
  assert.deepEqual(groups.map((g) => g.slug), ["dokumenti-i-plashtaniya", "evroto"]);
  const evro = groups[1];
  assert.equal(evro.name, "Еврото", "най-честото име");
  assert.deepEqual(evro.names, ["еврото", "Еврото"].sort((a, b) => a.localeCompare(b, "bg")));
  assert.equal(evro.count, 3);
  assert.deepEqual(evro.items.map((i) => i.slug), ["e2", "e1", "e3"], "по order");
  assert.deepEqual(evro.top.map((i) => i.slug), ["e2", "e1"], "по прегледи");
  assert.equal(evro.lastModified.toISOString(), "2026-09-01T00:00:00.000Z");
});

test("страници: брой, отрязък, прозорец", () => {
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(24), 1);
  assert.equal(pageCount(25), 2);
  const xs = Array.from({ length: 50 }, (_, i) => i);
  assert.deepEqual(pageSlice(xs, 3, 24), [48, 49]);
  assert.deepEqual(pageWindow(1, 3), [1, 2, 3]);
  assert.deepEqual(pageWindow(6, 12), [1, 4, 5, 6, 7, 8, 12]);
});

test("parsePageParam: липсващ = 1, невалиден = null", () => {
  assert.equal(parsePageParam(undefined), 1);
  assert.equal(parsePageParam("2"), 2);
  for (const bad of ["0", "-1", "1.5", "abc", "02", "", "99999"]) {
    assert.equal(parsePageParam(bad), null, bad);
  }
  assert.equal(parsePageParam(["2", "3"]), null);
});

test("splitLead взема първия абзац и маха етикета „Кратко:“", () => {
  const s = splitLead("Пенсията се изплаща от НОИ — по сметка или в брой.\n\nПодробности тук.");
  assert.deepEqual(s, {
    lead: "Пенсията се изплаща от НОИ — по сметка или в брой.",
    rest: "Подробности тук.",
  });
  assert.equal(splitLead("Кратко: браузърът е програма.")?.lead, "браузърът е програма.");
  assert.equal(splitLead("**Кратко:** браузърът е програма.")?.lead, "браузърът е програма.");
  assert.equal(splitLead("**Накратко**: да.")?.lead, "да.");
  // Ред по ред в един абзац се слепва
  assert.equal(splitLead("Ред едно\nред две")?.lead, "Ред едно ред две");
});

test("splitLead не пипа текст, започващ със заглавие, списък или цитат", () => {
  assert.equal(splitLead("## Заглавие\n\nТекст"), null);
  assert.equal(splitLead("- точка\n- точка"), null);
  assert.equal(splitLead("1. първо"), null);
  assert.equal(splitLead("> цитат"), null);
  assert.equal(splitLead(""), null);
  assert.equal(splitLead("**Кратко:**"), null);
});

test("splitLead реже дълъг абзац след първото изречение, но не посред съкращение или **удебелено**", () => {
  const filler = "Още обяснение с подробности за хората. ".repeat(10);
  const md = `Гишето е в гр. Бобов дол, ул. „Христо Ботев“. ${filler}`;
  const s = splitLead(md);
  assert.equal(s?.lead, "Гишето е в гр. Бобов дол, ул. „Христо Ботев“.");
  assert.ok(s?.rest.startsWith("Още обяснение"));

  const bold = `**Важно. Не давайте ПИН.** ${filler}`;
  assert.equal(splitLead(bold)?.lead, "**Важно. Не давайте ПИН.**");
});

test("дати: български формат и ISO ден по софийско време", () => {
  const d = new Date("2026-10-11T22:30:00Z"); // 12 октомври в София (UTC+3)
  assert.equal(isoDay(d), "2026-10-12");
  assert.match(formatBgDate(d), /^12 октомври 2026/);
});
