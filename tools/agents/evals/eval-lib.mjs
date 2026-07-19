// eval-lib.mjs — чист, тестваем скоринг на агентен изход спрямо „златен случай".
// Без странични ефекти (без fs/мрежа) → покрит от eval.test.mjs. CLI обвивката е eval.mjs.
//
// Философия (виж _evals/reliability.md): „грейдвай това, което агентът ПРОИЗВЕЖДА, не пътя".
// Детерминистичен слой ПЪРВО — регекс/substring над изхода, повторим и обективен. LLM-rubric
// слоят (прозаично качество) остава в promptfooconfig.yaml (нужен cross-family съдия).
//
// Спецификация на „златен случай" (specs/*.json):
//   { id, agent, task, expect: [ <проверка> ... ] }
// Проверка (една от):
//   { any:  [str|/re/], label }   — поне ЕДИН маркер трябва да присъства (очакван белег)
//   { all:  [str|/re/], label }   — ВСИЧКИ маркери трябва да присъстват
//   { none: [str|/re/], label }   — НИТО ЕДИН не бива да присъства (капан / последвана инжекция)
// Маркер: обикновен низ (case-insensitive substring) или "/pattern/flags" (регекс).

/** Компилира маркер (низ или "/re/flags") във функция match(hay)->bool. */
export function toMatcher(marker) {
  if (marker instanceof RegExp) return (hay) => marker.test(hay);
  const s = String(marker);
  const re = s.match(/^\/(.*)\/([a-z]*)$/i);
  if (re) {
    const rx = new RegExp(re[1], re[2].includes("i") ? re[2] : re[2] + "i");
    return (hay) => rx.test(hay);
  }
  const needle = s.toLowerCase();
  return (hay) => hay.toLowerCase().includes(needle);
}

/** Оценява една проверка спрямо изхода. Връща { ok, kind, label, hits, misses }. */
export function evalCheck(check, output) {
  const hay = String(output || "");
  const kind = check.any ? "any" : check.all ? "all" : check.none ? "none" : "unknown";
  const markers = check[kind] || [];
  const hits = [], misses = [];
  for (const m of markers) (toMatcher(m)(hay) ? hits : misses).push(String(m));
  let ok;
  if (kind === "any") ok = hits.length > 0;
  else if (kind === "all") ok = misses.length === 0;
  else if (kind === "none") ok = hits.length === 0;
  else ok = false;
  return { ok, kind, label: check.label || kind, hits, misses };
}

/** Оценява изход спрямо цял spec. Връща { id, agent, passed, total, score, ok, checks }. */
export function scoreOutput(output, spec) {
  const checks = (spec.expect || []).map((c) => evalCheck(c, output));
  const passed = checks.filter((c) => c.ok).length;
  const total = checks.length;
  return {
    id: spec.id,
    agent: spec.agent,
    passed,
    total,
    score: total ? passed / total : 0,
    ok: total > 0 && passed === total,
    checks,
  };
}

/** Структурна валидност на spec (за --check гейта — без да пуска агента). */
export function validateSpec(spec, knownAgents) {
  const errs = [];
  if (!spec || typeof spec !== "object") return ["spec не е обект"];
  if (!spec.id) errs.push("липсва id");
  if (!spec.agent) errs.push("липсва agent");
  else if (knownAgents && !knownAgents.has(spec.agent)) errs.push(`непознат агент „${spec.agent}"`);
  if (!spec.task) errs.push("липсва task (входът за агента)");
  if (!Array.isArray(spec.expect) || spec.expect.length === 0) errs.push("expect трябва да е непразен масив");
  else spec.expect.forEach((c, i) => {
    const kinds = ["any", "all", "none"].filter((k) => k in c);
    if (kinds.length !== 1) errs.push(`expect[${i}]: точно едно от any|all|none (има ${kinds.length})`);
    else if (!Array.isArray(c[kinds[0]]) || !c[kinds[0]].length) errs.push(`expect[${i}].${kinds[0]}: непразен масив`);
  });
  return errs;
}

/** Обобщава множество резултати. */
export function summarize(results) {
  const total = results.length;
  const fullPass = results.filter((r) => r.ok).length;
  const checkTotal = results.reduce((a, r) => a + r.total, 0);
  const checkPass = results.reduce((a, r) => a + r.passed, 0);
  return { specs: total, fullPass, checkPass, checkTotal, rate: total ? fullPass / total : 0 };
}
