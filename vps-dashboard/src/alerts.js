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

export class AlertEngine {
  constructor({ cfg, metrics, audit }) {
    this.cfg = cfg;
    this.metrics = metrics;
    this.audit = audit;
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
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  // Събира текущо активните условия. Всяко: {key, severity, title, body, sustain?}
  async collect() {
    const t = this.cfg.alerts?.thresholds || {};
    const out = [];
    const snap = this.metrics.latest;

    if (snap) {
      if (t.cpuPct && snap.cpuPct >= t.cpuPct) {
        out.push({
          key: 'cpu',
          severity: 'warning',
          title: 'Високо натоварване на процесора',
          body: `CPU ${snap.cpuPct.toFixed(0)}% (праг ${t.cpuPct}%)`,
        });
      }
      const memPct = snap.mem.total ? (snap.mem.used / snap.mem.total) * 100 : 0;
      if (t.memPct && memPct >= t.memPct) {
        out.push({
          key: 'mem',
          severity: 'warning',
          title: 'Паметта свършва',
          body: `Използвана памет ${memPct.toFixed(0)}% (праг ${t.memPct}%)`,
        });
      }
      const perCore = snap.cpus ? snap.load[0] / snap.cpus : 0;
      if (t.load1PerCore && perCore >= t.load1PerCore) {
        out.push({
          key: 'load',
          severity: 'warning',
          title: 'Високо load average',
          body: `load1 ${snap.load[0].toFixed(2)} на ${snap.cpus} ядра (${perCore.toFixed(2)}/ядро)`,
        });
      }
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
      if (!p.up) {
        out.push({
          key: `product:${p.name}`,
          severity: 'critical',
          title: `Продукт не отговаря: ${p.name}`,
          body: `${p.url} → ${p.error || 'статус ' + (p.status ?? '?')}`,
        });
      }
    }

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
