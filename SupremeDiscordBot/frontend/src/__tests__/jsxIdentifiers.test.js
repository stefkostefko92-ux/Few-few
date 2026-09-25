// frontend/src/__tests__/jsxIdentifiers.test.js
// Всеки JSX компонент, който се рендерира, трябва да е ИМПОРТИРАН или дефиниран
// във файла.
//
// ДЕФЕКТЪТ (одит 24.09.2026): Login.jsx и LandingLocalized.jsx рендерираха
// <FeatureLinks /> без import. Vite билдът минаваше (JSX идентификаторът е просто
// име), unit тестовете минаваха (четат изходния текст), mobile-proof минаваше
// (слушаше само `pageerror`, а React ErrorBoundary хваща грешката и я пише в
// конзолата) — а в браузъра И ОСЕМТЕ начални страници показваха „Something went
// wrong“. Проектът няма ESLint (no-undef/react/jsx-no-undef би го хванал), затова
// гейтът е тук: лексикален, без AST, но точен за нашия стил на писане.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function jsxFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsxFiles(p));
    else if (name.endsWith(".jsx")) out.push(p);
  }
  return out;
}

/** Имената, които файлът въвежда: import-и, функции, класове, const/let. */
function declared(src) {
  const names = new Set();
  for (const m of src.matchAll(/import\s+([\s\S]*?)\s+from\s+["'][^"']+["']/g)) {
    const spec = m[1];
    const def = spec.match(/^([A-Za-z_$][\w$]*)/); if (def) names.add(def[1]);
    const ns = spec.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/); if (ns) names.add(ns[1]);
    const braces = spec.match(/\{([\s\S]*)\}/);
    if (braces) for (const part of braces[1].split(",")) {
      const n = part.trim().split(/\s+as\s+/).pop().trim();
      if (n) names.add(n);
    }
  }
  for (const m of src.matchAll(/(?:function|class)\s+([A-Z][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Z][\w$]*)\s*=/g)) names.add(m[1]);
  // Деструктуриран проп, използван като компонент: `({ icon: Icon })`, `{ x.icon }` → <x.icon/>
  for (const m of src.matchAll(/\b\w+\s*:\s*([A-Z][\w$]*)\s*[,}]/g)) names.add(m[1]);
  // Параметър от деструктуриран масив: `.map(([value, Icon]) => …)`
  for (const m of src.matchAll(/\(\s*\[([^\]]*)\]\s*\)\s*=>/g)) {
    for (const part of m[1].split(",")) { const n = part.trim(); if (/^[A-Z][\w$]*$/.test(n)) names.add(n); }
  }
  for (const m of src.matchAll(/(?:const|let)\s+\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(",")) { const n = part.split(":").pop().trim(); if (/^[A-Z]/.test(n)) names.add(n); }
  }
  return names;
}

describe("нула рендерирани, но неимпортирани JSX компоненти", () => {
  const files = jsxFiles(SRC);
  it("намира файловете (санити)", () => {
    expect(files.length).toBeGreaterThan(20);
  });
  it.each(files.map((f) => [relative(SRC, f), f]))("%s", (_, file) => {
    // Коментарите съдържат примери като „<FeatureLinks />“ — режем ги.
    const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const names = declared(src);
    const used = new Set([...src.matchAll(/<([A-Z][\w$]*)[\s/>]/g)].map((m) => m[1]));
    const missing = [...used].filter((n) => !names.has(n));
    expect(missing, `рендерира без import/дефиниция: ${missing.join(", ")}`).toEqual([]);
  });
});
