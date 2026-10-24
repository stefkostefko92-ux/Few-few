// artifact-secrets.mjs — тайни в готовия билд на артефакта (build-artifact.mjs → assertPublishable).
// Единственият списък „какво е тайна" (същият като secret-scan/куките) — никога преписан тук.
import { ALL as SECRET_PATTERNS } from "../lib/secret-patterns.mjs";

/**
 * Всички съвпадения с шаблон за тайна (ALL от единния източник) — САМО име и място, никога стойността.
 * `agent` е най-близкият предходен `"id": "…"` (в FALLBACK-а това е агентът, чиято поука носи тайната).
 */
export function findSecretsIn(text, max = 5) {
  const s = String(text ?? "");
  const out = [];
  for (const { name, re } of SECRET_PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m, n = 0;
    while ((m = g.exec(s)) && n++ < max) {
      const before = s.slice(0, m.index);
      const line = before.split("\n").length;
      const ids = [...before.slice(-200000).matchAll(/"id":\s*"([\w-]+)"/g)];
      out.push({ name, line, col: m.index - before.lastIndexOf("\n"), agent: ids.length ? ids[ids.length - 1][1] : null });
      if (m[0].length === 0) g.lastIndex++;
    }
  }
  return out;
}
