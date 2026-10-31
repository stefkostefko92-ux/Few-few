// source-provenance.mjs — „проверена“ поука иска източник, който агентът РЕАЛНО е отворил в този рън.
//
// Защо (проучване 31.10.2026, AI-джията; „Building effective agent automations“, claude.dev, 08.10.2026:
// връзките се копират от полетата на източника, никога не се сглобяват на ръка): memory-capture
// проверяваше само ФОРМАТА на източника (`isRealSource`). Агент можеше да напише правдоподобен URL
// или `файл:ред`, който никога не е отварял, и поуката влизаше като проверена.
//
// Правило: всеки URL в `source` трябва да е изтеглен (WebFetch или команда с адреса), а всеки файл —
// прочетен или попаднал в изход на инструмент (Read/Grep/Glob/Bash/Edit, или път в tool_result).
// Без транскрипт проверката не се прави (ръчен запис от оркестратора) — решава `isRealSource`.

const URL_RE = /https?:\/\/[^\s)<>"'`,;]+/gi;
const FILE_RE = /(?<![\w/.-])((?:\.{0,2}\/)?(?:[\w@.-]+\/)*[\w@.-]+\.[a-z][a-z0-9]{0,5})(?::\d+(?:[-,]\d+)*)?(?![\w/])/gi;

const normUrl = (u) =>
  String(u).toLowerCase().replace(/[).,;:]+$/, "").replace(/#.*$/, "").replace(/\?.*$/, "").replace(/\.md$/, "").replace(/\/+$/, "");

/** URL-ите и файловете, които `source` цитира. */
export function refsOf(source) {
  const s = String(source || "");
  // `…/docs/en/{env-vars,hooks}.md` е шаблон на обвивката, не адрес — не се проверява буквално.
  const urls = [...s.matchAll(URL_RE)].map((m) => m[0]).filter((u) => !u.includes("{")).map(normUrl);
  const rest = s.replace(/https?:\/\/\S*\{[^}]*\}\S*/gi, " ").replace(URL_RE, " ");
  // „a.tsx/b.tsx“ и „.env.example/CLAUDE.md“ в прозата са изброяване, не път — сегмент с разширение,
  // последван от друг сегмент, не е директория.
  const files = [...rest.matchAll(FILE_RE)].map((m) => m[1].replace(/^\.\//, ""))
    .filter((f) => !f.split("/").slice(0, -1).some((seg) => /\.[a-z]{1,5}$/i.test(seg) && !/^\.[\w-]+$/.test(seg)))
    .filter((f) => /\//.test(f) || /^\.?[\w-]+\.(m?js|ts|tsx|json|md|ya?ml|sh|py|prisma|ejs|css|html|toml|lock)$/i.test(f));
  return { urls: [...new Set(urls)], files: [...new Set(files)] };
}

/** Какво агентът е отворил: адреси от входа на инструментите и всичко видяно (вход + изход). */
export function seenIn(jsonlText) {
  const fetched = [];
  const seen = [];
  for (const line of String(jsonlText || "").split("\n")) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const content = e?.message?.content;
    // Обратната връзка от куките (Stop hook feedback) идва като потребителски текст — тя също е източник.
    if (typeof content === "string") { if (e.message.role === "user") seen.push(content); continue; }
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b.type === "text" && e.message.role === "user") { seen.push(b.text || ""); continue; }
      if (b.type === "tool_use") {
        const raw = JSON.stringify(b.input ?? {});
        seen.push(raw);
        if (/^(WebFetch|Bash|Monitor)$/.test(b.name) || /^mcp__/.test(b.name)) fetched.push(raw);
      } else if (b.type === "tool_result") {
        seen.push(typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? ""));
      }
    }
  }
  return { fetched: fetched.join("\n").toLowerCase(), seen: seen.join("\n") };
}

/** Цитатите, които агентът не е отворил. Празно = произходът е доказан. */
export function unseenRefs(source, seenView) {
  const { urls, files } = refsOf(source);
  const missing = [];
  const fetched = seenView.fetched;
  for (const u of urls) {
    const bare = u.replace(/^https?:\/\//, "");
    if (fetched.includes(bare) || fetched.replace(/\.md\b/g, "").includes(bare)) continue;
    // Адрес, сглобен в цикъл на обвивката (`for p in routines …; do curl …/$p.md`): хостът и последният
    // сегмент стоят поотделно в командата. Адрес, видян само в резултат от търсене, НЕ е изтеглен.
    const host = bare.split("/")[0];
    const last = bare.split("/").filter(Boolean).pop();
    if (last && last !== host && fetched.includes(host) && fetched.includes(last)) continue;
    missing.push(u);
  }
  for (const f of files) {
    // Четене след `cd` дава относителен път (`prisma/schema.prisma` за `CSPos/prisma/schema.prisma`):
    // последните два сегмента стигат. Грешен цитат (`bot/src/x.js` за `bot/src/events/x.js`) не минава.
    const tail = f.split("/").slice(-2).join("/");
    if (!seenView.seen.includes(f) && !seenView.seen.includes(tail)) missing.push(f);
  }
  return missing;
}
