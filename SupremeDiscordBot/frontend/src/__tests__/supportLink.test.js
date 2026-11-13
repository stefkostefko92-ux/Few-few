// supportLink.test.js — връзката към поддръжката е ЕДИН постоянен адрес: `/support`.
//
// ЗАЩО (13.11.2026): поканата беше зашита при билда (VITE_SUPPORT_URL) и на още две
// статични места (index.html, llms.txt). Когато поканата умря, и трите останаха да
// сочат към нищо, а смяната искаше нов билд. Сега всичко сочи към `/support`, което
// backend-ът пренасочва към поканата, зададена от главния акаунт в конзолата.
//
// Този гейт пази да не се върне зашита покана където и да е в сайта.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");
const SITE = read("src", "components", "Seo.jsx").match(/export const SITE = "([^"]+)"/)[1];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules") walk(p, out); }
    else if (/\.(jsx?|html|txt|json|xml)$/.test(name)) out.push(p);
  }
  return out;
}

describe("връзката към поддръжката", () => {
  it("е постоянният адрес /support, не покана, зашита при билда", async () => {
    const { SUPPORT_URL, SUPPORT_LABEL } = await import("../lib/support.js");
    expect(SUPPORT_URL).toBe("/support");
    // Видимият текст (EULA изписва адреса) е пълният публичен адрес на същото място.
    expect(`https://${SUPPORT_LABEL}`).toBe(`${SITE}/support`);
    expect(read("src", "lib", "support.js")).not.toMatch(/VITE_SUPPORT_URL\s*\|\||import\.meta\.env/);
  });

  it("никъде в сайта няма зашита покана в Discord", () => {
    const files = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "public")), join(ROOT, "index.html")];
    const hits = [];
    for (const f of files) {
      const m = readFileSync(f, "utf8").match(/discord\.gg\/[A-Za-z0-9_-]+|discord\.com\/invite\/[A-Za-z0-9_-]+/g);
      if (m) hits.push(`${f.slice(ROOT.length + 1)}: ${[...new Set(m)].join(", ")}`);
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("llms.txt сочи към постоянния адрес", () => {
    expect(read("public", "llms.txt")).toContain(`${SITE}/support`);
  });

  it(".env.example вече не иска покана при билда", () => {
    expect(read(".env.example")).not.toMatch(/^VITE_SUPPORT_URL=/m);
  });
});

describe("/support стига до backend-а, не до SPA-то", () => {
  const live = read("nginx.conf").split("\n").map((l) => l.replace(/#.*$/, "")).join("\n");

  it("nginx има точно съвпадение за /support с proxy към backend-а", () => {
    const block = live.match(/location\s+=\s+\/support\s*\{([^}]*)\}/);
    expect(block, "липсва `location = /support`").toBeTruthy();
    expect(block[1]).toMatch(/proxy_pass\s+http:\/\/\$backend_upstream:3000\$request_uri\s*;/);
    // Реалният IP стига до лимитера на backend-а (иначе всички делят един таван).
    expect(block[1]).toMatch(/proxy_set_header\s+X-Forwarded-For\s+\$proxy_add_x_forwarded_for\s*;/);
  });

  it("vite (dev и preview) го проксира също", () => {
    expect(read("vite.config.js")).toMatch(/["']\/support["']\s*:\s*\{/);
  });
});
