#!/usr/bin/env node
// reddit.mjs — Reddit за проучване (умение youtube-reddit). Изходът е плик „недоверено съдържание“.
//   node tools/research/reddit.mjs top r/FiveM [--t week|month|year|all] [--max 25] [--json]
//   node tools/research/reddit.mjs search r/FiveM "mlo interior" [--t year] [--max 25] [--json]
//   node tools/research/reddit.mjs thread <URL на нишка> [--max 100] [--json]
// САМО Reddit Data API с одобрен OAuth app (Responsible Builder Policy; търговска цел — писмено разрешение):
// REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT="server:<app id>:<версия> (by /u/<потребител>)".
// Без тях — отказ. Без публичния .json, бисквитки, вход, прокси или смяна на IP. Имената отпадат; 18+ — пропуснато.
import { envelope, parseRedditTarget, redditGet, normalizeRedditListing, normalizeRedditThread, respectRate } from "./sources.mjs";

const [cmd, target, ...rest] = process.argv.slice(2);
const flag = (n, d) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d; };
const JSON_OUT = rest.includes("--json");
const T = new Set(["hour", "day", "week", "month", "year", "all"]);
const today = new Date().toISOString().slice(0, 10);
const print = (source, url, data, text) => process.stdout.write(envelope({ source, url, fetchedAt: today, body: JSON_OUT ? JSON.stringify(data, null, 2) : text }));
const list = (posts) => posts.map((p, i) => `${i + 1}. [${p.score}↑ · ${p.comments} коментара · ${p.created?.slice(0, 10)}] ${p.title}\n   ${p.url}${p.text ? `\n   ${p.text.replace(/\s+/g, " ").slice(0, 300)}` : ""}`).join("\n");

async function main() {
  const t = parseRedditTarget(target);
  if (!t) throw new Error(`не е подфорум или нишка в Reddit: ${target}`);
  const max = Math.min(Number(flag("max", 25)) || 25, 100);
  const tf = T.has(flag("t")) ? flag("t") : "month";
  if (cmd === "top" && t.kind === "sub") {
    const r = await redditGet(`/r/${t.sub}/top`, { t: tf, limit: max });
    await respectRate(r.rate);
    print(`Reddit r/${t.sub} — топ (${tf})`, `https://www.reddit.com/r/${t.sub}/top/?t=${tf}`, normalizeRedditListing(r.json), list(normalizeRedditListing(r.json)));
  } else if (cmd === "search" && t.kind === "sub") {
    const q = rest[0] && !rest[0].startsWith("--") ? rest[0] : null;
    if (!q) throw new Error("search иска заявка след подфорума");
    const r = await redditGet(`/r/${t.sub}/search`, { q, restrict_sr: 1, sort: "relevance", t: tf, limit: max });
    await respectRate(r.rate);
    print(`Reddit r/${t.sub} — търсене „${q}“ (${tf})`, `https://www.reddit.com/r/${t.sub}/search/?q=${encodeURIComponent(q)}&restrict_sr=1`, normalizeRedditListing(r.json), list(normalizeRedditListing(r.json)));
  } else if (cmd === "thread" && t.kind === "thread") {
    const r = await redditGet(`/comments/${t.id}`, { limit: max, depth: 2, sort: "top" });
    await respectRate(r.rate);
    const th = normalizeRedditThread(r.json, { maxComments: max });
    if (th.nsfw) throw new Error("нишката е 18+ — пропусната");
    if (!th.post) throw new Error("нишката не е намерена или е изтрита");
    print(`Reddit нишка ${t.id} (без автори)`, th.post.url, th,
      `${th.post.title} [${th.post.score}↑]\n${th.post.text}\n\nКоментари:\n${th.comments.map((c) => `${"  ".repeat(c.depth)}- (${c.score}↑) ${c.text.replace(/\s+/g, " ")}`).join("\n")}`);
  } else {
    console.error("употреба: reddit.mjs top r/<sub> | search r/<sub> \"заявка\" | thread <URL> (виж началото на файла)");
    process.exit(2);
  }
}

main().catch((e) => { console.error(`reddit: ${e.message}`); process.exit(1); });
