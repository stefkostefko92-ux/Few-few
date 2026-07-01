import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assistSystemPrompt,
  cleanAssistOutput,
  rulesFallback,
  ASSIST_ACTIONS,
} from "@/lib/ai/assist-core";

test("cleanAssistOutput маха ограждащ кодов блок", () => {
  assert.equal(cleanAssistOutput("```\nЗдравей\n```"), "Здравей");
  assert.equal(cleanAssistOutput("```md\n**текст**\n```"), "**текст**");
});

test("cleanAssistOutput маха водещи/затварящи кавички около целия текст", () => {
  assert.equal(cleanAssistOutput('"Здравей свят"'), "Здравей свят");
  assert.equal(cleanAssistOutput("„Добре дошли“"), "Добре дошли");
});

test("cleanAssistOutput не пипа вътрешни кавички", () => {
  const s = 'Той каза „да" и си тръгна';
  assert.equal(cleanAssistOutput(s), s);
});

test("rulesFallback: shorten връща първото изречение", () => {
  assert.equal(
    rulesFallback("shorten", "Първо изречение. Второ изречение."),
    "Първо изречение.",
  );
});

test("rulesFallback: alt реже до 120 знака и нормализира интервалите", () => {
  const long = "дума ".repeat(60);
  const out = rulesFallback("alt", long);
  assert.ok(out.length <= 120);
  assert.ok(!/\s{2,}/.test(out));
});

test("rulesFallback: превод/подобрение без ключ връща оригинала", () => {
  assert.equal(rulesFallback("translate-en", "Здравей"), "Здравей");
  assert.equal(rulesFallback("improve", "Текст"), "Текст");
});

test("assistSystemPrompt съдържа инструкция за връщане само на текста", () => {
  const p = assistSystemPrompt("professional");
  assert.match(p, /САМО/);
});

test("ASSIST_ACTIONS съдържа превод в двете посоки", () => {
  const actions = ASSIST_ACTIONS.map((a) => a.action);
  assert.ok(actions.includes("translate-en"));
  assert.ok(actions.includes("translate-bg"));
});
