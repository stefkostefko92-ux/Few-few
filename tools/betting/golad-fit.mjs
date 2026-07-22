#!/usr/bin/env node
// golad-fit.mjs — напасва Диксън-Коулс модел от ИСТОРИЯ на резултатите (MLE, time-decay тегло).
// Скокът от „ръчно подадена λ" към истински модел: изкарва per-team атака/защита рейтинги +
// домакинско предимство + ρ, после предсказва λ за всеки бъдещ мач. Zero-dep числена оптимизация.
//
// Метод: тегло по скорошност w=exp(−ξ·дни). Poisson-регресионни градиенти за att/def/home
// (∂LL/∂logAtt_h = Σ w·(x−λ) и т.н. — стандартни), с ренормализация на att/def (геом. средна=1)
// за идентифицируемост; ρ се оценява по мрежа върху τ-частта (влиянието му върху att/def е нищожно —
// както отбелязват Dixon & Coles 1997). Итерира att/def/home ↔ ρ до сходимост.

const tauLog = (x, y, lh, la, rho) => {
  let t = 1;
  if (x === 0 && y === 0) t = 1 - lh * la * rho;
  else if (x === 0 && y === 1) t = 1 + lh * rho;
  else if (x === 1 && y === 0) t = 1 + la * rho;
  else if (x === 1 && y === 1) t = 1 - rho;
  return Math.log(Math.max(1e-9, t));
};

// matches: [{home, away, hg, ag, date:"YYYY-MM-DD"}]. asOf по подразбиране = най-новата дата.
export function fitDixonColes(matches, { halfLifeDays = 180, iters = 500, lr = 0.3, asOf = null } = {}) {
  if (!matches.length) throw new Error("няма мачове за напасване");
  const dayMs = 86400000;
  const ref = asOf ? new Date(asOf + "T00:00:00Z").getTime() : Math.max(...matches.map((m) => new Date(m.date + "T00:00:00Z").getTime()));
  const xi = Math.log(2) / halfLifeDays;
  const M = matches.map((m) => ({
    ...m,
    w: Math.exp(-xi * Math.max(0, (ref - new Date(m.date + "T00:00:00Z").getTime()) / dayMs)),
  }));

  const teams = [...new Set(matches.flatMap((m) => [m.home, m.away]))].sort();
  const idx = Object.fromEntries(teams.map((t, i) => [t, i]));
  const n = teams.length;
  const a = new Array(n).fill(0); // log attack
  const d = new Array(n).fill(0); // log defense
  let g = Math.log(1.35); // log home advantage
  let rho = -0.1;
  const W = M.reduce((s, m) => s + m.w, 0) || 1; // нормализирай градиента (СРЕДЕН) → стабилни стъпки
  const clamp = (v) => Math.max(-4, Math.min(4, v)); // пази exp() от преливане

  for (let it = 0; it < iters; it++) {
    const ga = new Array(n).fill(0), gd = new Array(n).fill(0);
    let gg = 0;
    for (const m of M) {
      const h = idx[m.home], aw = idx[m.away];
      const lh = Math.exp(clamp(a[h] + d[aw] + g));
      const la = Math.exp(clamp(a[aw] + d[h]));
      const eh = m.w * (m.hg - lh); // ∂LL/∂(loglin) = Σ w(x−λ)
      const ea = m.w * (m.ag - la);
      ga[h] += eh; gd[aw] += eh; gg += eh;
      ga[aw] += ea; gd[h] += ea;
    }
    for (let i = 0; i < n; i++) { a[i] = clamp(a[i] + lr * ga[i] / W); d[i] = clamp(d[i] + lr * gd[i] / W); }
    g = clamp(g + lr * gg / W);
    // идентифицируемост: средна на log-att =0 (геом. средна att=1) → изнеси в home; същото за def.
    const ma = a.reduce((s, v) => s + v, 0) / n; for (let i = 0; i < n; i++) a[i] -= ma; g += ma;
    const md = d.reduce((s, v) => s + v, 0) / n; for (let i = 0; i < n; i++) d[i] -= md; g += md;
  }

  // Оцени ρ по мрежа върху τ-частта (att/def фиксирани).
  let best = -Infinity;
  for (let r = -0.2; r <= 0.001; r += 0.005) {
    let ll = 0;
    for (const m of M) {
      const h = idx[m.home], aw = idx[m.away];
      const lh = Math.exp(a[h] + d[aw] + g), la = Math.exp(a[aw] + d[h]);
      ll += m.w * tauLog(m.hg, m.ag, lh, la, r);
    }
    if (ll > best) { best = ll; rho = r; }
  }

  const attack = {}, defense = {};
  teams.forEach((t, i) => { attack[t] = Math.exp(a[i]); defense[t] = Math.exp(d[i]); });
  return { teams, attack, defense, homeAdv: Math.exp(g), rho: +rho.toFixed(3) };
}

// Предскажи λ за бъдещ мач от напаснатите рейтинги.
export function predictLambdas(fit, home, away) {
  if (fit.attack[home] == null || fit.attack[away] == null) return null; // непознат отбор → честно null
  return {
    lambdaHome: fit.attack[home] * fit.defense[away] * fit.homeAdv,
    lambdaAway: fit.attack[away] * fit.defense[home],
  };
}

// CLI: напасни от файл с резултати и предскажи мач.
//   node tools/betting/golad-fit.mjs results.json "Home Team" "Away Team"
// results.json = [{home,away,hg,ag,date}] (реални резултати, които ТИ вадиш и цитираш).
if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, home, away] = process.argv.slice(2);
  if (!file) { console.error('Употреба: node golad-fit.mjs results.json "Домакин" "Гост"'); process.exit(1); }
  const { readFileSync } = await import("node:fs");
  const { scoreMatrix, markets, topScores } = await import("./golad-model.mjs");
  let matches; try { matches = JSON.parse(readFileSync(file, "utf8")); } catch { console.error("не мога да прочета " + file); process.exit(1); }
  const fit = fitDixonColes(matches);
  console.log(`\nНапаснат DC модел: ${fit.teams.length} отбора · домакинско предимство ${fit.homeAdv.toFixed(3)} · ρ ${fit.rho}`);
  if (home && away) {
    const lam = predictLambdas(fit, home, away);
    if (!lam) { console.error(`Непознат отбор (${home} или ${away}) — не гадая. Отбори: ${fit.teams.join(", ")}`); process.exit(1); }
    const mk = markets(scoreMatrix(lam.lambdaHome, lam.lambdaAway, { rho: fit.rho }));
    const pct = (x) => (x * 100).toFixed(1) + "%";
    console.log(`\n${home} vs ${away} (λ ${lam.lambdaHome.toFixed(2)} / ${lam.lambdaAway.toFixed(2)}):`);
    console.log(`  1X2: 1 ${pct(mk["1"])} · X ${pct(mk.X)} · 2 ${pct(mk["2"])} · Над2.5 ${pct(mk.over)} · BTTS ${pct(mk.bttsYes)}`);
    console.log(`  Топ: ${topScores(scoreMatrix(lam.lambdaHome, lam.lambdaAway, { rho: fit.rho }), 4).map((s) => s.score + " " + pct(s.p)).join(" · ")}`);
    console.log("\n  ⚠ Модел от ТВОИ цитирани резултати · не бетинг съвет · 18+, риск от загуба.\n");
  }
}
