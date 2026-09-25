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
//
// ТРАЕКТОРИЯ (по избор, до `expect`) — изходът може да е ВЕРЕН, а ПЪТЯТ грешен или скъп.
// Затова грейдваме и реалната стъпкова верига (от `flow-ledger.mjs`) спрямо ground-truth път:
//   trajectory: {
//     flow: "<име на потока в дневника>",   // по избор; иначе се търси поток с име = spec.id
//     path: ["агент-а","агент-б"],          // очакван РЕД (подпоследователност — допуска вмъкнати стъпки)
//     mustVisit: ["агент-в"],               // критични спирки (редът без значение)
//     forbid: ["агент-г"],                  // не бива да минава оттам (чужд домейн / излишен разход)
//     maxSteps: 5                           // ефективност: над това = обиколки
//   }

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

/** Реалната верига покрива ли очаквания РЕД (подпоследователност — вмъкнати стъпки са ок)? */
export function isSubsequence(path, steps) {
  let i = 0;
  for (const s of steps) if (i < path.length && s === path[i]) i++;
  return i === path.length;
}

/**
 * Скорира РЕАЛНАТА стъпкова верига спрямо ground-truth пътя (гл.19 „Evaluation and Monitoring":
 * траекторията е отделна ос от изхода — верен отговор по грешен/скъп път пак е дефект).
 * Връща { ok, passed, total, checks } — checks са в СЪЩАТА форма като evalCheck (repor-ът ги печата).
 */
export function scoreTrajectory(steps, traj) {
  const seq = (steps || []).map(String);
  const checks = [];
  const push = (ok, kind, label, hits, misses) => checks.push({ ok, kind, label, hits, misses, actual: seq });

  if (Array.isArray(traj?.path) && traj.path.length) {
    const ok = isSubsequence(traj.path, seq);
    // Разграничи „липсва спирка" от „спирките са, но в грешен ред" — иначе диагнозата е безполезна.
    const absent = traj.path.filter((a) => !seq.includes(a));
    push(ok, "path", `път в очаквания ред: ${traj.path.join(" → ")}`, ok ? seq : [],
      ok ? [] : absent.length ? absent : [`грешен ред (реален: ${seq.join(" → ") || "празен"})`]);
  }
  if (Array.isArray(traj?.mustVisit) && traj.mustVisit.length) {
    const hits = traj.mustVisit.filter((a) => seq.includes(a));
    const misses = traj.mustVisit.filter((a) => !seq.includes(a));
    push(misses.length === 0, "mustVisit", `критични спирки: ${traj.mustVisit.join(", ")}`, hits, misses);
  }
  if (Array.isArray(traj?.forbid) && traj.forbid.length) {
    const hits = traj.forbid.filter((a) => seq.includes(a));
    push(hits.length === 0, "forbid", `забранени спирки: ${traj.forbid.join(", ")}`, hits, []);
  }
  if (Number.isInteger(traj?.maxSteps)) {
    const ok = seq.length <= traj.maxSteps;
    push(ok, "maxSteps", `ефективност ≤${traj.maxSteps} стъпки`, ok ? [String(seq.length)] : [], ok ? [] : [`реални ${seq.length}`]);
  }
  const passed = checks.filter((c) => c.ok).length;
  return { ok: checks.length > 0 && passed === checks.length, passed, total: checks.length, checks };
}

/**
 * Оценява изход спрямо цял spec. Връща { id, agent, passed, total, score, ok, checks }.
 * `steps` (по избор) = реалната верига от агенти; подава се само когато spec-ът има `trajectory`
 * и има записан поток — иначе траекторните проверки просто не се добавят (не се броят за провал).
 */
export function scoreOutput(output, spec, steps) {
  const checks = (spec.expect || []).map((c) => evalCheck(c, output));
  if (spec.trajectory && Array.isArray(steps)) checks.push(...scoreTrajectory(steps, spec.trajectory).checks);
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
  if (spec.trajectory != null) errs.push(...validateTrajectory(spec.trajectory, knownAgents));
  return errs;
}

/** Структурна валидност на `trajectory` блока (част от --check гейта; хваща и ПРОТИВОРЕЧИВ spec). */
export function validateTrajectory(t, knownAgents) {
  const errs = [];
  if (typeof t !== "object" || Array.isArray(t) || t === null) return ["trajectory трябва да е обект"];
  const LISTS = ["path", "mustVisit", "forbid"];
  if (!LISTS.some((k) => k in t) && !("maxSteps" in t)) errs.push("trajectory: поне едно от path|mustVisit|forbid|maxSteps");
  for (const k of LISTS) {
    if (!(k in t)) continue;
    if (!Array.isArray(t[k]) || !t[k].length) { errs.push(`trajectory.${k}: непразен масив`); continue; }
    for (const a of t[k]) {
      if (typeof a !== "string" || !a.trim()) errs.push(`trajectory.${k}: стъпките са непразни низове (id на агент)`);
      else if (knownAgents && !knownAgents.has(a)) errs.push(`trajectory.${k}: непознат агент „${a}"`);
    }
  }
  if ("maxSteps" in t && (!Number.isInteger(t.maxSteps) || t.maxSteps < 1)) errs.push("trajectory.maxSteps: цяло число ≥1");
  // Противоречив spec = spec, който НИКОГА не може да мине. По-добре да гръмне в CI, не в отчет.
  if (Number.isInteger(t.maxSteps) && Array.isArray(t.path) && t.maxSteps < t.path.length)
    errs.push(`trajectory: maxSteps (${t.maxSteps}) < дължината на path (${t.path.length}) — недостижим spec`);
  const forbidden = new Set(Array.isArray(t.forbid) ? t.forbid : []);
  for (const a of [...(Array.isArray(t.path) ? t.path : []), ...(Array.isArray(t.mustVisit) ? t.mustVisit : [])])
    if (forbidden.has(a)) errs.push(`trajectory: „${a}" е едновременно очакван и забранен`);
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
