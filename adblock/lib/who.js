// lib/who.js — „Кого спряхме“ (6.0): блокираните заявки по компания и по ден, само на устройството.
//
// В публикуваното разширение Chrome казва само КОЕ правило е блокирало (getMatchedRules: ruleset + id),
// никога адреса. rules/who.json (tools/build_who.mjs) е картата „статично правило → компанията, която
// притежава домейна му“. Пазим { "YYYY-MM-DD": { компания: брой } } за 31 дни, до 60 компании на ден —
// без адреси, без сайтове, нищо не излиза от устройството. Чисти функции; класически скрипт →
// globalThis.SA_WHO (importScripts в SW, background.scripts във Firefox, vm в tests/who.test.mjs).
(function (root) {
  const KEEP_DAYS = 31;
  const PER_DAY = 60;
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

  function dayKey(t) {
    const d = new Date(t);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /** Компанията зад съвпадналото правило ({ rulesetId, ruleId }) или "" — само от картата, никога догадка. */
  function companyOfRule(map, rule) {
    if (!map || !map.rules || !rule) return "";
    const set = map.rules[rule.rulesetId];
    if (!set || !Object.prototype.hasOwnProperty.call(set, String(rule.ruleId))) return "";
    const name = Array.isArray(map.companies) ? map.companies[set[rule.ruleId]] : "";
    return typeof name === "string" ? name : "";
  }

  const isCount = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;

  /** Добавя { компания: брой } към деня `now`; маха старите дни и боклука; таван на компаниите за ден. */
  function bump(who, add, now) {
    const out = {};
    const src = who && typeof who === "object" && !Array.isArray(who) ? who : {};
    for (const [day, row] of Object.entries(src)) {
      if (!DAY_RE.test(day) || !row || typeof row !== "object" || Array.isArray(row)) continue;
      const r = {};
      for (const [name, n] of Object.entries(row)) if (typeof name === "string" && name && name.length <= 60 && isCount(n)) r[name] = Math.round(n);
      if (Object.keys(r).length) out[day] = r;
    }
    const today = dayKey(now);
    const row = out[today] || {};
    const isMap = add && typeof add.get === "function" && typeof add.entries === "function"; // a Map from any realm
    for (const [name, n] of isMap ? [...add.entries()] : Object.entries(add || {})) {
      if (typeof name !== "string" || !name || name.length > 60 || !isCount(n)) continue;
      if (!(name in row) && Object.keys(row).length >= PER_DAY) continue;
      row[name] = (row[name] || 0) + Math.round(n);
    }
    if (Object.keys(row).length) out[today] = row;
    const days = Object.keys(out).sort();
    while (days.length > KEEP_DAYS) delete out[days.shift()];
    return out;
  }

  /** Последните `days` дни: [{ name, n, days }] — най-много заявки отгоре, при равенство по име. */
  function summary(who, now, days = 30) {
    const from = dayKey(now - (days - 1) * 86400000);
    const to = dayKey(now);
    const agg = new Map();
    const clean = bump(who, null, now); // the same validation as a write
    for (const [day, row] of Object.entries(clean)) {
      if (day < from || day > to) continue;
      for (const [name, n] of Object.entries(row)) {
        const cur = agg.get(name) || { name, n: 0, days: 0 };
        cur.n += n;
        cur.days += 1;
        agg.set(name, cur);
      }
    }
    return [...agg.values()].sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : 1));
  }

  root.SA_WHO = { KEEP_DAYS, PER_DAY, dayKey, companyOfRule, bump, summary };
})(typeof globalThis !== "undefined" ? globalThis : this);
