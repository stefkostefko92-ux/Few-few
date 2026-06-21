#!/usr/bin/env node
// Билдва и пуска SSR preview harness-а (render-static.tsx) — рендира реалните
// route компоненти върху SQLite (схема + seed + rollups) и записва статичен HTML
// в apps/web/.preview за визуален преглед/заснемане.
//
// Употреба: pnpm --filter @car-monitor/web run preview:static

import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const out = resolve(process.cwd(), ".preview/render.mjs");

await build({
  entryPoints: [resolve(process.cwd(), "scripts/render-static.tsx")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  jsx: "automatic",
  logLevel: "warning",
  banner: { js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" },
});

await import(pathToFileURL(out).href);
