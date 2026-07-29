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

// Jaccard над ВЕЧЕ токенизирани множества — за горещи цикли, където токенизацията се преизползва.
// `jaccard` отгоре токенизира ДВАТА низа при всяко извикване; при попарно сравнение на хиляди
// поуки това е доминиращата цена (3559 поуки ⇒ ~6.3M токенизации).
export const jaccardSets = (A, B) => {
  if (!A.size || !B.size) return 0;
  // Итерирай по по-малкото множество — по-малко проверки, същият резултат.
  const [S, L] = A.size <= B.size ? [A, B] : [B, A];
  let i = 0; for (const x of S) if (L.has(x)) i++;
  return i / (A.size + B.size - i);
};

// Гриди single-pass клъстеризация по Jaccard спрямо ПРЕДСТАВИТЕЛЯ на клъстера — същата семантика
// като наивния двоен цикъл (първият съвпаднал по ред на създаване печели), но без O(n²) сравнения.
//
// Два филтъра отсяват невъзможните двойки, ПРЕДИ да смятаме Jaccard (точен резултат, не евристика):
//   • граница по припокриване — от J = i/(|A|+|B|-i) ≥ t следва i ≥ t·(|A|+|B|)/(1+t) ≥ t·|A|,
//     значи двойка с по-малко от ⌈t·|A|⌉ общи токена НЕ МОЖЕ да мине прага;
//   • префиксен филтър — при нужни ≥ i_min общи токена, поне един от (|A| − i_min + 1) НАЙ-РЕДКИТЕ
//     токена на A задължително присъства в B (принцип на чекмеджетата). Индексираме само тях.
// Редкостта е по глобална честота, изчислена веднъж → детерминистично подреждане.
export function clusterByJaccard(texts, threshold = MERGE_THRESHOLD) {
  const sets = texts.map((t) => toks(t));
  const df = new Map(); // честота на токен през всички поуки — определя „най-редките"
  for (const S of sets) for (const w of S) df.set(w, (df.get(w) || 0) + 1);
  const prefixOf = (S) => {
    const sorted = [...S].sort((a, b) => (df.get(a) - df.get(b)) || (a < b ? -1 : 1));
    const iMin = Math.ceil(threshold * S.size);
    return sorted.slice(0, Math.max(1, S.size - iMin + 1));
  };

  const clusters = [];               // { rep, repSet, members: number[] }
  const index = new Map();           // токен → индекси на клъстери, чийто префикс го съдържа
  const counts = new Map();          // преизползван брояч (без ново заделяне на всяка итерация)

  for (let i = 0; i < texts.length; i++) {
    const S = sets[i];
    let hit = -1;
    if (S.size) {
      counts.clear();
      for (const w of prefixOf(S)) {
        const posting = index.get(w);
        if (!posting) continue;
        for (const c of posting) counts.set(c, (counts.get(c) || 0) + 1);
      }
      // Кандидатите се проверяват ТОЧНО, и печели най-ранният по ред на създаване — както наивният цикъл.
      for (const [c] of counts) {
        if (hit >= 0 && c > hit) continue;
        if (jaccardSets(clusters[c].repSet, S) >= threshold) hit = hit < 0 ? c : Math.min(hit, c);
      }
    }
    if (hit >= 0) { clusters[hit].members.push(i); continue; }
    const idx = clusters.length;
    clusters.push({ rep: texts[i], repSet: S, members: [i] });
    for (const w of prefixOf(S)) {
      if (!index.has(w)) index.set(w, []);
      index.get(w).push(idx);
    }
  }
  return clusters.map((c) => ({ rep: c.rep, members: c.members }));
}

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
/**
 * КАНОНИЧНАТА дефиниция за „това е реален източник" — един низ, един отговор.
 *
 * Дълго време съществуваха ДВЕ: `hasSource` тук (одиторът) и `sourceIsReal` в
 * `.claude/hooks/memory-capture.mjs` (куката, която решава дали поука става ФАКТ). Куката беше
 * по-строгата и за 74 реални поуки двете се разминаваха → напълно валидно знание заседна в
 * Карантина завинаги. Затова предикатът живее ТУК веднъж и куката го внася.
 *
 * ВНИМАНИЕ за кирилицата: `\b` в JS е ASCII-базирана и НЕ образува граница пред „ч" от „чл.".
 * Затова правната цитация се лови без `\b` (проверено — вече ме подведе веднъж в handoff.mjs).
 */
export const isRealSource = (src) => {
  const s = String(src ?? "").trim();
  if (!s || /^(n\/?a|няма|липсва|—|--?)$/i.test(s)) return false;
  return (
    /https?:\/\/[^/\s]*\.[^/\s.][^/\s]*/i.test(s) ||                       // пълен URL с хост-с-точка
    /(?:^|[\s(„"'])[a-z0-9-]+(?:\.[a-z0-9-]+)+\/[\w./-]*/i.test(s) ||      // хост+път БЕЗ схема (tita.bg/laws/427)
    /[\w./-]+\.[a-z]{1,5}:\d+/i.test(s) ||                                 // file.ext:line
    /[\w-]+\/[\w./-]*\.(?:mjs|js|ts|tsx|jsx|json|md|prisma|ejs|html|css|lua|sh|ya?ml)/i.test(s) || // репо-път
    /(?:чл|ал|Прил|Регл|Дир|Наредба|ЗДДС|ЗЗП|ЗСч|ЗВЕРБ|GDPR|WCAG|§)\.?\s*№?\s*\d/i.test(s) ||     // правна цитация
    /(?:eval|test|tool|node|grep|stripe-lint|motion-a11y|check-dups|check-integrity|printability|store-readiness|scan\.sh|busted|luacheck|trivy|axe|lighthouse|EUR-Lex|registry\.npmjs|github\.com|developer\.|caniuse)/i.test(s)
  );
};

export const hasSource = (block) => {
  if (!block) return false;
  const m = String(block).match(/_\((.*?)\)_\s*$/);
  if (tailHasSource(m && m[1])) return true;
  if (/\((?:Източник|Source)\s*:\s*[^)]{4,}\)/i.test(block)) return true; // inline цитат
  if (isRealSource(block)) return true; // каноничният предикат (един източник на истина)
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
