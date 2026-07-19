#!/usr/bin/env node
// rubric.mjs — детерминистичен калкулатор на тежест (severity), за да не се „лепи на око".
//
// Прилага „сензор ≠ съдия" (PROCEDURE.md): агентът докладва ФАКТИ (детекция + измерване +
// увереност); тежестта се СМЯТА тук по фиксирана рубрика → два прегледа на един и същ diff
// дават една и съща тежест. Използваем като библиотека (import) или CLI.
//
// CLI:
//   node tools/agents/rubric.mjs --kind security --exploitability 3 --reach 3 --confidence 2
//   node tools/agents/rubric.mjs --kind quality  --impact 2 --effort 1
//   echo '{"kind":"security","exploitability":3,"reach":2,"confidence":3}' | node tools/agents/rubric.mjs --stdin
//
// Скали (1–3): 1=ниско/локално/несигурно, 2=средно, 3=високо/широко/сигурно.

// ── Рубрики (чисти функции; праговете са ФИКСИРАНИ, не „на око") ──
export const RUBRICS = {
  // Сигурност/коректност: тежест = exploitability × reach, модулирано от увереност.
  security(f) {
    const e = clamp(f.exploitability), r = clamp(f.reach), c = clamp(f.confidence ?? 2);
    const raw = e * r;                     // 1..9
    let sev = raw >= 6 ? "блокер" : raw >= 3 ? "бележка" : "дребно";
    // ниска увереност сваля с едно ниво (не докладвай „блокер" на догадка)
    if (c === 1) sev = downgrade(sev);
    return { score: raw, severity: sev, formula: `exploitability(${e})×reach(${r})=${raw}` + (c === 1 ? " ↓ниска увереност" : "") };
  },
  // Качество/поддръжаемост: приоритет = impact × (4−effort) — висок ефект, ниско усилие първо.
  quality(f) {
    const i = clamp(f.impact), ef = clamp(f.effort);
    const score = i * (4 - ef);            // 1..9
    const severity = score >= 6 ? "висок приоритет" : score >= 3 ? "среден" : "нисък";
    return { score, severity, formula: `impact(${i})×(4−effort(${ef}))=${score}` };
  },
  // Достъпност (a11y): тежест по обхват на бариерата × WCAG ниво.
  a11y(f) {
    const scope = clamp(f.reach ?? f.impact), lvl = clamp(f.level ?? 2); // level: 1=AAA,2=AA,3=A(най-базово)
    const score = scope * lvl;
    const severity = score >= 6 ? "блокер" : score >= 3 ? "бележка" : "дребно";
    return { score, severity, formula: `scope(${scope})×wcag(${lvl})=${score}` };
  },
};

function clamp(n) { n = Math.round(Number(n) || 0); return Math.max(1, Math.min(3, n)); }
function downgrade(s) { return s === "блокер" ? "бележка" : s === "бележка" ? "дребно" : s; }

/** Общо API: score(kind, factors) → { kind, score, severity, formula }. */
export function score(kind, factors) {
  const r = RUBRICS[kind];
  if (!r) throw new Error(`непозната рубрика „${kind}" — ${Object.keys(RUBRICS).join("|")}`);
  return { kind, ...r(factors) };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const run = (factors) => {
    const kind = factors.kind || val("--kind");
    try { const out = score(kind, factors); console.log(JSON.stringify(out)); process.exit(0); }
    catch (e) { console.error(e.message); process.exit(1); }
  };
  if (argv.includes("--stdin")) {
    let buf = ""; process.stdin.on("data", (d) => (buf += d)); process.stdin.on("end", () => run(JSON.parse(buf || "{}")));
  } else {
    run({
      kind: val("--kind"),
      exploitability: val("--exploitability"), reach: val("--reach"), confidence: val("--confidence"),
      impact: val("--impact"), effort: val("--effort"), level: val("--level"),
    });
  }
}
