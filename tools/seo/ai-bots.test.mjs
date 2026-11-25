// ai-bots.test.mjs — инструментът трябва да брои точно ботовете и рефералите, които доставчиците
// документират (сверено 22.11.2026, tools/seo/research-2026-11.md, раздел 5).
//
// Дефектите, които тестът затваря: `Google-Extended` се броеше като user-agent (той е само токен в
// robots.txt); истинският UA на Bing е `bingbot` с малки букви и не се хващаше; Copilot идва от
// `copilot.microsoft.com`, не от `bing.com/chat`; реферал се търсеше в целия ред (и в пътя на заявката),
// не в полето Referer; липсваха Applebot, OAI-AdsBot, meta-externalagent, DuckAssistBot, MistralAI-User.
// Браузърът Claude-Agent не е тук: как се представя, Anthropic описва в отделна статия, която не сме сверили.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOTS, REFERRERS, classify } from "./ai-bots.mjs";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "ai-bots.mjs");

// Комбиниран формат на nginx: … "заявка" статус байтове "referer" "user-agent"
const line = (ua, referer = "-", path = "/") =>
  `203.0.113.7 - - [22/Nov/2026:10:00:00 +0100] "GET ${path} HTTP/1.1" 200 512 "${referer}" "${ua}"`;

test("Google-Extended не е user-agent — само токен в robots.txt", () => {
  assert.equal("Google-Extended" in BOTS, false);
  assert.equal(classify(line("Mozilla/5.0 Google-Extended")).bot, null);
});

test("bingbot се разпознава с истинския си UA (малки букви)", () => {
  const ua = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36";
  assert.equal(classify(line(ua)).bot, "bingbot");
});

test("новите ботове от официалните страници се разпознават", () => {
  const cases = {
    Applebot: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
    "OAI-AdsBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-AdsBot/1.0; +https://openai.com/adsbot)",
    "meta-externalagent": "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
    DuckAssistBot: "DuckAssistBot/1.2; (+http://duckduckgo.com/duckassistbot.html)",
    "MistralAI-User": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; MistralAI-User/1.0; +https://docs.mistral.ai/robots)",
  };
  for (const [bot, ua] of Object.entries(cases)) assert.equal(classify(line(ua)).bot, bot, bot);
});

test("сродните ботове не се бъркат (търсещ ≠ обучаващ)", () => {
  assert.equal(classify(line("Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +https://www.anthropic.com)")).bot, "Claude-SearchBot");
  assert.equal(classify(line("Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)")).bot, "ClaudeBot");
  assert.equal(classify(line("Mozilla/5.0 (compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot)")).bot, "OAI-SearchBot");
  assert.equal(classify(line("Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)")).bot, "GPTBot");
  assert.equal(classify(line("Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)")).bot, "Perplexity-User");
});

test("Copilot е copilot.microsoft.com, а bing.com/chat вече не е реферал", () => {
  assert.ok(REFERRERS.includes("copilot.microsoft.com"));
  assert.equal(REFERRERS.includes("bing.com/chat"), false);
  assert.equal(classify(line("Mozilla/5.0 Firefox/140.0", "https://copilot.microsoft.com/")).ref, "copilot.microsoft.com");
});

test("рефералът се чете от полето Referer, не от пътя или от UA", () => {
  const human = "Mozilla/5.0 (Windows NT 10.0) Firefox/140.0";
  assert.equal(classify(line(human, "https://chatgpt.com/")).ref, "chatgpt.com");
  assert.equal(classify(line(human, "-", "/search?q=claude.ai")).ref, null);
  assert.equal(classify(line("Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)")).ref, null);
});

test("ChatGPT без Referer се познава по utm_source=chatgpt.com", () => {
  assert.equal(classify(line("Mozilla/5.0 Safari/605.1.15", "-", "/blog/post?utm_source=chatgpt.com")).ref, "chatgpt.com");
});

test("CLI брои по stdin и пише crawl-to-refer", () => {
  const input = [
    line("Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)"),
    line("Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"),
    line("Mozilla/5.0 Firefox/140.0", "https://perplexity.ai/"),
  ].join("\n");
  const r = spawnSync(process.execPath, [TOOL, "-"], { input, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /GPTBot\s+1/);
  assert.match(r.stdout, /bingbot\s+1/);
  assert.match(r.stdout, /perplexity\.ai\s+1/);
  assert.match(r.stdout, /crawl-to-refer: 1\/2/);
});
