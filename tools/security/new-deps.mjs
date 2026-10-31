#!/usr/bin/env node
// tools/security/new-deps.mjs — новите пакети в lock файловете спрямо базата: typosquat, install
// скриптове, източник извън регистъра. Нула зависимости, без мрежа по подразбиране.
//
// Защо (проучване 31.10.2026, AI-джията): зависимост, добавена от агент, е слой, който плъгинът за
// сигурност на Anthropic изрично не покрива („security-guidance“, code.claude.com). Моделът може да
// сгреши името (`expres`, `reqeusts`) — точно името, което нападателите регистрират. dependency-review
// при нас е best-effort (иска GHAS), затова тук е винаги-включеният, детерминистичен слой.
//
//   node tools/security/new-deps.mjs                    # спрямо origin/main
//   node tools/security/new-deps.mjs --base <ref>       # спрямо друг ref
//   node tools/security/new-deps.mjs --json
// Изход: 0 = нищо съмнително (предупрежденията не гейтват); 1 = подозрение за typosquat; 2 = грешка.
//
// Сигнали:
//   typosquat (гейтва) — ново име на 1 редакция от популярен пакет от нашия стек, или същото име с
//                        разменени „-“/„_“/„.“, без да е самият пакет.
//   install-script (предупреждение) — новият пакет пуска скрипт при инсталиране (package-lock `hasInstallScript`).
//   non-registry (предупреждение)   — резолвнат от git/http tarball, не от registry.npmjs.org.
//   no-integrity (предупреждение)   — липсва `integrity` хеш.

import { execFileSync } from "node:child_process";
import { emitJsonNow } from "../lib/emit.mjs";

// Популярните пакети в нашия стек (продуктовите package.json + най-честите мишени за typosquat).
export const POPULAR = [
  "react", "react-dom", "next", "express", "prisma", "@prisma/client", "zod", "typescript", "eslint", "prettier",
  "vitest", "jest", "lodash", "axios", "dotenv", "stripe", "discord.js", "ccxt", "ejs", "sqlite3", "better-sqlite3",
  "pg", "redis", "ioredis", "bullmq", "tailwindcss", "postcss", "autoprefixer", "three", "gsap", "framer-motion",
  "next-intl", "argon2", "helmet", "cors", "cookie-parser", "express-session", "jsonwebtoken", "bcrypt", "bcryptjs",
  "nodemailer", "sharp", "playwright", "@playwright/test", "puppeteer", "electron", "electron-builder", "vite",
  "@vitejs/plugin-react", "webpack", "chalk", "commander", "yargs", "uuid", "nanoid", "date-fns", "dayjs", "moment",
  "qs", "body-parser", "multer", "ws", "socket.io", "mongoose", "knex", "sequelize", "drizzle-orm",
  "@anthropic-ai/sdk", "@anthropic-ai/vertex-sdk", "openai", "esbuild", "tsx", "ts-node", "nodemon", "concurrently",
  "cross-env", "rimraf", "glob", "minimist", "semver", "debug", "express-rate-limit", "compression", "morgan",
  "winston", "pino", "otplib", "qrcode", "marked", "dompurify", "sanitize-html", "cheerio", "node-fetch", "undici",
];
const POPULAR_SET = new Set(POPULAR);

// Истински пакети на една редакция от популярен (калибрирано 31.10.2026 върху 6 419 пакета в 22-та
// lock файла на репото + познати). Нов легитимен „близнак“ → тук, с коментар откъде е.
export const KNOWN_OK = new Set([
  "gaxios", // Google HTTP клиент (googleapis)
  "preact", // самостоятелна библиотека, не React
  "pino-pretty", "jest-dom",
]);

function dist(a, b) {
  // Damerau–Levenshtein (оптимално подравняване) — транспозиция на съседни знаци струва 1.
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const fold = (n) => n.toLowerCase().replace(/[-_.]/g, "");

/** Името прилича ли на популярен пакет, без да е той? Връща целта или null. */
export function typosquatOf(name) {
  if (POPULAR_SET.has(name) || KNOWN_OK.has(name)) return null;
  for (const p of POPULAR) {
    if (fold(name) === fold(p)) return p; // reactdom, react_dom, discordjs
    const [ns, nn] = name.startsWith("@") ? name.split("/") : ["", name];
    const [ps, pn] = p.startsWith("@") ? p.split("/") : ["", p];
    if (ns === ps && pn.length >= 5 && dist(nn, pn) === 1) return p; // expres, lodahs, @prisma/clinet
    // Обърканият scope (@evil/express) не се гейтва: калибровката даде само истински пакети
    // (@prisma/debug, @discordjs/ws, @sentry/react) — шумът би обезсмислил гейта.
  }
  return null;
}

/** package-lock v2/v3 → Map(име → {integrity, resolved, hasInstallScript}). pnpm-lock → само имена. */
export function parseLock(text, file) {
  const out = new Map();
  if (/pnpm-lock\.yaml$/.test(file)) {
    for (const m of String(text).matchAll(/^ {2}'?\/?((?:@[^/@\s']+\/)?[^@\s'/:]+)@[^:\s']+'?:\s*$/gm)) out.set(m[1], {});
    return out;
  }
  let j;
  try { j = JSON.parse(text); } catch { return out; }
  for (const [k, v] of Object.entries(j.packages || {})) {
    if (!k) continue; // коренът — самият проект
    const name = v.name || k.slice(k.lastIndexOf("node_modules/") + "node_modules/".length);
    if (!out.has(name)) out.set(name, { integrity: v.integrity, resolved: v.resolved, hasInstallScript: !!v.hasInstallScript, link: !!v.link });
  }
  return out;
}

/** Нови пакети (по име) и сигналите им. */
export function analyze(baseText, headText, file) {
  const before = parseLock(baseText || "", file);
  const after = parseLock(headText, file);
  const findings = [];
  for (const [name, meta] of after) {
    if (before.has(name)) continue;
    const squat = typosquatOf(name);
    if (squat) findings.push({ file, name, kind: "typosquat", detail: `прилича на „${squat}“`, gate: true });
    if (meta.link) continue; // workspace връзка — не е от регистъра по дизайн
    if (meta.hasInstallScript) findings.push({ file, name, kind: "install-script", detail: "пуска скрипт при инсталиране", gate: false });
    if (meta.resolved && !/^https:\/\/registry\.npmjs\.org\//.test(meta.resolved)) findings.push({ file, name, kind: "non-registry", detail: meta.resolved, gate: false });
    if (/package-lock\.json$/.test(file) && meta.resolved && !meta.integrity) findings.push({ file, name, kind: "no-integrity", detail: "липсва integrity хеш", gate: false });
  }
  return findings;
}

function git(args) { return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }); }

async function runCli() {
  const argv = process.argv.slice(2);
  const bi = argv.indexOf("--base");
  const base = bi >= 0 ? argv[bi + 1] : "origin/main";
  let files;
  try {
    files = git(["diff", "--name-only", `${base}...HEAD`, "--", "*package-lock.json", "*pnpm-lock.yaml"]).split("\n").filter(Boolean);
  } catch (e) { console.error(`new-deps: не мога да сравня с ${base}: ${e.message.split("\n")[0]}`); process.exit(2); }
  const findings = [];
  for (const f of files) {
    let head = "";
    let before = "";
    try { head = git(["show", `HEAD:${f}`]); } catch { continue; } // изтрит lock
    try { before = git(["show", `${base}:${f}`]); } catch { before = ""; } // нов lock — всичко е ново
    findings.push(...analyze(before, head, f));
  }
  const gate = findings.filter((x) => x.gate);
  if (argv.includes("--json")) await emitJsonNow({ base, files, findings }, gate.length ? 1 : 0);
  if (!findings.length) { console.log(`✓ new-deps: ${files.length} lock файла спрямо ${base} — нищо съмнително.`); process.exit(0); }
  for (const x of findings) console.log(`${x.gate ? "✗" : "▲"} ${x.kind} · ${x.name} · ${x.detail} · ${x.file}`);
  console.log(gate.length ? `\n✗ ${gate.length} подозрения за typosquat — провери името, преди да влезе.` : `\n▲ ${findings.length} предупреждения (не гейтват).`);
  process.exit(gate.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await runCli();
