#!/usr/bin/env node
// yt.mjs — YouTube за проучване (умение youtube-reddit). Изходът е плик „недоверено съдържание“.
//   node tools/research/yt.mjs search "fivem mlo tutorial" [--max 10] [--lang bg] [--order relevance|viewCount|date] [--json]
//   node tools/research/yt.mjs video <id|URL> [--json]
//   node tools/research/yt.mjs comments <id|URL> [--max 50] [--json]
// Нужно: YOUTUBE_API_KEY в env. Квота: 10 000 ед./ден; search = 100, останалите = 1.
// Транскрипт на чуждо видео НЯМА (ToS на YouTube) — командата transcript казва легалните пътища.
// Ползвайки го, приемаш Условията на YouTube (https://www.youtube.com/t/terms);
// Google Privacy Policy: https://policies.google.com/privacy.
import { envelope, parseYouTubeId, youtubeApi, normalizeYtVideo, normalizeYtComments, TRANSCRIPT_REFUSAL } from "./sources.mjs";

const [cmd, arg, ...rest] = process.argv.slice(2);
const flag = (n, d) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d; };
const JSON_OUT = rest.includes("--json");
const today = new Date().toISOString().slice(0, 10);
const print = (source, url, data, text) => process.stdout.write(envelope({ source, url, fetchedAt: today, body: JSON_OUT ? JSON.stringify(data, null, 2) : text }));
const idOf = (s) => { const id = parseYouTubeId(s); if (!id) throw new Error(`не е видео в YouTube: ${s}`); return id; };

async function main() {
  if (cmd === "search") {
    if (!arg) throw new Error("search иска заявка");
    const max = Math.min(Number(flag("max", 10)) || 10, 25);
    // Подредбата е на самото API (order) — без наши класации или суми през канали (Developer Policies III.E.2.a, III.E.4.h).
    const order = ["relevance", "viewCount", "date", "rating"].includes(flag("order")) ? flag("order") : "relevance";
    const s = await youtubeApi("search", { part: "snippet", type: "video", q: arg, maxResults: max, order, relevanceLanguage: flag("lang"), safeSearch: "strict" });
    const ids = (s.items || []).map((i) => i.id?.videoId).filter(Boolean);
    const v = ids.length ? await youtubeApi("videos", { part: "snippet,statistics,contentDetails", id: ids.join(",") }) : { items: [] };
    const rows = (v.items || []).map(normalizeYtVideo);
    print(`YouTube търсене „${arg}“`, `https://www.youtube.com/results?search_query=${encodeURIComponent(arg)}`, rows,
      rows.map((r, i) => `${i + 1}. ${r.title} — ${r.channel} · ${r.views ?? "?"} гледания · ${r.publishedAt?.slice(0, 10)} · ${r.duration}\n   ${r.url}`).join("\n"));
  } else if (cmd === "video") {
    const id = idOf(arg);
    const v = await youtubeApi("videos", { part: "snippet,statistics,contentDetails", id });
    const r = v.items?.[0] ? normalizeYtVideo(v.items[0]) : null;
    if (!r) throw new Error("видеото не е намерено или е частно");
    print(`YouTube видео ${id}`, r.url, r, `${r.title}\n${r.channel} · ${r.publishedAt} · ${r.duration} · ${r.views} гледания · ${r.likes} харесвания · ${r.comments} коментара\nТагове: ${r.tags.join(", ")}\n\n${r.description}`);
  } else if (cmd === "comments") {
    const id = idOf(arg);
    const max = Math.min(Number(flag("max", 50)) || 50, 100);
    const c = normalizeYtComments(await youtubeApi("commentThreads", { part: "snippet", videoId: id, maxResults: max, order: "relevance", textFormat: "plainText" }));
    print(`YouTube коментари ${id} (без автори)`, `https://www.youtube.com/watch?v=${id}`, c, c.map((x) => `- (${x.likes}👍, ${x.replies} отг.) ${x.text}`).join("\n"));
  } else if (cmd === "transcript") {
    throw new Error(TRANSCRIPT_REFUSAL);
  } else {
    console.error("употреба: yt.mjs search|video|comments … (виж началото на файла) · Условия на YouTube: https://www.youtube.com/t/terms · Google Privacy Policy: https://policies.google.com/privacy");
    process.exit(2);
  }
}

main().catch((e) => { console.error(`yt: ${e.message}`); process.exit(1); });
