// frontend/src/__tests__/docsPages.test.js
// Ръководствата за клиенти (/docs) са обещание към платил човек — и лъжат най-тихо:
// команда, преименувана в кода и останала в текста; връзка към страница, която вече
// я няма; число от поканата, сменено на едно място. Тук всичко се сверява срещу
// ИЗТОЧНИЦИТЕ (каталога на командите, маршрутите, числото на поканата), не срещу прозата.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCS_HUB, DOCS_PAGES, DOCS_KINDS, DOCS_SITE, docsPath } from "../data/docsPages";
import { parseInline, plainText, groupByKind, docsJsonLd, docsHubJsonLd } from "../data/docsFormat";
import { FEATURE_ROUTES } from "../data/featurePages";
import { TICKET_TOOL_COMPARE, APPY_COMPARE, BEST_TICKET_BOT_GUIDE, GDPR_GUIDE, PANEL_SETUP_GUIDE } from "../data/growthContent";
import { COMMAND_CATALOG } from "../data/commandsCatalog";
import { INVITE_PERMISSIONS } from "../lib/invite";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(SRC, ...p), "utf8");
const SITE = read("components", "Seo.jsx").match(/export const SITE = "([^"]+)"/)[1];

/** Всички низове на една страница: [къде, текст]. */
function strings(p) {
  const out = [["answer", p.answer], ...(p.requires || []).map((r, i) => [`requires[${i}]`, r])];
  for (const s of p.sections) {
    const at = `#${s.id}`;
    (s.body || []).forEach((x, i) => out.push([`${at} body[${i}]`, x]));
    (s.steps || []).forEach((x, i) => out.push([`${at} steps[${i}]`, x]));
    (s.list || []).forEach((x, i) => out.push([`${at} list[${i}]`, x]));
    (s.table?.rows || []).forEach((r, i) => r.forEach((c, j) => out.push([`${at} table[${i}][${j}]`, c])));
    if (s.note) out.push([`${at} note`, s.note]);
  }
  (p.faq || []).forEach((f, i) => { out.push([`faq[${i}].q`, f.q]); out.push([`faq[${i}].a`, f.a]); });
  return out;
}

const KNOWN_ROUTES = new Set([
  DOCS_HUB.path, ...DOCS_PAGES.map(docsPath),
  ...FEATURE_ROUTES,
  ...[TICKET_TOOL_COMPARE, APPY_COMPARE, BEST_TICKET_BOT_GUIDE, GDPR_GUIDE, PANEL_SETUP_GUIDE].map((d) => d.path),
  "/", "/commands", "/status", "/terms", "/privacy", "/cookies", "/eula", "/accessibility", "/dashboard",
]);
const routeOf = (href) => href.split("#")[0].split("?")[0] || "/";

describe("ръководствата съществуват и покриват основното", () => {
  it("има поне 8 страници и задължителните четири", () => {
    expect(DOCS_PAGES.length).toBeGreaterThanOrEqual(8);
    const slugs = DOCS_PAGES.map((p) => p.slug);
    for (const must of ["getting-started", "permissions", "tickets", "verification-and-bait"]) {
      expect(slugs, `липсва /docs/${must}`).toContain(must);
    }
  });

  it("първата страница е урок — оттам започва нов клиент", () => {
    expect(groupByKind(DOCS_PAGES)[0]?.kind).toBe("tutorial");
  });
});

describe("всяка страница спазва договора от docsPages.js", () => {
  it("адресът е уникален и kebab-case; видът е по Diátaxis", () => {
    const seen = new Set();
    for (const p of DOCS_PAGES) {
      expect(p.slug, p.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(seen.has(p.slug), `дублиран адрес: ${p.slug}`).toBe(false);
      seen.add(p.slug);
      expect(Object.keys(DOCS_KINDS), `${p.slug}: вид „${p.kind}“`).toContain(p.kind);
    }
  });

  it("заглавие ≤ 60 знака и уникално; описание 110–165 знака и уникално; кратко име ≤ 32", () => {
    const titles = new Set(); const descs = new Set();
    for (const p of [...DOCS_PAGES]) {
      expect(p.title.length, `${p.slug} title (${p.title.length})`).toBeLessThanOrEqual(60);
      expect(p.nav.length, `${p.slug} nav`).toBeLessThanOrEqual(32);
      expect(p.description.length, `${p.slug} description (${p.description.length})`).toBeGreaterThanOrEqual(110);
      expect(p.description.length, `${p.slug} description (${p.description.length})`).toBeLessThanOrEqual(165);
      expect(titles.has(p.title), `дублирано заглавие: ${p.title}`).toBe(false);
      expect(descs.has(p.description), `дублирано описание: ${p.slug}`).toBe(false);
      titles.add(p.title); descs.add(p.description);
    }
  });

  it("≥5 ключови думи и carbon stealth е една от тях (root CLAUDE.md)", () => {
    for (const p of [DOCS_HUB, ...DOCS_PAGES]) {
      expect(p.keywords.length, p.slug || p.path).toBeGreaterThanOrEqual(5);
      expect(p.keywords.map((k) => k.toLowerCase()), p.slug || p.path).toContain("carbon stealth");
    }
  });

  it("има отговор отпред, дата на сверка и раздели със съдържание и уникални котви", () => {
    for (const p of DOCS_PAGES) {
      expect(plainText(p.answer).length, `${p.slug} answer`).toBeGreaterThan(60);
      expect(p.updated, `${p.slug} updated`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.sections.length, `${p.slug} sections`).toBeGreaterThanOrEqual(2);
      const ids = new Set();
      for (const s of p.sections) {
        expect(s.id, `${p.slug} #${s.id}`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(s.id, `${p.slug}: „faq“ е заета котва`).not.toBe("faq");
        expect(ids.has(s.id), `${p.slug}: дублирана котва #${s.id}`).toBe(false);
        ids.add(s.id);
        expect(s.heading?.length > 0, `${p.slug} #${s.id} heading`).toBe(true);
        const filled = (s.body?.length || 0) + (s.steps?.length || 0) + (s.list?.length || 0) + (s.table ? 1 : 0) + (s.code ? 1 : 0);
        expect(filled, `${p.slug} #${s.id} е празен раздел`).toBeGreaterThan(0);
        if (s.table) for (const r of s.table.rows) expect(r.length, `${p.slug} #${s.id}: ред с грешен брой колони`).toBe(s.table.head.length);
      }
    }
  });

  it("урокът и ръководствата „как“ имат стъпки — иначе са описание, не ръководство", () => {
    for (const p of DOCS_PAGES.filter((x) => x.kind === "tutorial" || x.kind === "how-to")) {
      expect(p.sections.some((s) => s.steps?.length), `${p.slug} няма нито една стъпка`).toBe(true);
    }
  });
});

describe("текстът е в позволения формат", () => {
  it("без HTML и без **удебеляване** — само `код` и [връзки](/път)", () => {
    for (const p of DOCS_PAGES) for (const [where, text] of strings(p)) {
      expect(text, `${p.slug} ${where}`).not.toMatch(/<\/?[a-z][^>]*>/i);
      expect(text, `${p.slug} ${where}`).not.toMatch(/\*\*/);
      // Недовършена връзка: [текст](адрес), който parseInline не е разпознал.
      const leftover = parseInline(text).filter((t) => t.type === "text").map((t) => t.value).join(" ");
      expect(leftover, `${p.slug} ${where}: връзка с непозволен адрес`).not.toMatch(/\]\(/);
    }
  });
});

describe("нищо в текста не сочи в нищото", () => {
  it("всяка вътрешна връзка и всяка „свързана страница“ е жив маршрут", () => {
    const dead = [];
    for (const p of DOCS_PAGES) {
      for (const r of p.related || []) if (!KNOWN_ROUTES.has(routeOf(r))) dead.push(`${p.slug} related → ${r}`);
      for (const [where, text] of strings(p)) {
        for (const t of parseInline(text)) {
          if (t.type === "link" && t.href.startsWith("/") && !KNOWN_ROUTES.has(routeOf(t.href))) dead.push(`${p.slug} ${where} → ${t.href}`);
        }
      }
    }
    expect(dead).toEqual([]);
  });

  it("котва към друго ръководство (/docs/x#y) съществува там", () => {
    const anchors = new Map(DOCS_PAGES.map((p) => [docsPath(p), new Set([...p.sections.map((s) => s.id), "faq"])]));
    const dead = [];
    for (const p of DOCS_PAGES) for (const [where, text] of strings(p)) {
      for (const t of parseInline(text)) {
        if (t.type !== "link" || !t.href.includes("#")) continue;
        const [path, hash] = t.href.split("#");
        if (anchors.has(path) && !anchors.get(path).has(hash)) dead.push(`${p.slug} ${where} → ${t.href}`);
      }
    }
    expect(dead).toEqual([]);
  });

  it("всяка спомената команда съществува в каталога", () => {
    const names = COMMAND_CATALOG.flatMap((c) => c.commands || []).map((c) => c.name.toLowerCase());
    // „/ticket“ е валидно споменаване на групата „/ticket close“, „/ticket add“ …
    const known = (cmd) => names.some((n) => n === cmd || n.startsWith(`${cmd} `));
    const unknown = [];
    for (const p of DOCS_PAGES) for (const [where, text] of strings(p)) {
      for (const t of parseInline(text)) {
        if (t.type !== "code" || !/^\/[a-z]/.test(t.value) || t.value.slice(1).includes("/")) continue; // пътища и адреси не са команди
        // Името е водещите думи с малки букви: „/ticket close [reason]“ → „/ticket close“.
        const words = t.value.toLowerCase().split(/\s+/);
        let cmd = words[0];
        for (const w of words.slice(1)) { if (!/^[a-z][a-z-]*$/.test(w) || !known(`${cmd} ${w}`)) break; cmd = `${cmd} ${w}`; }
        if (!known(cmd)) unknown.push(`${p.slug} ${where}: ${t.value}`);
      }
    }
    expect(unknown, "команда извън src/data/commandsCatalog.js").toEqual([]);
  });

  it("числото на поканата, ако е написано, е това от lib/invite.js", () => {
    for (const p of DOCS_PAGES) for (const [where, text] of strings(p)) {
      for (const m of text.matchAll(/\b\d{12,}\b/g)) expect(m[0], `${p.slug} ${where}`).toBe(INVITE_PERMISSIONS);
    }
  });
});

describe("без обещания, които не можем да докажем", () => {
  const FORBIDDEN = [
    [/vat\s+included|including\s+vat\b(?!\s+for)/i, "цената с ДДС я показва Discord — не я обещаваме ние"],
    [/gdpr[-\s]compliant|fully\s+compliant/i, "абсолютно твърдение за съответствие"],
    [/\b24\/7\b/, "поддръжка 24/7 не съществува"],
    [/\bguarantee[ds]?\b/i, "гаранция"],
    [/never\s+leaves?\s+the\s+eu|data\s+stays\s+in\s+the\s+eu/i, "данните минават и през Discord и Google"],
  ];
  it("няма ги в нито една страница", () => {
    const hits = [];
    for (const p of DOCS_PAGES) for (const [where, text] of [["description", p.description], ...strings(p)]) {
      for (const [re, why] of FORBIDDEN) if (re.test(text)) hits.push(`${p.slug} ${where}: ${why}`);
    }
    expect(hits).toEqual([]);
  });
});

describe("страниците са достъпни за хора и обхождачи", () => {
  it("SITE е същият като в Seo.jsx", () => {
    expect(DOCS_SITE).toBe(SITE);
  });

  it("маршрутите са в App.jsx", () => {
    const app = read("App.jsx");
    expect(app).toContain('path="/docs"');
    expect(app).toContain('path="/docs/:slug"');
  });

  it("началните страници водят към /docs (футърът) и пререндерът ги снима", () => {
    expect(read("components", "LandingParts.jsx")).toContain('href="/docs"');
    expect(read("components", "PublicPageLayout.jsx")).toContain('href="/docs"');
    const prerender = readFileSync(join(SRC, "..", "scripts", "prerender.mjs"), "utf8");
    expect(prerender).toContain("docsSnapshot(p)");
    expect(prerender).toContain("docsLinks()");
  });

  it("всяка страница е в sitemap.xml и в llms.txt", () => {
    const sitemap = readFileSync(join(SRC, "..", "public", "sitemap.xml"), "utf8");
    const llms = readFileSync(join(SRC, "..", "public", "llms.txt"), "utf8");
    const missing = [];
    for (const path of [DOCS_HUB.path, ...DOCS_PAGES.map(docsPath)]) {
      if (!sitemap.includes(`<loc>${SITE}${path}</loc>`)) missing.push(`sitemap.xml: ${path}`);
      if (!llms.includes(`${SITE}${path})`)) missing.push(`llms.txt: ${path}`);
    }
    expect(missing).toEqual([]);
  });

  it("структурираните данни се строят и носят въпросите", () => {
    expect(docsHubJsonLd(DOCS_PAGES)["@graph"][0].hasPart).toHaveLength(DOCS_PAGES.length);
    for (const p of DOCS_PAGES) {
      const graph = docsJsonLd(p)["@graph"];
      expect(graph[0]["@type"]).toBe("TechArticle");
      expect(graph[0].dateModified).toBe(p.updated);
      if (p.faq?.length) expect(graph.find((g) => g["@type"] === "FAQPage").mainEntity).toHaveLength(p.faq.length);
    }
  });
});
