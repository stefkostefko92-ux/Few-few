// portfolio.js — портфейлен слой (Dalio „Holy Grail“): търгувай НЕкорелирани потоци и лимитирай
// общата + корелираната експозиция. Чисти функции, за да е тестваемо. Не гарантира печалба;
// диверсификацията сваля риска/дисперсията, не го маха.

// Pearson корелация между два реда доходности (еднаква дължина; иначе взима общата опашка).
export function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const x = a.slice(a.length - n), y = b.slice(b.length - n);
  const mx = mean(x), my = mean(y);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const ax = x[i] - mx, ay = y[i] - my;
    num += ax * ay; dx += ax * ax; dy += ay * ay;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

// Групира символи в „кофи“ по корелация: |corr| ≥ threshold → една кофа (напр. BTC/ETH).
// Връща map symbol → groupId. Ползва union-find.
export function groupByCorrelation(symbols, returnsBySymbol, threshold = 0.7) {
  const parent = {};
  const find = (s) => { while (parent[s] !== s) { parent[s] = parent[parent[s]]; s = parent[s]; } return s; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  for (const s of symbols) parent[s] = s;
  for (let i = 0; i < symbols.length; i++)
    for (let j = i + 1; j < symbols.length; j++) {
      const c = correlation(returnsBySymbol[symbols[i]] || [], returnsBySymbol[symbols[j]] || []);
      if (Math.abs(c) >= threshold) union(symbols[i], symbols[j]);
    }
  const groups = {};
  let next = 0; const rootId = {};
  for (const s of symbols) {
    const r = find(s);
    if (rootId[r] === undefined) rootId[r] = next++;
    groups[s] = rootId[r];
  }
  return groups;
}

// Може ли да отворим нова позиция? Проверява: вече отворена в символа; макс едновременни позиции;
// таван на общия портфейлен риск; таван на риска в една корелирана група.
// openPositions: [{ symbol, riskPct }]; proposed: { symbol, riskPct }; groups: map symbol→groupId.
export function canOpenPosition({ openPositions, proposed, groups, maxConcurrent, maxPortfolioRiskPct, maxGroupRiskPct }) {
  if (openPositions.some((p) => p.symbol === proposed.symbol))
    return { allowed: false, reason: `Вече има отворена позиция в ${proposed.symbol}.` };
  if (openPositions.length >= maxConcurrent)
    return { allowed: false, reason: `Достигнат лимит едновременни позиции (${maxConcurrent}).` };

  const totalRisk = sum(openPositions.map((p) => p.riskPct)) + proposed.riskPct;
  if (totalRisk > maxPortfolioRiskPct)
    return { allowed: false, reason: `Общ портфейлен риск ${totalRisk.toFixed(2)}% > ${maxPortfolioRiskPct}%.` };

  const gid = groups[proposed.symbol];
  const groupRisk = sum(openPositions.filter((p) => groups[p.symbol] === gid).map((p) => p.riskPct)) + proposed.riskPct;
  if (groupRisk > maxGroupRiskPct)
    return { allowed: false, reason: `Риск в корелирана група ${groupRisk.toFixed(2)}% > ${maxGroupRiskPct}% (не трупай еднакви залози).` };

  return { allowed: true, reason: 'ok' };
}

// Доходности по свещи (за корелация): (close[i]/close[i-1] − 1).
export function toReturns(closes) {
  const r = [];
  for (let i = 1; i < closes.length; i++) r.push(closes[i] / closes[i - 1] - 1);
  return r;
}

function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
function sum(a) { return a.reduce((x, y) => x + y, 0); }
