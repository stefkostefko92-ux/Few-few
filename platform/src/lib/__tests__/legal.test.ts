import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGAL_DOCS, getLegalDoc } from "@/lib/legal";

test("има трите задължителни документа", () => {
  const slugs = LEGAL_DOCS.map((d) => d.slug);
  assert.ok(slugs.includes("usloviya"));
  assert.ok(slugs.includes("poveritelnost"));
  assert.ok(slugs.includes("biskvitki"));
});

test("всеки документ има заглавие, интро и поне един раздел с параграфи", () => {
  for (const d of LEGAL_DOCS) {
    assert.ok(d.title.length > 0, `${d.slug} без заглавие`);
    assert.ok(d.intro.length > 0, `${d.slug} без интро`);
    assert.ok(d.sections.length > 0, `${d.slug} без раздели`);
    for (const s of d.sections) {
      assert.ok(s.heading.length > 0);
      assert.ok(s.paragraphs.length > 0 && s.paragraphs.every((p) => p.length > 0));
    }
  }
});

test("политиката за бисквитки декларира липса на банер (само необходима бисквитка)", () => {
  const c = getLegalDoc("biskvitki");
  assert.ok(c);
  const text = c.sections.flatMap((s) => s.paragraphs).join(" ");
  assert.match(text, /необходим/i);
});

test("getLegalDoc връща undefined за непознат", () => {
  assert.equal(getLegalDoc("no-such"), undefined);
});
