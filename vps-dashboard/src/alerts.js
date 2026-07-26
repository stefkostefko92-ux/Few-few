// Двигател за аларми — оценява правила по каданс и известява при ПРОМЯНА на
// състоянието (пламна / възстанови се), не при всяка проверка.
//
// Канонът на Наблюдателя: аларми по СИМПТОМ (диск пълен, продукт DOWN), не по
// причина; праг трябва да се ЗАДЪРЖИ N проверки (без шум от пикове); всяка аларма
// има cooldown, за да не спами; „възстановено“ също се известява.
import fs from 'node:fs';
import path from 'node:path';
import { notify } from './notify.js';
import { failedServices, tlsCerts } from './system.js';
import { productHealth } from './deploy.js';
import { nodesStatus } from './nodes.js';
import { forecastToLimit, fmtDuration, detectAnomaly } from './forecast.js';
import { diskSeries, knownMounts } from './history.js';
import { evaluateBurn } from './slo.js';

export class AlertEngine {
  constructor({ cfg, metrics, audit, history, slo, logminer }) {
    this.cfg = cfg;
    this.metrics = metrics;
    this.logminer = logminer; // за „нова грешка в журнала"
    this.audit = audit;
    this.history = history; // за прогнозите
    this.slo = slo; // за burn-rate алармите
    this.file = path.join(cfg.paths.stateDir, 'alerts.json');
    this.active = new Map(); // key → { since, lastNotified, severity, title, body }
    this.streaks = new Map(); // key → колко последователни проверки е активно
    this.log = []; // последните известия (за интерфейса)
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.active = new Map(Object.entries(raw.active || {}));
      this.log = raw.log || [];
    } catch {
      /* първо пускане */
    }
  }

  save() {
    try {
      fs.writeFileSync(
        this.file,
        JSON.stringify({ active: Object.fromEntries(this.active), log: this.log.slice(-200) }),
        { mode: 0o600 }
      );
    } catch {
      /* не чупим алармите заради диска */
    }
  }

  start() {
    if (!this.cfg.alerts?.enabled) return;
    const every = Math.max(30, Number(this.cfg.alerts.checkIntervalSec) || 60) * 1000;
    const tick = () => this.evaluate().catch(() => {});
    setTimeout(tick, 10000); // първата проверка след 10s (метриките да се напълнят)
    this.timer = setInterval(tick, every);
    this.timer.unref?.();

    // Журналът се копае на ОТДЕЛЕН, по-рядък каданс — `journalctl -o json` е скъп
    // и няма смисъл да върви на всеки 60s заедно с останалите проверки.
    if (this.logminer && this.cfg.logmine?.enabled !== false) {
      const lm = Math.max(60, Number(this.cfg.logmine?.intervalSec) || 300) * 1000;
      const mine = () => this.newErrorCheck().catch(() => {});
      setTimeout(mine, 45000);
      this.logTimer = setInterval(mine, lm);
      this.logTimer.unref?.();
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.logTimer) clearInterval(this.logTimer);
  }

  // „Тази грешка не се е случвала преди" — най-полезният сигнал след деплой.
  // Еднократно събитие (не състояние): грешка, която веднъж е избила, не се
  // „възстановява" — затова минава през event(), не през активните аларми.
  async newErrorCheck() {
    const priority = Number(this.cfg.logmine?.priority ?? 4);
    const r = await this.logminer.collect({ priority: priority >= 0 && priority <= 7 ? priority : 4 });
    if (!r.available) return;
    // Само НОВИ и само истински грешки (p≤3) — warning-ите шумят твърде много.
    const fresh = r.groups.filter((g) => g.isNew && g.priority <= 3);
    if (!fresh.length) return;
    const top = fresh.slice(0, 5);
    await this.event({
      key: 'logmine:new',
      severity: 'warning',
      title: `Нова грешка в журнала (${fresh.length})`,
      // Шаблоните са МАСКИРАНИ (пътища, IP, имейли, токени) — известието тръгва
      // навън през Telegram/ntfy, сурово съобщение не бива да го напуска.
      body: top.map((g) => `• ${g.unit}: ${g.pattern} (×${g.count})`).join('\n'),
    });
  }

  // Събира текущо активните условия. Всяко: {key, severity, title, body, sustain?}
  async collect() {
    const t = this.cfg.alerts?.thresholds || {};
    const out = [];
    const snap = this.metrics.latest;

    if (snap) {
      const k = snap.kernel;

      // ── СИМПТОМИ (болка), не причини ─────────────────────────────────────
      // PSI казва колко време задачи са СТОЯЛИ блокирани. CPU 95% при доволни
      // потребители не е проблем; PSI 40% при CPU 60% е.
      if (k?.pressure?.available) {
        const psi = [
          ['cpu', k.pressure.cpu?.some?.avg60, t.psiCpu, 'Задачите чакат процесор'],
          ['io', k.pressure.io?.some?.avg60, t.psiIo, 'Задачите чакат диска'],
          ['memory', k.pressure.memory?.some?.avg60, t.psiMem, 'Системата се дави в паметта'],
        ];
        for (const [name, value, threshold, title] of psi) {
          if (threshold && value != null && value >= threshold) {
            out.push({
              key: `psi:${name}`,
              severity: value >= threshold * 2 ? 'critical' : 'warning',
              title,
              body: `Натиск ${name} ${value.toFixed(1)}% за последната минута (праг ${threshold}%)`,
            });
          }
        }
      } else if (t.cpuPct && snap.cpuPct >= t.cpuPct) {
        // Резерва за ядра без PSI: тогава прагът по CPU е всичко, което имаме.
        out.push({
          key: 'cpu',
          severity: 'warning',
          title: 'Високо натоварване на процесора',
          body: `CPU ${snap.cpuPct.toFixed(0)}% (праг ${t.cpuPct}%; ядрото не подава PSI)`,
        });
      }

      // Steal: единственият сигнал, че бавното НЕ е наша вина, а на съседа/хостера.
      if (t.stealPct && k?.cpuModes && k.cpuModes.steal >= t.stealPct) {
        out.push({
          key: 'steal',
          severity: 'warning',
          title: 'Хостерът ни краде процесорно време',
          body: `steal ${k.cpuModes.steal.toFixed(1)}% (праг ${t.stealPct}%) — съседна машина товари хоста. Основание за тикет към доставчика.`,
        });
      }

      // OOM: „приложението се рестартира само" почти винаги е това.
      if (k?.oomKillDelta > 0) {
        out.push({
          key: 'oom',
          severity: 'critical',
          title: 'Ядрото уби процес заради памет (OOM)',
          body: `${k.oomKillDelta} убит(и) процеса от последната проверка (общо ${k.oomKillTotal}). Виж кой: journalctl -k -g "Out of memory"`,
          sustain: false,
        });
      }

      // Файлова система, минала в read-only — приложенията умират тихо, df мълчи.
      for (const ro of k?.readOnly || []) {
        out.push({
          key: `ro:${ro.mount}`,
          severity: 'critical',
          title: 'Файловата система е само за четене',
          body: `${ro.mount} (${ro.dev}) е монтирана ro — ядрото я е защитило при I/O грешка. Приложенията не могат да пишат.`,
          sustain: false,
        });
      }

      // Изчерпани inode-и: 30% свободно място, а системата не приема нов файл.
      for (const i of k?.inodes || []) {
        if (t.inodePct && i.usePercent >= t.inodePct) {
          out.push({
            key: `inode:${i.mount}`,
            severity: i.usePercent >= 95 ? 'critical' : 'warning',
            title: 'Свършват inode-ите',
            body: `${i.mount} е на ${i.usePercent}% inode-и (${i.free} свободни) — дискът може да изглежда празен, но нов файл няма да се създаде.`,
          });
        }
      }

      // Препълнена accept опашка = „сайтът се отваря понякога" при празен CPU.
      if (this.prevListen && k?.listen) {
        const d = k.listen.listenOverflows - this.prevListen.listenOverflows;
        if (d > 0) {
          out.push({
            key: 'listen-overflow',
            severity: 'warning',
            title: 'Препълнена опашка за връзки',
            body: `${d} нови ListenOverflows — заявки се отхвърлят преди да стигнат до приложението (вдигни backlog/worker-и).`,
            sustain: false,
          });
        }
      }
      if (k?.listen) this.prevListen = k.listen;

      // Файлови дескриптори — EMFILE вали Node приложение мигновено.
      if (k?.fds && k.fds.usePercent >= 80) {
        out.push({
          key: 'fds',
          severity: k.fds.usePercent >= 95 ? 'critical' : 'warning',
          title: 'Свършват файловите дескриптори',
          body: `${k.fds.allocated} от ${k.fds.max} (${k.fds.usePercent.toFixed(0)}%)`,
        });
      }

      // ── Капацитет: праг + ПРОГНОЗА ───────────────────────────────────────
      for (const d of snap.disks || []) {
        if (t.diskPct && d.usePercent >= t.diskPct) {
          out.push({
            key: `disk:${d.mount}`,
            severity: d.usePercent >= 95 ? 'critical' : 'warning',
            title: 'Дискът се пълни',
            body: `${d.mount} е на ${d.usePercent}% (остават ${fmtGb(d.availBytes)})`,
          });
        }
      }
      for (const f of this.diskForecasts()) {
        out.push(f);
      }
      for (const a of this.anomalyChecks()) {
        out.push(a);
      }
    }

    for (const unit of await failedServices()) {
      out.push({
        key: `service:${unit}`,
        severity: 'critical',
        title: 'Паднала услуга',
        body: `${unit} е в състояние failed`,
        sustain: false,
      });
    }

    for (const p of await productHealth(this.cfg)) {
      // Всяка проба влиза в SLO историята — оттам идват burn-rate алармите.
      this.slo?.record(p.name, { up: p.up, ms: p.ms, latencyTargetMs: this.cfg.slo?.latencyTargetMs });
      if (!p.up) {
        out.push({
          key: `product:${p.name}`,
          severity: 'critical',
          title: `Продукт не отговаря: ${p.name}`,
          body: `${p.url} → ${p.error || 'статус ' + (p.status ?? '?')}`,
        });
      }
    }

    for (const b of this.burnChecks()) out.push(b);

    if (t.certDays) {
      for (const c of await tlsCerts()) {
        if (c.daysLeft != null && c.daysLeft <= t.certDays) {
          out.push({
            key: `cert:${c.domain}`,
            severity: c.daysLeft <= 3 ? 'critical' : 'warning',
            title: 'TLS сертификат изтича',
            body: `${c.domain} изтича след ${c.daysLeft} дни (${c.expiresAt})`,
            sustain: false,
          });
        }
      }
    }

    if ((this.cfg.peers || []).length) {
      const st = await nodesStatus(this.cfg);
      for (const p of st.peers) {
        if (!p.up) {
          out.push({
            key: `peer:${p.id}`,
            severity: 'warning',
            title: 'Другият сървър не отговаря',
            body: `${p.name} (${p.id}) е недостъпен: ${p.error || 'няма отговор'}`,
          });
        }
      }
    }

    if (fs.existsSync('/var/run/reboot-required')) {
      out.push({
        key: 'reboot',
        severity: 'info',
        title: 'Нужен е рестарт',
        body: 'Ъпдейтите изискват рестарт на сървъра.',
        sustain: false,
      });
    }

    return out;
  }

  // Прогноза за пълнене по ДЯЛ — предупреждава ПРЕДИ прага, докато има време за
  // действие. Мълчи, ако трендът не е статистически значим (виж forecast.js).
  diskForecasts() {
    const out = [];
    const days = Number(this.cfg.alerts?.thresholds?.diskEtaDays) || 0;
    if (!days || !this.history) return out;
    let points;
    try {
      points = this.history.range(7 * 24 * 3600 * 1000, 400);
    } catch {
      return out;
    }
    if (points.length < 12) return out;
    for (const mount of knownMounts(points)) {
      const series = diskSeries(points, mount);
      if (series.length < 12) continue;
      const f = forecastToLimit(series, 100);
      if (!f.ok || f.etaMs === undefined) continue;
      const etaDays = f.etaMs / 86400000;
      if (etaDays > days) continue;
      out.push({
        key: `disk-eta:${mount}`,
        severity: etaDays <= 1 ? 'critical' : 'warning',
        title: `Дискът ${mount} ще се напълни`,
        body: `При сегашния темп (${f.slopePerDay.toFixed(1)}%/ден) ${mount} стига 100% след ${fmtDuration(f.etaMs)} — около ${new Date(Date.now() + f.etaMs).toLocaleDateString('bg-BG')}.`,
      });
    }
    return out;
  }

  // Burn-rate: алармира по СКОРОСТТА на харчене на бюджета за грешки, не по
  // „има ли грешка сега". Кратко мигване не буди никого; устойчиво влошаване —
  // да. Двата прозореца гасят алармата бързо, след като проблемът спре.
  burnChecks() {
    const out = [];
    if (!this.slo || this.cfg.slo?.enabled === false) return out;
    const target = Number(this.cfg.slo?.target) || 0.999;
    const rows = this.slo.read(Date.now() - 4 * 86400000);
    if (!rows.length) return out;
    const names = [...new Set(rows.map((r) => r.name))];
    for (const name of names) {
      const hit = evaluateBurn(rows, name, target, { minBadShort: Number(this.cfg.slo?.minBadShort) || 3 });
      if (!hit) continue;
      out.push({
        key: `slo:${name}`,
        severity: hit.severity,
        title: `${name}: харчи бюджета за грешки твърде бързо`,
        body: `Скорост ${hit.longBurn}× (праг ${hit.factor}×) — ${hit.label}. ${hit.badLong} лоши от ${hit.totalLong} проби за последните ${fmtDuration(hit.longWindowMs)}.`,
      });
    }
    return out;
  }

  // Аномалии: „нетипично за този сървър", не „над праг". Съзнателно са с
  // тежест „info" и НЕ будят човек — аларма по аномалия е класическият източник
  // на умора от известия. Служат за контекст при разследване.
  anomalyChecks() {
    const out = [];
    if (!this.history || this.cfg.alerts?.anomalies === false) return out;
    let points;
    try {
      points = this.history.range(6 * 3600 * 1000, 400);
    } catch {
      return out;
    }
    if (points.length < 30) return out;

    const series = {
      cpu: { values: points.map((p) => p.cpu).filter((v) => typeof v === 'number'), label: 'процесора' },
      memory: {
        values: points.map((p) => (p.memTotal ? (p.memUsed / p.memTotal) * 100 : null)).filter((v) => v !== null),
        label: 'паметта',
      },
    };
    for (const [key, s] of Object.entries(series)) {
      if (s.values.length < 30) continue;
      const a = detectAnomaly(s.values);
      if (!a.anomaly) continue;
      out.push({
        key: `anomaly:${key}`,
        severity: 'info',
        title: `Нетипично поведение на ${s.label}`,
        body: `Текущо ${a.current?.toFixed(1)} спрямо обичайното ${a.baseline} за последните 6 часа (z=${a.z}). Не е задължително проблем — просто не е както обикновено.`,
      });
    }
    return out;
  }

  async evaluate() {
    const cfg = this.cfg;
    if (!cfg.alerts?.enabled) return { firing: [], events: [] };
    const need = Math.max(1, Number(cfg.alerts.sustainSamples) || 1);
    const cooldownMs = Math.max(1, Number(cfg.alerts.cooldownMin) || 60) * 60 * 1000;
    const now = Date.now();

    const conditions = await this.collect();
    const byKey = new Map(conditions.map((c) => [c.key, c]));

    // Задържане: праговите правила искат N последователни попадения.
    for (const c of conditions) {
      const streak = (this.streaks.get(c.key) || 0) + 1;
      this.streaks.set(c.key, streak);
    }
    for (const key of [...this.streaks.keys()]) {
      if (!byKey.has(key)) this.streaks.delete(key);
    }

    const events = [];

    // Пламнали / за повторно известие.
    for (const c of conditions) {
      const sustained = c.sustain === false || (this.streaks.get(c.key) || 0) >= need;
      if (!sustained) continue;
      const prev = this.active.get(c.key);
      if (!prev) {
        this.active.set(c.key, {
          since: now,
          lastNotified: now,
          severity: c.severity,
          title: c.title,
          body: c.body,
        });
        events.push({ type: 'firing', ...c });
      } else {
        prev.severity = c.severity;
        prev.body = c.body;
        if (now - prev.lastNotified >= cooldownMs) {
          prev.lastNotified = now;
          events.push({ type: 'firing', ...c, repeat: true });
        }
      }
    }

    // Възстановени.
    for (const [key, prev] of [...this.active]) {
      if (byKey.has(key)) continue;
      this.active.delete(key);
      events.push({
        type: 'resolved',
        key,
        severity: 'ok',
        title: `Възстановено: ${prev.title}`,
        body: `Проблемът от ${new Date(prev.since).toLocaleString('bg-BG')} вече го няма.`,
      });
    }

    for (const ev of events) await this.dispatch(ev);
    this.save();
    return { firing: this.listActive(), events };
  }

  // Еднократно известие извън правилата (напр. провалена задача/деплой).
  async event({ severity = 'warning', title, body, key = 'event' }) {
    await this.dispatch({ type: 'firing', key, severity, title, body, oneShot: true });
    this.save();
  }

  async dispatch(ev) {
    const entry = {
      ts: new Date().toISOString(),
      key: ev.key,
      type: ev.type,
      severity: ev.severity,
      title: ev.title,
      body: ev.body,
    };
    this.log.push(entry);
    if (this.log.length > 200) this.log.shift();
    this.audit?.log({ action: `alert.${ev.type}`, key: ev.key, severity: ev.severity, title: ev.title });
    const results = await notify(this.cfg, ev);
    entry.sent = results.filter((r) => r.ok).map((r) => r.channel);
    entry.failed = results.filter((r) => !r.ok).map((r) => `${r.channel}:${r.error || r.status}`);
    return entry;
  }

  listActive() {
    return [...this.active.entries()].map(([key, v]) => ({ key, ...v }));
  }
}

function fmtGb(bytes) {
  const gb = (Number(bytes) || 0) / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round((Number(bytes) || 0) / 1024 ** 2)} MB`;
}

// Тест-достъпна чиста логика: решава дали условие трябва да пламне сега.
export function shouldFire({ sustain, streak, need }) {
  return sustain === false || streak >= need;
}
