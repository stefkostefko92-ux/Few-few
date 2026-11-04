// artifact-secrets.test.mjs — последната преграда преди публикуване на артефакта на флота.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findSecretsIn } from "./artifact-secrets.mjs";

const FAKE = "sk_live_" + "Ab3".repeat(8); // сглобено, за да не е литерал в репото

test("намира тайната: име, ред, колона и агентът от най-близкото \"id\" — никога стойността", () => {
  const text = `const FALLBACK = {\n  "agents": [\n    { "id": "prodavacha",\n      "lessons": ["ключ ${FAKE} в лог"] }\n  ]\n};`;
  const hits = findSecretsIn(text);
  assert.ok(hits.length >= 1);
  const h = hits[0];
  assert.equal(h.line, 4);
  assert.equal(h.agent, "prodavacha");
  assert.ok(h.col > 1);
  assert.ok(!JSON.stringify(hits).includes(FAKE), "стойността не се връща");
});

test("чист текст → нищо; таван на съвпаденията на шаблон", () => {
  assert.deepEqual(findSecretsIn('{ "id": "seo", "lessons": ["sitemap.xml и robots.txt"] }'), []);
  const many = Array.from({ length: 12 }, (_, i) => `"id": "a${i}" ${FAKE}`).join("\n");
  const byName = new Map();
  for (const h of findSecretsIn(many, 3)) byName.set(h.name, (byName.get(h.name) || 0) + 1);
  for (const n of byName.values()) assert.ok(n <= 3, "max се спазва за всеки шаблон");
});
