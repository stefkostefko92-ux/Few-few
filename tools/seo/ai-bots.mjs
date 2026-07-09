#!/usr/bin/env node
// ai-bots.mjs — измерва AI-обхождане от server access лог (SEO агент v2.0).
// GA4 е сляп за ботове — логовете са истината. Брои посещения по известните AI
// crawler-и и смята crawl-to-refer (колко обхождат vs колко реферират обратно).
//
// Употреба:
//   node tools/seo/ai-bots.mjs /var/log/nginx/access.log
//   zcat access.log.*.gz | node tools/seo/ai-bots.mjs -      (чете от stdin)
import fs from "node:fs";
import readline from "node:readline";

const src = process.argv[2];
if (!src) { console.error("Употреба: node ai-bots.mjs <access.log|->"); process.exit(2); }

// Известни AI агенти (2026): обучаващи vs извличащи/търсещи + рефер хостове.
const BOTS = {
  "GPTBot": "обучаващ (OpenAI)", "OAI-SearchBot": "търсещ (OpenAI)", "ChatGPT-User": "извличащ (ChatGPT)",
  "ClaudeBot": "обучаващ (Anthropic)", "Claude-SearchBot": "търсещ (Anthropic)", "Claude-User": "извличащ (Claude)",
  "PerplexityBot": "обхождащ (Perplexity)", "Perplexity-User": "извличащ (Perplexity)",
  "Google-Extended": "обучаващ (Google)", "Googlebot": "класически (Google)", "Bingbot": "класически (Bing)",
  "CCBot": "обучаващ (Common Crawl)", "Bytespider": "обхождащ (ByteDance)", "Amazonbot": "обхождащ (Amazon)",
};
const REFERRERS = ["chatgpt.com", "perplexity.ai", "claude.ai", "gemini.google", "bing.com/chat"];

const counts = Object.fromEntries(Object.keys(BOTS).map((k) => [k, 0]));
const refers = Object.fromEntries(REFERRERS.map((k) => [k, 0]));
let total = 0;

const stream = src === "-" ? process.stdin : fs.createReadStream(src);
const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

rl.on("line", (line) => {
  total++;
  for (const b of Object.keys(BOTS)) if (line.includes(b)) { counts[b]++; break; }
  for (const r of REFERRERS) if (line.includes(r)) { refers[r]++; break; }
});
rl.on("close", () => {
  console.log(`\nАнализирани ${total.toLocaleString()} реда\n── AI обхождане ──`);
  const hits = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!hits.length) console.log("  (никакви AI ботове — провери дали robots.txt не ги блокира)");
  let crawl = 0;
  for (const [b, n] of hits) { crawl += n; console.log(`  ${b.padEnd(18)} ${String(n).padStart(7)}  — ${BOTS[b]}`); }
  const ref = Object.entries(refers).filter(([, n]) => n > 0);
  console.log("\n── Реферали от AI отговор-машини ──");
  let refTotal = 0;
  if (!ref.length) console.log("  (никакви — още не те цитират, или логът няма Referer)");
  for (const [r, n] of ref) { refTotal += n; console.log(`  ${r.padEnd(18)} ${String(n).padStart(7)}`); }
  if (crawl) console.log(`\ncrawl-to-refer: ${refTotal}/${crawl} = ${(refTotal / crawl * 100).toFixed(2)}% (по-високо = по-добре цитиран).`);
  console.log("Бележка: числата са шумни и неповторими — докладвай ТРЕНД, не абсолют.");
});
