import test from "node:test";
import assert from "node:assert/strict";
import {
  quickIntent,
  cleanExcerpt,
  toApiMessages,
  toGeminiContents,
} from "@/lib/chat";

test("quickIntent: спешен случай извежда 112 на първо място", () => {
  for (const q of ["пожар!", "трябва линейка", "човек получи инфаркт"]) {
    const a = quickIntent(q);
    assert.ok(a, `очаквам отговор за: ${q}`);
    assert.match(a!.answer, /112/);
    assert.match(a!.sources[0].title, /112/);
  }
});

test("quickIntent: поздрав и благодарност имат канени отговори", () => {
  assert.match(quickIntent("здравей")!.answer, /помощник/i);
  assert.match(quickIntent("благодаря")!.answer, /насреща/i);
});

test("quickIntent: обикновен въпрос връща null (пада към търсене/AI)", () => {
  assert.equal(quickIntent("телефон на общината"), null);
  assert.equal(quickIntent("кога се извозва боклука"), null);
});

test("cleanExcerpt: не реже по средата на дума и добавя многоточие", () => {
  const long = "Първо изречение е тук. " + "дума ".repeat(200);
  const out = cleanExcerpt(long, 60);
  assert.ok(out.length <= 64);
  assert.ok(!/\bду$/.test(out)); // не свършва с отрязана дума
});

test("cleanExcerpt: къс текст се връща непокътнат", () => {
  assert.equal(cleanExcerpt("Кратко.", 100), "Кратко.");
});

test("toApiMessages: ограничава историята и завършва с текущия въпрос", () => {
  const history = Array.from({ length: 20 }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "bot") as "user" | "bot",
    text: `реплика ${i}`,
  }));
  const msgs = toApiMessages(history, "нов въпрос");
  assert.ok(msgs.length <= 9); // MAX_HISTORY_TURNS(8) + текущия
  assert.equal(msgs[msgs.length - 1].role, "user");
  assert.equal(msgs[msgs.length - 1].content, "нов въпрос");
});

test("toGeminiContents: ползва роли user/model и завършва с въпроса", () => {
  const c = toGeminiContents(
    [{ role: "bot", text: "здрасти" }],
    "телефон на кмета",
  );
  assert.equal(c[0].role, "model");
  assert.equal(c[c.length - 1].role, "user");
  assert.equal(c[c.length - 1].parts[0].text, "телефон на кмета");
});
