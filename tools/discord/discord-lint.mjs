#!/usr/bin/env node
// tools/discord/discord-lint.mjs — статичен линтер за Discord ботове/webhooks.
//
// Хваща типичните грешки и рискове, БЕЗ да пуска бота: твърдо вписан токен / webhook URL,
// привилегировани intents, HTTP interaction handler без Ed25519 верификация, interaction
// без defer при дълга работа, плътен цикъл от REST заявки, @everyone без allowed_mentions guard.
//
// Употреба:  node tools/discord/discord-lint.mjs <папка-или-файл>
// Изход: 0 = чисто/само INFO, 1 = има HIGH находки. Евристичен помощник, не заместител на ревю/тест.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const root = process.argv[2] || ".";
const findings = [];
const add = (sev, code, msg, where) => findings.push({ sev, code, msg, where });

function walk(dir, acc = []) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    if (e === "node_modules" || e === ".git" || e === "dist" || e === "build") continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

if (!existsSync(root)) { add("HIGH", "no-path", `Пътят не съществува: ${root}`, root); report(); process.exit(1); }

const files = (statSync(root).isDirectory() ? walk(root) : [root])
  .filter((f) => [".js", ".mjs", ".cjs", ".ts", ".py", ".json", ".env"].includes(extname(f)) || f.endsWith(".env"));

// Discord bot token: 3 base64url части (id.timestamp.hmac). Webhook URL носи токен накрая.
const TOKEN_RE = /\b[MNO][A-Za-z0-9_-]{23,26}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}\b/;
const WEBHOOK_RE = /discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]{60,}/;
const PRIVILEGED = /\b(MESSAGE_CONTENT|GuildMembers|GUILD_MEMBERS|GuildPresences|GUILD_PRESENCES|MessageContent)\b/;

for (const f of files) {
  let src = "";
  try { src = readFileSync(f, "utf8"); } catch { continue; }
  const rel = f.replace(root, "").replace(/^\//, "") || f;
  const isEnvOrSample = /\.env(\.example|\.sample)?$/.test(f) || /example|sample/i.test(f);

  // 1) Твърдо вписан токен / webhook URL
  if (TOKEN_RE.test(src) && !isEnvOrSample)
    add("HIGH", "hardcoded-token", "Изглежда твърдо вписан Discord bot токен — дръж го в env, НИКОГА в код/git; ако е реален → ротирай веднага в Dev Portal.", rel);
  if (WEBHOOK_RE.test(src) && !isEnvOrSample)
    add("HIGH", "hardcoded-webhook", "Webhook URL с токен в кода — URL-ът Е тайната (без друга авторизация). Премести в env.", rel);

  // 2) Привилегировани intents без коментар-обосновка
  if (PRIVILEGED.test(src)) {
    const line = src.split("\n").find((l) => PRIVILEGED.test(l)) || "";
    if (!/\/\/|#/.test(line))
      add("MEDIUM", "privileged-intent", "Привилегирован intent (MESSAGE_CONTENT/GUILD_MEMBERS/GUILD_PRESENCES) — изисква включване в Dev Portal + verification при 100+ guild-а. Искай само ако реално го ползваш.", rel);
  }

  // 3) HTTP interactions без Ed25519 верификация
  const looksHttpInteraction = /(X-Signature-Ed25519|interactionsEndpoint|InteractionType|type\s*[:=]\s*1\b.*PING|application\/json.*interaction)/i.test(src)
    || /req\.(body|headers).*(signature|x-signature)/i.test(src);
  if (looksHttpInteraction && !/(nacl|tweetnacl|verifyKey|Ed25519|ed25519|sign_open|VerifyKey)/.test(src))
    add("HIGH", "no-ed25519", "HTTP interaction handler без Ed25519 верификация на подписа (X-Signature-Ed25519/-Timestamp) — Discord отхвърля endpoint-а; верифицирай преди да обработиш, и отговори на PING(1) с PONG(1).", rel);

  // 4) Interaction с дълга работа без defer
  if (/(interaction|ctx)\.(reply|respond)\b/.test(src) && /(await\s+fetch|await\s+axios|https?\.request|await\s+\w+\.(query|get|post))/.test(src) && !/(defer|deferReply|DEFERRED|type\s*[:=]\s*5)/.test(src))
    add("MEDIUM", "no-defer", "Interaction отговор след await към външно API без defer — рискуваш 3-секундния лимит ('This interaction failed'). Извикай defer (type 5) преди дългата работа.", rel);

  // 5) Плътен цикъл от REST заявки без пауза
  if (/(for|while)\s*\(.*\)\s*\{[\s\S]{0,200}?(await\s+)?(fetch|axios|rest\.(get|post|put|patch|delete))\(/.test(src) && !/(sleep|setTimeout|delay|rateLimit|p-queue|Bottleneck|await\s+wait)/.test(src))
    add("MEDIUM", "tight-rest-loop", "Плътен цикъл от REST заявки без rate-limit пауза — рискуваш 429 и (над 10000 невалидни/10мин) Cloudflare бан на IP. Ползвай библиотека с bucket мениджмънт или throttle.", rel);

  // 6) @everyone/@here без allowed_mentions guard
  if (/@everyone|@here/.test(src) && !/allowed_mentions|allowedMentions/.test(src) && !isEnvOrSample)
    add("INFO", "mention-guard", "Споменаване на @everyone/@here без allowed_mentions guard — лесно се злоупотребява чрез потребителски вход; задай allowed_mentions изрично.", rel);
}

report();
process.exit(findings.some((f) => f.sev === "HIGH") ? 1 : 0);

function report() {
  const order = { HIGH: 0, MEDIUM: 1, INFO: 2 };
  findings.sort((a, b) => order[a.sev] - order[b.sev]);
  if (!findings.length) { console.log("✓ discord-lint: чисто (няма находки)."); return; }
  console.log(`discord-lint — ${findings.length} находки за ${root}:\n`);
  for (const f of findings)
    console.log(`  [${f.sev}] ${f.code} · ${f.where}\n        ${f.msg}`);
  const h = findings.filter((f) => f.sev === "HIGH").length;
  console.log(`\n${h} HIGH · ${findings.filter((f) => f.sev === "MEDIUM").length} MEDIUM · ${findings.filter((f) => f.sev === "INFO").length} INFO`);
}
