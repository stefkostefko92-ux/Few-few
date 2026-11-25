#!/usr/bin/env node
// ai-bots.mjs — измерва AI обхождането от server access лог (SEO агент).
// GA4 е сляп за ботове — логовете са истината. Брои посещенията по известните AI ботове и смята
// crawl-to-refer (колко обхождат срещу колко посетители идват обратно от AI отговорите).
//
// Употреба:
//   node tools/seo/ai-bots.mjs /var/log/nginx/access.log
//   zcat access.log.*.gz | node tools/seo/ai-bots.mjs -      (чете от stdin)
//
// Списъкът е сверен на 22.11.2026 с официалните страници (tools/seo/research-2026-11.md, раздел 5):
// platform.openai.com/docs/bots · support.claude.com/en/articles/8896518 · support.apple.com/en-us/119829 ·
// developers.facebook.com/docs/sharing/webmasters/web-crawlers · duckduckgo.com/duckduckgo-help-pages/results/duckassistbot ·
// docs.mistral.ai/robots. `Google-Extended` и `Applebot-Extended` НЕ са user-agent — те са само токени в
// robots.txt за обучение и в лога никога не се появяват.
import fs from "node:fs";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

// Ред = приоритет: по-конкретното име преди по-общото (Claude-SearchBot преди ClaudeBot).
export const BOTS = {
  "OAI-SearchBot": "търсещ (ChatGPT search)", "OAI-AdsBot": "проверява реклами (ChatGPT)",
  "ChatGPT-User": "по заявка на потребител (ChatGPT)", "GPTBot": "обучаващ (OpenAI)",
  "Claude-SearchBot": "търсещ (Claude)", "Claude-User": "по заявка на потребител (Claude)", "ClaudeBot": "обучаващ (Anthropic)",
  "Perplexity-User": "по заявка на потребител (Perplexity)", "PerplexityBot": "търсещ (Perplexity)",
  "DuckAssistBot": "AI отговори (DuckDuckGo)", "MistralAI-User": "по заявка на потребител (Mistral)",
  "meta-externalagent": "обучаващ/индексиращ (Meta)",
  "Applebot": "търсещ (Siri/Spotlight)", "Googlebot": "класически (Google — вкл. AI Overviews/AI Mode)",
  "bingbot": "класически (Bing — вкл. Copilot)",
  "CCBot": "обучаващ (Common Crawl)", "Bytespider": "обхождащ (ByteDance)", "Amazonbot": "обхождащ (Amazon)",
};

// Хостове в Referer. Google праща само origin (https://www.google.com/) — AI Mode/AI Overviews не се
// отличават от обикновените резултати; за тях е отчетът Generative AI performance в Search Console.
export const REFERRERS = ["chatgpt.com", "perplexity.ai", "claude.ai", "gemini.google.com", "copilot.microsoft.com", "chat.mistral.ai"];

const BOT_KEYS = Object.keys(BOTS).map((k) => [k, k.toLowerCase()]);

/** Полетата на комбинирания формат: заявка, referer, user-agent (последните три полета в кавички). */
function fields(line) {
  const q = [...String(line).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  if (q.length >= 3) return { request: q[q.length - 3], referer: q[q.length - 2], ua: q[q.length - 1] };
  return { request: "", referer: "", ua: String(line) };
}

function refHost(referer) {
  if (!referer || referer === "-") return null;
  try { return new URL(referer).hostname.toLowerCase(); } catch { return null; }
}

/** Класифицира ред от лога → { bot, ref } (null, ако няма). */
export function classify(line) {
  const { request, referer, ua } = fields(line);
  const uaLow = ua.toLowerCase();
  const bot = BOT_KEYS.find(([, low]) => uaLow.includes(low))?.[0] ?? null;
  let ref = null;
  const host = refHost(referer);
  if (host) ref = REFERRERS.find((r) => host === r || host.endsWith("." + r)) ?? null;
  // ChatGPT добавя utm_source=chatgpt.com, а приложенията често не пращат Referer.
  if (!ref && !bot) {
    const utm = request.match(/[?&]utm_source=([^&\s]+)/i)?.[1]?.toLowerCase();
    if (utm) ref = REFERRERS.find((r) => utm === r) ?? null;
  }
  return { bot, ref };
}

function main(src) {
  const counts = Object.fromEntries(Object.keys(BOTS).map((k) => [k, 0]));
  const refers = Object.fromEntries(REFERRERS.map((k) => [k, 0]));
  let total = 0;
  const stream = src === "-" ? process.stdin : fs.createReadStream(src);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  rl.on("line", (line) => {
    total++;
    const { bot, ref } = classify(line);
    if (bot) counts[bot]++;
    if (ref) refers[ref]++;
  });
  rl.on("close", () => {
    console.log(`\nАнализирани ${total.toLocaleString()} реда\n── AI обхождане ──`);
    const hits = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    if (!hits.length) console.log("  (никакви AI ботове — провери дали robots.txt или CDN не ги блокира)");
    let crawl = 0;
    for (const [b, n] of hits) { crawl += n; console.log(`  ${b.padEnd(20)} ${String(n).padStart(7)}  — ${BOTS[b]}`); }
    const ref = Object.entries(refers).filter(([, n]) => n > 0);
    console.log("\n── Посетители от AI отговорите ──");
    let refTotal = 0;
    if (!ref.length) console.log("  (никакви — още не ни цитират или логът няма Referer)");
    for (const [r, n] of ref) { refTotal += n; console.log(`  ${r.padEnd(20)} ${String(n).padStart(7)}`); }
    if (crawl) console.log(`\ncrawl-to-refer: ${refTotal}/${crawl} = ${(refTotal / crawl * 100).toFixed(2)}% (по-високо = по-добре цитиран).`);
    console.log("Google (AI Overviews/AI Mode) не се вижда тук — Referer е само origin; виж отчета Generative AI performance в Search Console.");
    console.log("Бележка: числата са шумни и неповторими — докладвай ТРЕНД, не абсолют.");
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const src = process.argv[2];
  if (!src) { console.error("Употреба: node ai-bots.mjs <access.log|->"); process.exit(2); }
  main(src);
}
