// Седмичен дайджест — „тишината не доказва здраве".
//
// Панел, който се обажда само при проблем, е неразличим от панел, който е умрял
// тихо. Мъртвецът-ключ покрива машинната страна (външен наблюдател следи пулса);
// дайджестът е същият принцип КЪМ ЧОВЕКА: веднъж седмично едно съобщение казва
// „жив съм, и ето какво видях" — 0 критични също е информация, при това
// най-добрата.
//
// Правилата:
//  · Дайджестът НЕ минава през прага по канал (`minSeverity`) — той е изрично
//    поискан с включването си, а тежест няма (не е инцидент). Затова върви с
//    `force` през каналите.
//  · Съставянето е ЧИСТА функция от подадени данни — тестваема без система.
//  · Кадансът е като графика на бекъпа: фиксиран ден+час, проверка на всеки час,
//    изпуснат прозорец се ДОГОНВА (панел, спрян в понеделник 8:00, праща във
//    вторник, не чака седмица).
//  · Езикът е БЪЛГАРСКИ — дайджестът напуска панела (Telegram/имейл), а записите
//    навън са на един език (същата граница като при алармите).
import fs from 'node:fs';
import path from 'node:path';

const STATE = 'digest.json';
const HOUR_MS = 3600000;
const WEEK_MS = 7 * 24 * HOUR_MS;

function fmtBytes(n) {
  n = Number(n) || 0;
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}

// Чиста функция: данни → текст. Дайджестът е кратък НАРОЧНО — стена от числа се
// чете колкото празен ред. Всеки ред е „добре/зле + числото, което го доказва".
export function composeDigest(d) {
  const lines = [`📊 Седмичен отчет · ${d.nodeName || d.nodeId || 'сървърът'}`];

  // Аларми за периода.
  const c = d.alertCounts || { critical: 0, warning: 0, info: 0 };
  if (!c.critical && !c.warning) lines.push(`✅ Аларми: нито една критична или предупредителна за 7 дни.`);
  else {
    lines.push(`🔔 Аларми: ${c.critical} критични, ${c.warning} предупреждения.`);
    for (const t of (d.topAlerts || []).slice(0, 3)) lines.push(`   · ${t.title} (×${t.count})`);
  }

  // Активни в момента — по-важно от историята.
  if (d.activeNow?.length) {
    lines.push(`⚠ Активни СЕГА: ${d.activeNow.length} — ${d.activeNow.slice(0, 3).map((a) => a.title).join('; ')}${d.activeNow.length > 3 ? '…' : ''}`);
  } else {
    lines.push('✅ Активни аларми сега: няма.');
  }

  // Бекъпи: възраст + доказано възстановим + къде има копие.
  if (d.backup) {
    const b = d.backup;
    if (!b.hasBackup) lines.push('❌ Бекъп: НЯМА нито един дъмп.');
    else lines.push(`${b.ageDays <= (b.maxAgeDays ?? 2) ? '✅' : '❌'} Бекъп: най-новият е на ${b.ageDays} дни${b.lastDrillOkDays != null ? `, последна успешна проба преди ${b.lastDrillOkDays} дни` : ', проба за възстановяване няма'}.`);
    if (b.offsiteEnabled) lines.push(`   · копия на другия VPS: включено${b.offsiteShipped ? ` (изнесени ${b.offsiteShipped})` : ''}`);
    else lines.push('   · offsite изнасяне: ИЗКЛЮЧЕНО (бекъп на същия диск не е бекъп)');
  }

  // Трафик срещу квотата.
  if (d.traffic?.quotaBytes) {
    const t = d.traffic;
    lines.push(`${t.projectedPct >= 100 ? '⚠' : '✅'} Трафик: ${fmtBytes(t.used)} (${t.usedPct}% от квотата)${t.warmedUp && t.projected ? `, прогноза за месеца ${fmtBytes(t.projected)}` : ''}.`);
  }

  // SLO по продукт — само отклоненията; изброяване на 10 зелени реда е шум.
  const bad = (d.slo || []).filter((s) => s.availability < (s.target ?? 0.999));
  if (d.slo?.length) {
    if (!bad.length) lines.push(`✅ Наличност: всички ${d.slo.length} продукта в целта.`);
    else for (const s of bad.slice(0, 4)) lines.push(`❌ ${s.name}: наличност ${(s.availability * 100).toFixed(2)}% (цел ${(s.target * 100).toFixed(1)}%).`);
  }

  // Дискове: само тези с прогноза или над прага.
  for (const disk of (d.disks || []).slice(0, 3)) {
    lines.push(`⚠ Диск ${disk.mount}: ${disk.usePercent}%${disk.etaDays ? `, пълен след ~${disk.etaDays} дни` : ''}.`);
  }

  // Чакащи неща с краен срок.
  if (d.updates?.security > 0) lines.push(`⚠ Ъпдейти за сигурност: ${d.updates.security} чакат.`);
  for (const cert of (d.expiring || []).slice(0, 3)) lines.push(`⚠ ${cert.what} изтича след ${cert.daysLeft} дни (${cert.name}).`);

  lines.push(`— панелът е жив; проверки на всеки ${d.checkIntervalSec ?? 60}s, това е седмичният пулс към теб.`);
  return lines.join('\n');
}

export class DigestSchedule {
  constructor(stateDir) {
    this.file = path.join(stateDir, STATE);
    this.state = this.load();
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return { lastSentAt: null, lastText: null };
    }
  }

  save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.state), { mode: 0o600 });
    } catch {
      /* best-effort */
    }
  }

  // Ден+час като графика на бекъпа: улучва се с часова проверка, догонва се при
  // пропуск (над 8 дни от последния — праща независимо от деня).
  due(cfg, now = Date.now()) {
    const dg = cfg?.alerts?.digest || {};
    if (dg.enabled === false) return false;
    const weekday = Number.isInteger(dg.weekday) && dg.weekday >= 0 && dg.weekday <= 6 ? dg.weekday : 1; // понеделник
    const hour = Number.isInteger(dg.hour) && dg.hour >= 0 && dg.hour <= 23 ? dg.hour : 8;
    const d = new Date(now);
    const slot = d.getDay() === weekday && d.getHours() === hour;
    if (!this.state.lastSentAt) return slot;
    const elapsed = now - new Date(this.state.lastSentAt).getTime();
    if (elapsed < 6.5 * 24 * HOUR_MS) return false; // още е рано, дори слотът да съвпада
    if (elapsed >= WEEK_MS + 24 * HOUR_MS) return true; // изпуснат → догонва
    return slot;
  }

  record(text) {
    this.state.lastSentAt = new Date().toISOString();
    this.state.lastText = String(text).slice(0, 4000);
    this.save();
  }

  status(cfg) {
    const dg = cfg?.alerts?.digest || {};
    return {
      enabled: dg.enabled !== false,
      weekday: Number.isInteger(dg.weekday) ? dg.weekday : 1,
      hour: Number.isInteger(dg.hour) ? dg.hour : 8,
      lastSentAt: this.state.lastSentAt,
      lastText: this.state.lastText,
    };
  }
}
