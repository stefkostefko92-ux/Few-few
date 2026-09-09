#!/usr/bin/env node
// tools/social/publikator.mjs — „ръката" на Социалджията към Публикатор (zero-dep).
//
// Съзнателно ТЯСНА: чете брандове/акаунти/чернови и СЪЗДАВА чернови. Одобрение, насрочване и
// публикуване не съществуват като команди тук (нито като маршрути за ключ на сървъра) — дори
// подведен агент няма как да публикува. Всяка заявка е HMAC-подписана: тайната не пътува.
//
// Среда (файл с права 600 на машината на агента, никога в репото):
//   PUBLIKATOR_URL=https://publikator.carbonstealth.eu
//   PUBLIKATOR_KEY_ID=…      PUBLIKATOR_KEY_SECRET=pk_…
//   или PUBLIKATOR_ENV_FILE=/etc/publikator/agent.env (KEY=VALUE редове)
//
// Употреба:
//   node tools/social/publikator.mjs brands
//   node tools/social/publikator.mjs accounts
//   node tools/social/publikator.mjs drafts [--brand slug] [--status DRAFT]
//   node tools/social/publikator.mjs draft --brand slug --media https://… --caption-file cap.txt \
//        --alt "…" [--hashtags "#a #b"] [--kind IMAGE|REELS] [--cover https://…] [--account id] [--topic "…"]
//   node tools/social/publikator.mjs insights --brand slug [--days 30]
//        → план на страницата + силни/слаби постове + дневен тренд на акаунта (само агрегати)

import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

const COMMANDS = new Set(["brands", "accounts", "drafts", "draft", "insights", "help"]);

function loadEnv() {
  const file = process.env.PUBLIKATOR_ENV_FILE;
  const env = { ...process.env };
  if (file && existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  const url = env.PUBLIKATOR_URL, keyId = env.PUBLIKATOR_KEY_ID, secret = env.PUBLIKATOR_KEY_SECRET;
  if (!url || !keyId || !secret) {
    die("Липсва PUBLIKATOR_URL / PUBLIKATOR_KEY_ID / PUBLIKATOR_KEY_SECRET (или PUBLIKATOR_ENV_FILE).", 2);
  }
  return { url: url.replace(/\/$/, ""), keyId, secret };
}

function die(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

export function sign(secret, { timestamp, nonce, method, path, body }) {
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const canonical = [timestamp, nonce, method.toUpperCase(), path, bodyHash].join("\n");
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

export async function request(cfg, method, path, payload, fetchImpl = fetch) {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("base64url");
  const signature = sign(cfg.secret, { timestamp, nonce, method, path, body });
  const res = await fetchImpl(`${cfg.url}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-publikator-key-id": cfg.keyId,
      "x-publikator-timestamp": timestamp,
      "x-publikator-nonce": nonce,
      "x-publikator-signature": signature,
    },
    body: body || undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}: ${json.error ?? text.slice(0, 200)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) { out[key] = next; i += 1; } else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

function hashtagsFrom(raw) {
  if (!raw) return [];
  return String(raw).split(/[\s,]+/).filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] ?? "help";
  if (!COMMANDS.has(cmd)) die(`Непозната команда „${cmd}“. Виж: node tools/social/publikator.mjs help`, 2);
  if (cmd === "help") {
    process.stdout.write(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 22).map((l) => l.replace(/^\/\/ ?/, "")).join("\n") + "\n");
    return;
  }
  const cfg = loadEnv();

  if (cmd === "brands") return print(await request(cfg, "GET", "/agent/v1/brands"));
  if (cmd === "accounts") return print(await request(cfg, "GET", "/agent/v1/accounts"));
  if (cmd === "drafts") {
    const q = new URLSearchParams();
    if (args.brand) q.set("brand", String(args.brand));
    if (args.status) q.set("status", String(args.status));
    const qs = q.toString();
    return print(await request(cfg, "GET", `/agent/v1/drafts${qs ? `?${qs}` : ""}`));
  }
  if (cmd === "insights") {
    if (!args.brand) die("insights иска --brand slug.", 2);
    const q = new URLSearchParams({ brand: String(args.brand) });
    if (args.days) q.set("days", String(args.days));
    return print(await request(cfg, "GET", `/agent/v1/insights?${q}`));
  }
  if (cmd === "draft") {
    if (!args.brand || !args.media || !args["caption-file"] || !args.alt) {
      die("draft иска --brand, --media (https), --caption-file и --alt.", 2);
    }
    const caption = readFileSync(String(args["caption-file"]), "utf8").trim();
    const payload = {
      brandSlug: String(args.brand),
      kind: args.kind ? String(args.kind) : "IMAGE",
      mediaUrl: String(args.media),
      caption,
      altText: String(args.alt),
      hashtags: hashtagsFrom(args.hashtags),
      ...(args.cover ? { coverUrl: String(args.cover) } : {}),
      ...(args.account ? { accountId: String(args.account) } : {}),
      ...(args.topic ? { topic: String(args.topic) } : {}),
    };
    const result = await request(cfg, "POST", "/agent/v1/drafts", payload);
    const high = (result.findings ?? []).filter((f) => f.severity === "HIGH");
    print(result);
    if (high.length) die(`Черновата е записана, но има ${high.length} HIGH находки — човек няма да я одобри, докато не се поправят.`, 3);
    return;
  }
}

function print(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => die(error.message ?? String(error), error.status ? 1 : 1));
}
