// tools/agents/oversee-lib.mjs — чистите (без странични ефекти) помощници на надзора.
//
// Изнесени от oversee.mjs, за да са UNIT-тестваеми директно (Изпитателят) и за да падне
// когнитивната сложност на главния скрипт (Качествения — Extract Function). Няма I/O тук:
// всичко е чисти функции над подадени низове/стойности. Тества се в oversee.test.mjs.

export const STALE_DAYS = 45;
export const MERGE_THRESHOLD = 0.82;
export const TIME_SENSITIVE = /верси|latest|текущ|\bv?\d+\.\d+|\b20\d\d\b|API \d|stable|release/i;

// Нормализира текст на поука за сравнение: маха **, кавички, trailing `_(…)_`, свива интервали.
export const norm = (s) =>
  String(s).toLowerCase().replace(/\*\*/g, "").replace(/[`'"„“”]/g, "").replace(/_\(.*?\)_/g, "")
    .replace(/\s+/g, " ").replace(/[.;,]+$/, "").trim();

export const toks = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 3));

export const jaccard = (a, b) => {
  const A = toks(a), B = toks(b);
  if (!A.size || !B.size) return 0;
  let i = 0; for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
};

export const lessonDate = (b) => { const m = String(b).match(/\*\*(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; };

// Дни между дата на поука и „днес" (подава се отвън → детерминистично в тестове, без Date.now).
export const daysSince = (d, today) =>
  (Date.parse(today + "T00:00:00Z") - Date.parse(d + "T00:00:00Z")) / 86400000;

// Има ли trailing `_(scope; verified; source)_` валиден източник? Източникът е ПОСЛЕДНИЯТ
// „;"-сегмент; броим всичко непразно и смислено (URL, file:line, член, книга/автор). Липсва
// само ако няма tail, последният сегмент е празен, или е просто „verified".
export const tailHasSource = (tail) => {
  if (!tail) return false;
  const parts = String(tail).split(";").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return false; // очакваме поне scope + източник
  const src = parts[parts.length - 1].replace(/^["'„“”]+|["'„“”]+$/g, "").trim();
  return src.length > 3 && !/^(un)?verified$/i.test(src);
};

// Приема ЦЕЛИЯ текст на поуката (блок). Освен каноничния trailing `_(…; source)_`, признава и
// легитимните формати, които агентите ползват: inline `(Източник: …)` / `(Source: …)`, гол URL,
// собствено-кодово потекло (`file:line`, `tools/…`, `src/…`, `.mjs`/`.ts`/…). Всичките са реален
// източник. Само поука БЕЗ нито едно от тях е „без източник".
export const hasSource = (block) => {
  if (!block) return false;
  const m = String(block).match(/_\((.*?)\)_\s*$/);
  if (tailHasSource(m && m[1])) return true;
  if (/\((?:Източник|Source)\s*:\s*[^)]{4,}\)/i.test(block)) return true; // inline цитат
  if (/https?:\/\/\S{4,}/.test(block)) return true;                       // гол URL
  if (/\b[\w./-]+\.(?:mjs|ts|tsx|js|jsx|json|md|prisma|ejs|html)\b/i.test(block)) return true; // репо файл
  if (/\b(?:tools|src|prisma|app|deploy)\/[\w./-]+/.test(block)) return true; // репо път
  if (/\b[\w./-]+:\d+\b/.test(block)) return true;                        // file:line
  return false;
};

// Всяка поука е БЛОК: реда „- …" + всички следващи continuation редове (заглъбен текст, не нов
// bullet, не заглавие, не празен ред). Източникът често е на continuation ред — затова четем целия
// блок, не само първия ред (иначе многоредова поука се брои фалшиво „без източник").
export function sectionBullets(md, heading) {
  const lines = String(md).split("\n");
  const start = lines.findIndex((l) => new RegExp(`^##\\s*${heading}`).test(l));
  if (start === -1) return [];
  const out = [];
  let cur = null;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^##\s/.test(l)) break;
    if (l.trim().startsWith("- ")) { if (cur !== null) out.push(cur); cur = l.trim(); }
    else if (cur !== null) {
      if (l.trim() === "") { out.push(cur); cur = null; }
      else cur += " " + l.trim();
    }
  }
  if (cur !== null) out.push(cur);
  return out;
}

// Изважда балансирания `{…}` обект, започващ на/след маркера `marker` (напр. „const FALLBACK = {").
// Уважава низове и escape-и, за да не спре на `}` вътре в стойност. Връща среза (вкл. скобите)
// или null, ако маркерът/затварящата скоба липсват. (Изнесено от inline парсера — Качествения.)
export function extractBalancedObject(str, marker) {
  const s = String(str).indexOf(marker);
  if (s === -1) return null;
  let i = s + marker.length - 1, depth = 0, inString = false, escaped = false;
  if (str[i] !== "{") { const b = str.indexOf("{", i); if (b === -1) return null; i = b; }
  const start = i;
  for (; i < str.length; i++) {
    const c = str[i];
    if (inString) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') inString = false; }
    else { if (c === '"') inString = true; else if (c === "{") depth++; else if (c === "}") { depth--; if (depth === 0) return str.slice(start, i + 1); } }
  }
  return null;
}
