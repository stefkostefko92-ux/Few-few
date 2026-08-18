// i18n-scope.test.js — гейт срещу „t is not defined" (три реални инцидента:
// AnalyticsPage, KnowledgeBasePage, ServerCard в Dashboard.jsx).
//
// Правилото: ВСЕКИ компонент (function или arrow, с главна буква), който вика
// t("..."), трябва или сам да извика useT(), или да получава t през
// параметрите си (проп). t от родителския компонент НЕ се наследява —
// function-компонентите нямат общ scope, а бандлерът минифицира достъпа до
// свободната променлива в ReferenceError чак в браузъра (бял екран),
// невидим за unit тестовете на i18n таблиците.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const SKIP_DIRS = new Set(["__tests__", "i18n"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* walk(p);
    } else if (/\.(jsx|js)$/.test(name)) {
      yield p;
    }
  }
}

// Начало на top-level компонент: function X( / const X = ( / const X = props =>
const SPLIT = /(?=^(?:export\s+(?:default\s+)?)?(?:function\s+[A-Z]|const\s+[A-Z]\w*\s*=))/m;
const HEAD =
  /^(?:export\s+(?:default\s+)?)?(?:function\s+([A-Z]\w*)\s*\(([^)]*)\)|const\s+([A-Z]\w*)\s*=\s*(?:\(([^)]*)\)|(\w+))\s*=>)/;

function offenders() {
  const bad = [];
  for (const path of walk(ROOT)) {
    const src = readFileSync(path, "utf8");
    if (!src.includes('t("')) continue;
    for (const chunk of src.split(SPLIT)) {
      const m = chunk.match(HEAD);
      if (!m) continue;
      const name = m[1] || m[3];
      const params = m[2] || m[4] || m[5] || "";
      if (!/[^a-zA-Z_.]t\("/.test(chunk)) continue; // не вика t("...")
      if (chunk.includes("useT()")) continue;        // има си хука
      if (/\bt\b/.test(params)) continue;            // получава t като проп
      bad.push(`${path.replace(ROOT, "src")} → ${name}`);
    }
  }
  return bad;
}

describe("i18n scope — t() е достъпно във всеки компонент, който го вика", () => {
  it("няма компонент с t(\"…\") без useT() или t проп", () => {
    expect(offenders()).toEqual([]);
  });
});
