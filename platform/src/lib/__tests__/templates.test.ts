import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES, getTemplate } from "@/lib/templates";
import { auditBlocks, a11ySummary } from "@/lib/a11y";
import { parseBlocks } from "@/lib/blocks";

test("всеки шаблон дава валидни блокове (минава Zod)", () => {
  for (const t of TEMPLATES) {
    const built = t.build();
    const parsed = parseBlocks(built);
    assert.equal(parsed.length, built.length, `Шаблон „${t.name}" има невалиден блок`);
  }
});

test("всеки шаблон е достъпен по подразбиране (0 грешки по WCAG)", () => {
  for (const t of TEMPLATES) {
    const { errors, warnings } = a11ySummary(auditBlocks(t.build()));
    assert.equal(errors, 0, `Шаблон „${t.name}" има ${errors} грешки за достъпност`);
    assert.equal(warnings, 0, `Шаблон „${t.name}" има ${warnings} предупреждения за достъпност`);
  }
});

test("всеки шаблон има точно едно H1", () => {
  for (const t of TEMPLATES) {
    const h1 = t.build().filter((b) => b.type === "heading" && b.level === 1);
    assert.equal(h1.length, 1, `Шаблон „${t.name}" няма точно едно H1`);
  }
});

test("build() връща свежи id при всяко извикване", () => {
  const a = TEMPLATES[0].build();
  const b = TEMPLATES[0].build();
  const ids = new Set(a.map((x) => x.id));
  assert.ok(b.every((x) => !ids.has(x.id)), "id-тата се повтарят между извикванията");
});

test("getTemplate намира по id и връща undefined за непознат", () => {
  assert.ok(getTemplate(TEMPLATES[0].id));
  assert.equal(getTemplate("няма-такъв"), undefined);
});
