#!/usr/bin/env node
// tools/social/piuma.mjs — „ръката" на Социалджията към Piuma (zero-dep).
//
// Съзнателно ТЯСНА: чете брандове/акаунти/чернови и СЪЗДАВА чернови. Одобрение, насрочване и
// публикуване не съществуват като команди тук (нито като маршрути за ключ на сървъра) — дори
// подведен агент няма как да публикува. Всяка заявка е HMAC-подписана: тайната не пътува.
//
// Среда (файл с права 600 на машината на агента, никога в репото):
//   PIUMA_URL=https://piuma.carbonstealth.eu
//   PIUMA_KEY_ID=…      PIUMA_KEY_SECRET=pk_…
//   или PIUMA_ENV_FILE=/etc/piuma/agent.env (KEY=VALUE редове)
//
// Употреба:
//   node tools/social/piuma.mjs brands
//   node tools/social/piuma.mjs accounts
//   node tools/social/piuma.mjs drafts [--brand slug] [--status DRAFT]
//   node tools/social/piuma.mjs draft --brand slug --media https://… --caption-file cap.txt \
//        --alt "…" [--hashtags "#a #b"] [--kind IMAGE|REELS] [--cover https://…] [--account id] [--topic "…"]
//   node tools/social/piuma.mjs insights --brand slug [--days 30] [--json]
//        → какво показват СОБСТВЕНИТЕ числа: кога · формат · тема, с бройките зад всяка кофа
//          и честна степен на увереност. Без „← извод“ значи „още е рано“, не „няма разлика“.
//          --json дава суровия отговор (всеки пост + дневен тренд). Само агрегати.

import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

const COMMANDS = new Set(["brands", "accounts", "drafts", "draft", "insights", "help"]);

function loadEnv() {
  const file = process.env.PIUMA_ENV_FILE;
  const env = { ...process.env };
  if (file && existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  const url = env.PIUMA_URL, keyId = env.PIUMA_KEY_ID, secret = env.PIUMA_KEY_SECRET;
  if (!url || !keyId || !secret) {
    die("Липсва PIUMA_URL / PIUMA_KEY_ID / PIUMA_KEY_SECRET (или PIUMA_ENV_FILE).", 2);
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
      "x-piuma-key-id": cfg.keyId,
      "x-piuma-timestamp": timestamp,
      "x-piuma-nonce": nonce,
      "x-piuma-signature": signature,
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
  if (!COMMANDS.has(cmd)) die(`Непозната команда „${cmd}“. Виж: node tools/social/piuma.mjs help`, 2);
  if (cmd === "help") {
    // Заглавният коментар Е помощта. Границата се намира, не се брои: фиксираният
    // диапазон мълчаливо реже или показва код при всяка промяна на заглавието.
    const head = readFileSync(new URL(import.meta.url), "utf8").split("\n");
    const end = head.findIndex((line, i) => i > 0 && !line.startsWith("//"));
    process.stdout.write(head.slice(1, end === -1 ? head.length : end).map((l) => l.replace(/^\/\/ ?/, "")).join("\n") + "\n");
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
    const data = await request(cfg, "GET", `/agent/v1/insights?${q}`);
    if (args.json) return print(data);
    // По подразбиране — четимо резюме. Суровият отговор носи всеки пост с числата му;
    // изводът, от който зависи решението, се дави в него и се чете грешно.
    process.stdout.write(summarizeLearned(data.learned, data.brand));
    return;
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

const DAY_PART_BG = {
  morning: "сутрин (06–11)",
  midday: "обед (11–15)",
  afternoon: "следобед (15–19)",
  evening: "вечер (19–23)",
  night: "нощ (23–06)",
};

const REASON_BG = {
  "no-posts": "няма публикувани постове с метрики",
  "too-few": "има данни, но под прага — иска ≥6 поста в поне 2 кофи",
  "no-clear-winner": "кофите са пълни, но разликата е в рамките на шума",
  ok: "достатъчно данни и ясна преднина",
};

/**
 * Превежда стълбата на увереността в текст, който не може да се прочете като догадка.
 * `best: null` НЕ значи „няма разлика" — значи „още не знаем"; двете водят до различни
 * решения, затова причината се изписва винаги, а не само при извод.
 */
function renderFinding(label, finding, nameOf = (v) => String(v)) {
  const lines = [`${label}: `];
  if (finding.confidence === "ready" && finding.best !== null) {
    lines[0] += `${nameOf(finding.best)}  ← извод`;
  } else {
    lines[0] += `още няма извод (${REASON_BG[finding.reason] ?? finding.reason})`;
  }
  for (const bucket of finding.buckets) {
    lines.push(`    ${nameOf(bucket.value)} — ${bucket.medianRate}% медиана, ${bucket.posts} поста`);
  }
  if (finding.buckets.length === 0) lines.push("    (нула кофи с данни)");
  return lines.join("\n");
}

export function summarizeLearned(learned, brand) {
  if (!learned) return "Отговорът няма блок `learned` — сървърът е по-стар от това CLI.\n";
  const out = [];
  out.push(`Бранд: ${brand?.slug ?? "?"}${brand?.managed ? " (управляван)" : ""}`);
  out.push(`Извадка: ${learned.sample} публикувани поста с метрики · часовник: ${learned.timezone}`);
  out.push("");
  out.push(renderFinding("Кога", learned.timing, (v) => DAY_PART_BG[v] ?? v));
  out.push(renderFinding("Формат", learned.format));
  out.push(renderFinding("Тема", learned.topic));
  out.push("");
  // Правилото, което пази агента от това да облече „рано е" в увереност.
  out.push("Мярката е ангажираност/обхват, не суров обхват (обхватът расте с акаунта).");
  out.push("Без „← извод“ не предлагай промяна в плана — кажи, че още е рано, и защо.");
  out.push("Пълният отговор (всеки пост + дневен тренд): добави --json.");
  return `${out.join("\n")}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => die(error.message ?? String(error), error.status ? 1 : 1));
}
