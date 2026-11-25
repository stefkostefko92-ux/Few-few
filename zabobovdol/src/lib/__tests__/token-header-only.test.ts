import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// INGEST_TOKEN дава внос, чистене и масови известия. В адреса (?token=…) той
// остава в access лога на Nginx, в историята на браузъра и в Referer — затова
// новите защитени адреси го приемат САМО от „Authorization: Bearer …“.
// Модулите са server-only (не се зареждат в теста) — проверява се изходният код.

const ROUTES = [
  "src/app/api/health/freshness/route.ts",
  "src/app/api/retention/route.ts",
  "src/app/api/ingest-outages/route.ts",
];

test("защитените адреси приемат токена само от заглавката, не от ?token=", () => {
  for (const rel of ROUTES) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    assert.ok(/headers\.get\(\s*["']authorization["']\s*\)/i.test(src), `${rel}: не чете Authorization`);
    assert.ok(!/searchParams\.get\(\s*["']token["']\s*\)/.test(src), `${rel}: приема токена от адреса`);
    assert.ok(!/[?&]token=/.test(src.replace(/\/\/.*$/gm, "")), `${rel}: споменава ?token= в кода`);
  }
});
