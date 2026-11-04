// is-main.mjs — „пуснат ли е този модул като CLI, или е импортиран?“ — едно място за целия флот.
//
// Защо (02.11.2026, Кодаджията при ревюто на stream-lint): 74 наши инструмента сравняваха
// `import.meta.url === \`file://${process.argv[1]}\``. Това е fail-open: при път с интервал или кирилица
// (URL-кодиран), при Windows път (`file:///C:/…` срещу `C:\…`) и при пускане през symlink (import.meta.url е
// realpath) сравнението е невярно → CLI-ят тихо не прави нищо и връща exit 0 — „чисто“ на гейт, който не е тичал.
// `pathToFileURL` оправя кодирането и Windows, но не и symlink-а; realpath от двете страни оправя всичко.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** true, когато модулът с този `import.meta.url` е входната точка на процеса. */
export function isMain(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try { return realpathSync(argv1) === realpathSync(fileURLToPath(metaUrl)); } catch { return false; }
}
