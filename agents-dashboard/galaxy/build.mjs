#!/usr/bin/env node
// build.mjs — нула-зависимост бъндлър: сплесква src/*.js (ESM, наши файлове, ациклични import-и)
// в ЕДИН класически скрипт `agents-dashboard/galaxy.js` (window.Galaxy = {...}), зареждан от
// index.html с обикновен `<script src="./galaxy.js">` (не module — по-лесно за вграждане в
// build-artifact.mjs, същия модел като `docs.js`). Не e esbuild: файловете тук ги пишем ние,
// графът е малък и ръчно подреден по зависимост — няма нужда от истински резолвър.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const SRC = join(DIR, "src");
const OUT = join(DIR, "..", "galaxy.js");

// Ръчен топологичен ред (проверен от check.mjs — всеки import трябва да сочи файл ПРЕДИ себе си тук).
const ORDER = [
  "config.js",
  "hash.js",
  "labels.js",
  "glsl-noise.js",
  "glsl-galaxy.js",
  "shaders.js",
  "quality.js",
  "pipeline.js",
  "backdrop-field.js",
  "backdrop-draw.js",
  "meteors.js",
  "index.js",
];

function strip(src, file) {
  let out = src.replace(/^import\s[^;]*;\s*$/gm, "");
  out = out.replace(/^export\s+(const|function|class|let|var)\s/gm, "$1 ");
  out = out.replace(/^export\s*\{[^}]*\}\s*;\s*$/gm, "");
  if (/^export\b/m.test(out)) throw new Error(`${file}: необработен export (провери синтаксиса)`);
  return out.trim();
}

export function bundle() {
  const parts = ORDER.map((f) => `// ---- ${f} ----\n${strip(readFileSync(join(SRC, f), "utf8"), f)}`);
  const body = parts.join("\n\n");
  return `// galaxy.js — ГЕНЕРИРАН от galaxy/build.mjs (galaxy/src/*.js). Не редактирай на ръка.\n(function(){\n"use strict";\n${body}\nwindow.Galaxy = { createGalaxy, createBackdrop, separateLabels, layoutLabels, rectToCapsule };\n})();\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = bundle();
  writeFileSync(OUT, out);
  process.stdout.write(`${OUT} ${(out.length / 1024).toFixed(1)} KiB\n`);
}
