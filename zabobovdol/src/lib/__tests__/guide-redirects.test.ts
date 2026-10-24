import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  RETIRED_GUIDES,
  RETIRED_GUIDE_SLUGS,
  retiredGuideTarget,
} from "@/lib/guide-redirects";

// Сийдовете с ръководства (prisma/seed*.ts) — четем ги като текст, за да пазим
// инвариантите без база: нула дублирани заглавия и нула оттеглени slug-ове.
const PRISMA_DIR = resolve(__dirname, "../../../prisma");
const SEEDS = readdirSync(PRISMA_DIR)
  .filter((f) => /^seed.*\.ts$/.test(f))
  .map((f) => ({ file: f, text: readFileSync(join(PRISMA_DIR, f), "utf8") }));

// Двойки slug → заглавие (`question: "…"` или `q: \`…\``) с най-близкия slug
// преди заглавието в същия файл.
function guideDefinitions(): { slug: string; question: string; file: string }[] {
  const out: { slug: string; question: string; file: string }[] = [];
  const qRe = /\b(?:question|q):\s*(["`])((?:\\.|(?!\1)[^\\])*)\1/g;
  for (const { file, text } of SEEDS) {
    for (const m of text.matchAll(qRe)) {
      const before = text.slice(0, m.index ?? 0);
      const slugs = [...before.matchAll(/\bslug:\s*"([a-z0-9-]+)"/g)];
      const slug = slugs.at(-1)?.[1];
      if (slug) out.push({ slug, question: m[2].trim(), file });
    }
  }
  return out;
}

test("retiredGuideTarget връща каноничния slug само за оттеглените", () => {
  assert.equal(retiredGuideTarget("c-zdravno-dosie2"), "docs-zdravno-dosie");
  assert.equal(retiredGuideTarget("docs-zdravno-dosie"), null);
  assert.equal(retiredGuideTarget("constructor"), null);
  assert.equal(retiredGuideTarget(""), null);
});

test("пренасочванията нямат вериги (каноничният не е оттеглен)", () => {
  for (const [from, to] of Object.entries(RETIRED_GUIDES)) {
    assert.notEqual(from, to);
    assert.equal(retiredGuideTarget(to), null, `${from} → ${to} води към оттеглен`);
  }
});

test("сийдовете не създават оттеглени ръководства", () => {
  for (const slug of RETIRED_GUIDE_SLUGS) {
    for (const { file, text } of SEEDS) {
      assert.ok(!text.includes(`"${slug}"`), `${slug} още е в prisma/${file}`);
    }
  }
});

test("всяко канонично ръководство съществува в сийдовете", () => {
  const defined = new Set(guideDefinitions().map((d) => d.slug));
  for (const to of Object.values(RETIRED_GUIDES)) {
    assert.ok(defined.has(to), `${to} липсва в сийдовете`);
  }
});

test("няма две различни ръководства с едно и също заглавие (дублирано съдържание)", () => {
  const defs = guideDefinitions();
  assert.ok(defs.length > 500, `намерени само ${defs.length} ръководства — парсерът е счупен?`);
  const byQuestion = new Map<string, Set<string>>();
  for (const d of defs) {
    const set = byQuestion.get(d.question) ?? new Set<string>();
    set.add(d.slug);
    byQuestion.set(d.question, set);
  }
  const dups = [...byQuestion].filter(([, s]) => s.size > 1);
  assert.deepEqual(
    dups.map(([q, s]) => `${q}: ${[...s].join(", ")}`),
    [],
    "обединете ги: оставете едно и добавете другото в src/lib/guide-redirects.ts",
  );
});
