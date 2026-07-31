// Двигател за аларми — оценява правила по каданс и известява при ПРОМЯНА на
// състоянието (пламна / възстанови се), не при всяка проверка.
//
// Канонът на Наблюдателя: аларми по СИМПТОМ (диск пълен, продукт DOWN), не по
// причина; праг трябва да се ЗАДЪРЖИ N проверки (без шум от пикове); всяка аларма
// има cooldown, за да не спами; „възстановено“ също се известява.
import fs from 'node:fs';
import path from 'node:path';
import { notify, configuredChannels, heartbeat } from './notify.js';
import { failedServicesSafe, tlsCertsSafe } from './system.js';
import { productHealth } from './deploy.js';
import { nodesStatus } from './nodes.js';
import { forecastToLimit, fmtDuration, detectAnomaly } from './forecast.js';
import { diskSeries, knownMounts, memPercent } from './history.js';
import { evaluateBurn } from './slo.js';
import { backupChecks } from './drill.js';
import { scheduleChecks } from './backupsched.js';
import { trafficChecks } from './traffic.js';
import { restartCounts, detectFlapping, domainExpiry, registrableDomain } from './health.js';
import { overview as redisOverview, evictionChecks } from './redis.js';
import { safePath } from './accesslog.js';
import { exposureMap, portChecks } from './ports.js';
import { saveConfig } from './config.js';
import { Guardians } from './guardians.js';

export class AlertEngine {
  constructor({ cfg, metrics, audit, history, slo, logminer, drill, accesslog, portBaseline, backupSchedule, traffic }) {
    this.guardians = new Guardians(cfg.paths.stateDir); // /etc дрейф + SSH входове
    this.portBaseline = portBaseline; // базова линия за „НОВО изложен порт"
    this.drill = drill; // за алармите „липсващ/остарял бекъп" и „провалена проба"
    this.backupSchedule = backupSchedule; // за алармите на самия ГРАФИК
    this.traffic = traffic; // месечен трафик срещу квотата на хостера
    this.accesslog = accesslog; // за дела 5xx от РЕАЛНИЯ трафик
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
    // „Кой пази пазача": кога за последно оценката МИНА докрай. Панелът показва
    // възрастта, а рестарт с изтрито състояние не изглежда като жив мониторинг.
    this.lastEvalAt = null;
    this.lastEvalError = null;
    // Здраве на каналите: последният опит за доставка. Аларма, която е излязла
    // от двигателя, но не е стигнала до никого, е равна на липсваща аларма.
    this.notifyHealth = null;
    this.saveConfig = saveConfig; // за самоизтичащата поддръжка
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.active = new Map(Object.entries(raw.active || {}));
      this.log = raw.log || [];
      this.lastEvalAt = raw.lastEvalAt || null;
      this.lastEvalError = raw.lastEvalError || null;
      this.notifyHealth = raw.notifyHealth || null;
    } catch {
      /* първо пускане */
    }
  }

  save() {
    try {
      fs.writeFileSync(
        this.file,
        JSON.stringify({
          active: Object.fromEntries(this.active),
          log: this.log.slice(-200),
          lastEvalAt: this.lastEvalAt,
          lastEvalError: this.lastEvalError,
          notifyHealth: this.notifyHealth,
        }),
        { mode: 0o600 }
      );
    } catch {
      /* не чупим алармите заради диска */
    }
  }

  // Пингът към външния наблюдател се ЗАПИСВА, не се изхвърля. `post()` никога не
  // хвърля — връща `{ok:false}` — така че „.catch(() => {})" правеше DNS грешка,
  // изтекъл URL и блокиран изход неразличими от успех. Пазачът на пазача е
  // единственото, което няма право да е „вероятно работи": панелът рисуваше
  // зелено само защото полето в конфига е попълнено.
  async ping({ ok = true } = {}) {
    if (!this.cfg.alerts?.heartbeatUrl) return null;
    let r;
    try {
      r = await heartbeat(this.cfg, { ok });
    } catch (err) {
      r = { ok: false, error: err.message };
    }
    this.lastHeartbeat = { ts: Date.now(), ok: Boolean(r?.ok), status: r?.status ?? null, error: r?.error || null };
    return this.lastHeartbeat;
  }

  // Заглушаване: изрично, СРОЧНО и видимо. Заглушената аларма продължава да се
  // изчислява и да стои в панела — само известието спира. Безсрочното заглушаване
  // е начинът да забравиш, че си заглушил, затова `until` е задължителен.
  silences() {
    const now = Date.now();
    return (this.cfg.alerts?.silences || []).filter((s) => s?.key && Number(s.until) > now);
  }

  // Режим „поддръжка": срочна пауза на ИЗВЕСТИЯТА за всичко. Алармите
  // продължават да се смятат и да се виждат — спира само изходящото. Разликата
  // със заглушаването: то е по ключ и хирургично; поддръжката е „работя по
  // сървъра, не ми пращай вълната". Съзнателно БЕЗ sudo — обратимо, видимо
  // (банер в панела), срочно (таван 8 часа) и одитирано, като заглушаването.
  maintenance() {
    const m = this.cfg.alerts?.maintenance;
    if (!m?.until) return null;
    if (Number(m.until) <= Date.now()) return null;
    return m;
  }

  // ТОЧНО съвпадение по подразбиране. Мълчаливото съвпадение по префикс беше
  // капан: заглушаването на `disk:/` (най-честата дискова аларма) ослепяваше и
  // `disk:/var`, `disk:/boot`, `disk:/var/lib/docker`, а четиринайсет записа от
  // по една буква заглушаваха ЦЕЛИЯ регистър — и в панела изглеждаха като
  // четиринайсет безобидни букви. Цялото семейство се заглушава ИЗРИЧНО, със
  // звездичка накрая, за да е видимо какво си направил.
  silencedBy(key) {
    return (
      this.silences().find((s) =>
        String(s.key).endsWith('*') ? key.startsWith(String(s.key).slice(0, -1)) : key === s.key
      ) || null
    );
  }

  start() {
    if (!this.cfg.alerts?.enabled) return;
    const every = Math.max(30, Number(this.cfg.alerts.checkIntervalSec) || 60) * 1000;
    this.intervalMs = every;
    // Провалената оценка НЕ бива да се преглъща: точно тя е „жив процес, сляп
    // мониторинг" — най-подвеждащото състояние, защото панелът изглежда наред.
    const tick = () =>
      this.evaluate().catch((err) => {
        this.lastEvalError = { ts: Date.now(), message: String(err?.message || err).slice(0, 300) };
        this.save();
        this.ping({ ok: false });
      });
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
  //
  // `this.stale` събира ПРЕФИКСИТЕ на източниците, които не са отговорили. Това е
  // разликата между „няма проблем" и „не знам" — и тя е решаваща: резолв по
  // отсъствие превръща провала на systemctl във фалшиво „Възстановено". Фалшивото
  // възстановяване е по-скъпо от пропуснатата аларма, защото учи човека да не
  // вярва на канала.
  async collect() {
    const t = this.cfg.alerts?.thresholds || {};
    const out = [];
    this.stale = new Map(); // префикс → причина
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
      } else {
        // Резерва за ядра без PSI: тогава праговете са всичко, което имаме.
        if (t.cpuPct && snap.cpuPct >= t.cpuPct) {
          out.push({
            key: 'cpu',
            severity: 'warning',
            title: 'Високо натоварване на процесора',
            body: `CPU ${snap.cpuPct.toFixed(0)}% (праг ${t.cpuPct}%; ядрото не подава PSI)`,
          });
        }
        // `memPct` беше ДЕКЛАРИРАНА в конфига и редактируема в панела, но нито
        // един ред не я четеше: на ядро без PSI паметта нямаше аларма изобщо, а
        // собственикът въртеше скала, която не прави нищо. Мъртвата настройка е
        // по-лоша от липсващата — тя обещава защита.
        // Полетата са `snap.mem.{total,used}` (виж parseMeminfo в metrics.js) —
        // НЕ `memUsed/memTotal`, каквато е формата на точките в ИСТОРИЯТА.
        // Сбъркаш ли ги, алармата мълчи вечно, без нито една грешка.
        const memPct = snap.mem?.total ? (snap.mem.used / snap.mem.total) * 100 : null;
        if (t.memPct && memPct != null && memPct >= t.memPct) {
          out.push({
            key: 'mem',
            severity: memPct >= 98 ? 'critical' : 'warning',
            title: 'Паметта свършва',
            body: `Заета ${memPct.toFixed(0)}% (праг ${t.memPct}%; ядрото не подава PSI). Следващото е OOM.`,
          });
        }
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
          transient: true, // мери се по РАЗЛИКА → няма какво да се „възстанови"
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
            transient: true,
          });
        }
      }
      if (k?.listen) this.prevListen = k.listen;

      // Файлови дескриптори — EMFILE вали Node приложение мигновено.
      // Прагът е в конфига като всички останали: зашитата стойност беше
      // единственото число тук, което собственикът не можеше да нагласи.
      const fdPct = Number(t.fdPct) || 80;
      if (k?.fds && k.fds.usePercent >= fdPct) {
        out.push({
          key: 'fds',
          severity: k.fds.usePercent >= Math.max(fdPct, 95) ? 'critical' : 'warning',
          title: 'Свършват файловите дескриптори',
          body: `${k.fds.allocated} от ${k.fds.max} (${k.fds.usePercent.toFixed(0)}%)`,
        });
      }

      // ── Капацитет: праг + ПРОГНОЗА, СЛЯТИ в едно условие ─────────────────
      // Дял на 86%, който се пълни за 3 дни, е ЕДИН проблем. Две отделни аларми
      // („дискът се пълни" + „дискът ще се напълни") за същия дял са двойна
      // работа за човека и двойна умора от известия. Прогнозата не изтрива
      // прага — тя го ОБОГАТЯВА: тежестта е по-тежката от двете, а текстът носи
      // и състоянието, и срока.
      const forecasts = new Map(this.diskForecasts().map((f) => [f.mount, f]));
      const seenMounts = new Set();
      for (const d of snap.disks || []) {
        const f = forecasts.get(d.mount);
        const overThreshold = t.diskPct && d.usePercent >= t.diskPct;
        if (!overThreshold && !f) continue;
        seenMounts.add(d.mount);
        const thresholdSev = d.usePercent >= 95 ? 'critical' : 'warning';
        const severity = worst(overThreshold ? thresholdSev : 'info', f ? f.severity : 'info');
        const state = `${d.mount} е на ${d.usePercent}% (остават ${fmtGb(d.availBytes)})`;
        out.push({
          key: `disk:${d.mount}`,
          severity,
          title: f ? `Дискът ${d.mount} ще се напълни` : 'Дискът се пълни',
          body: f ? `${state}. ${f.body}` : state,
        });
      }
      // Прогноза за дял, който метриките вече не показват (размонтиран между
      // историята и снимката) — по-добре сама, отколкото изгубена.
      for (const [mount, f] of forecasts) {
        if (!seenMounts.has(mount)) out.push({ key: `disk:${mount}`, severity: f.severity, title: f.title, body: f.body });
      }
      for (const a of this.anomalyChecks()) {
        out.push(a);
      }
    }

    const svc = await failedServicesSafe();
    if (!svc.ok) this.stale.set('service:', `systemd не отговори (${svc.error})`);
    for (const unit of svc.units) {
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
    for (const b of backupChecks(this.cfg, this.drill)) out.push(b);
    // Графикът на бекъпа е отделен сигнал от възрастта на бекъпа: включен график,
    // който не се пуска, изглежда като покритие, а не е.
    for (const b of scheduleChecks(this.cfg, this.backupSchedule)) out.push(b);
    for (const b of trafficChecks(this.cfg, this.traffic)) out.push(b);
    // Тихите пазачи: дрейф на /etc (по каданс, кеширано) + нови SSH входове.
    if (this.cfg.guardians?.enabled !== false) {
      for (const c of this.guardians.etcCheck(this.cfg.guardians)) out.push(c);
      try {
        for (const c of await this.guardians.sshCheck()) out.push(c);
      } catch {
        /* няма last/wtmp на тази машина — не гадаем */
      }
    }
    for (const b of await this.flappingChecks()) out.push(b);
    for (const b of await this.domainChecks()) out.push(b);
    for (const b of await this.redisChecks()) out.push(b);
    for (const b of this.accessChecks()) out.push(b);
    // Нов изложен порт. Алармата НЕ е „порт 443 е отворен" (той трябва да е) —
    // а промяната спрямо приета базова линия, точно както рестарт-цикълът се
    // мери по разлика.
    if (this.portBaseline && this.cfg.ports?.enabled !== false) {
      try {
        const map = await exposureMap(this.cfg);
        if (!map.available) this.stale?.set('ports:', map.error || 'ss не отговори');
        else for (const c of portChecks(map, this.portBaseline)) out.push(c);
      } catch (err) {
        this.stale?.set('ports:', err.message);
      }
    }
    for (const b of this.notifyChecks()) out.push(b);

    if (t.certDays) {
      const certs = await tlsCertsSafe();
      if (!certs.ok) this.stale.set('cert:', `сертификатите не се четат (${certs.error})`);
      for (const c of certs.certs) {
        if (c.daysLeft != null && c.daysLeft <= t.certDays) {
          out.push({
            key: `cert:${c.domain}`,
            severity: c.daysLeft <= 3 ? 'critical' : 'warning',
            title: 'TLS сертификат изтича',
            body: `${c.domain} изтича след ${c.daysLeft} дни (${c.expiresAt})`,
            sustain: false,
            // Хоризонт седмици → напомняне веднъж на ден. При плоския час това
            // бяха 336 критични съобщения за един изтичащ сертификат.
            repeatEvery: 24 * 3600000,
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
        // Ubuntu държи този файл с дни. Час по час е info-буца, която учи човека
        // да не чете канала.
        repeatEvery: 7 * 24 * 3600000,
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
        mount,
        key: `disk-eta:${mount}`,
        severity: etaDays <= 1 ? 'critical' : 'warning',
        title: f.atLimit ? `Дискът ${mount} е на границата` : `Дискът ${mount} ще се напълни`,
        // `fmtDuration(0)` дава „1 мин" (има долен праг), затова пълен дял
        // получаваше „стига 100% след 1 мин" — изречение, което лъже за нещо,
        // което вече се е случило.
        body: f.atLimit
          ? `Вече е на 100%. Записите се провалят СЕГА — освободи място или разшири дяла.`
          : `При сегашния темп (${f.slopePerDay.toFixed(1)}%/ден) стига 100% след ${fmtDuration(f.etaMs)} — около ${new Date(Date.now() + f.etaMs).toLocaleDateString('bg-BG')}.`,
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
    const minBadShort = Number(this.cfg.slo?.minBadShort) || 3;
    for (const name of names) {
      const hit = evaluateBurn(rows, name, target, { minBadShort });
      if (hit) {
        out.push({
          key: `slo:${name}`,
          severity: hit.severity,
          title: `${name}: харчи бюджета за грешки твърде бързо`,
          body: `Скорост ${hit.longBurn}× (праг ${hit.factor}×) — ${hit.label}. ${hit.badLong} лоши от ${hit.totalLong} проби за последните ${fmtDuration(hit.longWindowMs)}.`,
        });
      }
      // Латентността е ОТДЕЛЕН бюджет с по-мека цел: „бавно" не е „долу", но е
      // това, което потребителят усеща първо. Целта е дял бързи заявки.
      const latTarget = Number(this.cfg.slo?.latencyTarget) || 0.99;
      const slowHit = evaluateBurn(rows, name, latTarget, { minBadShort, metric: 'slow' });
      if (slowHit) {
        out.push({
          key: `slo-slow:${name}`,
          // Бавното НЕ е авария — то е предупреждение. Дори при висока скорост
          // на изгаряне не бива да буди човек нощем както паднал сайт.
          severity: 'warning',
          title: `${name}: отговаря бавно`,
          body:
            `${slowHit.badLong} от ${slowHit.totalLong} заявки над ${this.cfg.slo?.latencyTargetMs || 800} ms ` +
            `за последните ${fmtDuration(slowHit.longWindowMs)} (скорост ${slowHit.longBurn}× при цел ${(latTarget * 100).toFixed(0)}% бързи). ` +
            'Сайтът работи, но потребителят го усеща като счупен.',
        });
      }
    }
    return out;
  }

  // Услуга в рестарт-цикъл. systemd я показва „active" — защото тя наистина е
  // активна, за трети път през последната минута. Това е ПО-ЛОШО от спряна:
  // изглежда жива, не вдига „failed" и никой не поглежда. Единственият видим
  // белег е NRestarts, който расте — затова следим РАЗЛИКАТА между проверките.
  async flappingChecks() {
    const out = [];
    if (this.cfg.alerts?.flapping === false) return out;
    let units = [];
    try {
      const { listServices } = await import('./services.js');
      const r = await listServices();
      units = (r.services || [])
        .filter((s) => s.active === 'active' || s.active === 'activating' || s.active === 'failed')
        .map((s) => s.unit);
    } catch {
      return out;
    }
    if (!units.length) return out;
    let now;
    try {
      now = await restartCounts(units);
    } catch {
      return out;
    }
    const threshold = Number(this.cfg.alerts?.flappingRestarts) || 3;
    for (const f of detectFlapping(this.lastRestarts, now, { threshold })) {
      out.push({
        key: `flap:${f.unit}`,
        severity: 'critical',
        title: `${f.unit} се рестартира в цикъл`,
        body:
          `${f.delta} рестарта от последната проверка (общо ${f.total}). systemd я показва като жива, ` +
          `защото тя наистина се вдига — и пада отново. Виж защо: journalctl -u ${f.unit} -n 100`,
        sustain: false,
        transient: true,
      });
    }
    this.lastRestarts = now;
    return out;
  }

  // Изтичаща РЕГИСТРАЦИЯ на домейн. Сертификатът е безполезен, ако домейнът
  // падне — а домейнът пада по-тихо и се връща много по-скъпо. RDAP се пита
  // рядко (веднъж на 12 часа): това е външна услуга, не наша.
  async domainChecks() {
    const out = [];
    const days = Number(this.cfg.domainExpiryDays) || 30;
    if (!days) return out;
    const now = Date.now();
    if (this.lastDomainCheck && now - this.lastDomainCheck < 12 * 3600000) return this.lastDomainResults || [];
    this.lastDomainCheck = now;

    let names = (this.cfg.watchDomains || []).map(registrableDomain);
    if (!names.length) {
      // Без изричен списък следим домейните, за които вече имаме сертификат.
      try {
        // „Безопасният" вариант и ТУК. Наивният `tlsCerts()` + мълчалив catch
        // беше същият клас тих провал, срещу който е построен целият модул:
        // не можеш да прочетеш сертификатите → списъкът домейни е празен →
        // алармата за изтичащ домейн просто изчезва, все едно всичко е наред.
        // Братският блок за `certDays` вече вдига `stale:` — този не вдигаше.
        const certs = await tlsCertsSafe();
        if (!certs.ok) {
          this.stale?.set('domain:', `сертификатите не се четат (${certs.error})`);
          return out;
        }
        names = [...new Set(certs.certs.map((c) => registrableDomain(c.domain)))];
      } catch (err) {
        this.stale?.set('domain:', err.message);
        return out;
      }
    }
    for (const name of [...new Set(names.filter(Boolean))].slice(0, 20)) {
      let info;
      try {
        info = await domainExpiry(name);
      } catch {
        continue;
      }
      if (!info.available) continue; // RDAP не отговаря за всяка зона — мълчим
      if (info.onHold) {
        out.push({
          key: `domain-hold:${name}`,
          severity: 'critical',
          title: `Домейнът ${name} е задържан (hold)`,
          body: `Статус: ${info.status.join(', ')}. При „hold" домейнът НЕ резолвва — сайтът е недостъпен, независимо че сървърът работи.`,
          sustain: false,
          repeatEvery: 24 * 3600000,
        });
      }
      if (info.daysLeft != null && info.daysLeft <= days) {
        out.push({
          key: `domain:${name}`,
          severity: info.daysLeft <= 7 ? 'critical' : 'warning',
          title: `Регистрацията на ${name} изтича след ${info.daysLeft} дни`,
          body: `Изтича на ${info.expiresAt}. Сертификатът не помага — при изтекъл домейн сайтът просто изчезва, а връщането е скъпо и бавно.`,
          sustain: false,
          repeatEvery: 24 * 3600000,
        });
      }
    }
    this.lastDomainResults = out;
    return out;
  }

  // „Кой известява за провала на известията." Аларма, тръгнала от двигателя и
  // непристигнала до никого, е равна на липсваща — а точно този провал е тих по
  // конструкция: Telegram блокиран от firewall, изтекъл ntfy токен, сгрешен
  // webhook URL. Тук няма канал, по който да го съобщим (те са счупени), затова
  // сигналът е СЪСТОЯНИЕ в панела: остава на екрана, докато не се оправи.
  //
  // Отделно: нула настроени канала не е грешка, а избор — но избор, който човек
  // прави случайно (инсталира и забравя). Казваме го веднъж, тихо.
  notifyChecks() {
    const out = [];
    // Провален пинг към външния наблюдател: НИЕ знаем, че сме живи, но той след
    // малко ще реши обратното (или, по-лошо, е спрял да ни чака). И двете
    // посоки на грешката са скъпи, затова се вижда веднага.
    if (this.cfg.alerts?.heartbeatUrl && this.lastHeartbeat && !this.lastHeartbeat.ok) {
      out.push({
        key: 'heartbeat:down',
        severity: 'warning',
        title: 'Мъртвецът-ключ не стига до наблюдателя',
        body:
          `Пингът се проваля (${this.lastHeartbeat.error || 'статус ' + this.lastHeartbeat.status}). ` +
          'Външният наблюдател ще вдигне тревога за нищо — или вече е спрял да ни чака. Провери адреса и изходящия достъп.',
        sustain: false,
      });
    }
    const channels = configuredChannels(this.cfg);
    const on = Object.entries(channels).filter(([, v]) => v).map(([k]) => k);
    if (!on.length) {
      out.push({
        key: 'notify:none',
        severity: 'info',
        title: 'Няма настроен канал за известия',
        body: 'Алармите се виждат само в този панел. Настрой Telegram/ntfy/webhook/имейл — иначе научаваш за проблема, когато сам отвориш екрана.',
        sustain: false,
        repeatEvery: 7 * 24 * 3600000,
      });
      return out;
    }
    const h = this.notifyHealth;
    if (!h || !h.attempted) return out;
    // Пропуснатите по праг канали НЕ са провалени — иначе праг „само критично"
    // би вдигал фалшива аларма при всяко „info" известие.
    if (h.delivered > 0) return out;
    out.push({
      key: 'notify:down',
      severity: 'critical',
      title: 'Известията не стигат до никого',
      body:
        `Последното известие (${new Date(h.ts).toLocaleString('bg-BG')}) не мина по нито един от ${h.attempted} канала: ` +
        `${(h.failures || []).join(', ') || 'без подробности'}. Този панел е единственото място, където виждаш алармите.`,
      sustain: false,
    });
    return out;
  }

  // 5xx от РЕАЛНИЯ трафик. Пробата пита един URL и вижда 200; потребителите в
  // същия момент може да получават 500 на checkout-а. Access log-ът е
  // единственият източник, който брои какво светът наистина е получил.
  //
  // Броим само НОВОТО от последната проверка (курсорът е на този четец) — иначе
  // едно старо избухване гърми вечно. Първото четене само зарежда курсора:
  // без това стартът на панела вдига аларма за 24 MB история.
  accessChecks() {
    const out = [];
    if (!this.accesslog || this.cfg.accesslog?.enabled === false) return out;
    let r;
    try {
      r = this.accesslog.analyze({ persist: true, limit: 10 });
    } catch (err) {
      if (this.accessPrimed) this.stale?.set('http5xx', err.message);
      return out;
    }
    if (!r.available) return out;
    if (!this.accessPrimed) {
      this.accessPrimed = true;
      return out; // първото четене е зареждане на курсора, не измерване
    }
    const minRequests = Number(this.cfg.accesslog?.minRequests) || 20;
    const pct = Number(this.cfg.accesslog?.errorPct) || 5;
    const windowMs = Math.max(60000, Number(this.cfg.accesslog?.windowMin || 10) * 60000);

    // ПЛЪЗГАЩ ПРОЗОРЕЦ, не „за този тик". Изискването „поне 20 заявки" в рамките
    // на един 60-секунден тик значи праг на видимост от близо 30 000 заявки на
    // ден — за medqr/panev/zabobovdol алармата просто нямаше да пламне никога.
    // Прозорецът е ВРЕМЕВИ; тиковете само пълнят кофи.
    //
    // Знаменателят е БЕЗ ботове: скенерите са десетки пъти повече от истинските
    // посетители на малък сайт и размиват дела 5xx точно когато има авария.
    const h = r.human || { total: r.total, byStatus: r.byStatus || {} };
    const nowMs = Date.now();
    (this.accessWindow ||= []).push({ ts: nowMs, total: h.total, server: Number(h.byStatus?.['5xx']) || 0 });
    // По-дълъг пръстен за сигнала „трафикът изчезна" (виж trafficDrop()).
    this.accessWindow = this.accessWindow.filter((b) => b.ts >= nowMs - Math.max(windowMs, 3600000));
    for (const c of this.trafficDrop(windowMs, nowMs)) out.push(c);
    const since = nowMs - windowMs;
    const win = this.accessWindow.filter((b) => b.ts >= since);
    const total = win.reduce((a, b) => a + b.total, 0);
    const server = win.reduce((a, b) => a + b.server, 0);
    if (total < minRequests || !server) return out;
    const rate = (server / total) * 100;
    if (rate < pct) return out;
    const top = (r.topByErrors || []).filter((p) => Object.keys(p.statuses || {}).some((s) => Number(s) >= 500)).slice(0, 3);
    out.push({
      key: 'http5xx',
      severity: rate >= pct * 2 ? 'critical' : 'warning',
      title: `${rate.toFixed(1)}% от заявките връщат 5xx`,
      // Прозорецът е достатъчно дълъг, за да не пламва от едно мигване — затова
      // няма нужда и от задържане отгоре (иначе закъснението се удвоява).
      sustain: false,
      body:
        `${server} сървърни грешки от ${total} заявки на истински посетители за последните ` +
        `${Math.round(windowMs / 60000)} мин (праг ${pct}%; ботовете не се броят).` +
        (top.length ? `\nНай-засегнати:\n${top.map((p) => `• ${p.method} ${safePath(p.path)} — ${p.errorPct}% от ${p.count}`).join('\n')}` : ''),
    });
    return out;
  }

  // ЧЕТВЪРТИЯТ златен сигнал: TRAFFIC. Досега го нямахме изобщо — и точно той е
  // единственият, който вижда клас провали, скрити за всичко останало.
  //
  // Синтетичната проба чука от САМАТА машина. Затова при изтекъл A запис, счупен
  // DNS, ufw правило, изтрит `server_name`, спрян CDN или блокиран порт при
  // доставчика тя вижда 200, продуктите са „нагоре", SLO бюджетът е непокътнат —
  // а светът получава нищо. Единственият видим белег е, че access log-ът СПИРА.
  //
  // Правилото е нарочно тъпо и затова надеждно: без сезонен модел, без EWMA.
  // Гърми само когато е имало ЯСЕН трафик и той е паднал на НУЛА. Тихата нощ на
  // малък сайт не го задейства (искаме съществен предходен обем), а бавният спад
  // съзнателно се пропуска — за него трябва история, каквато още нямаме.
  trafficDrop(windowMs, nowMs) {
    if (this.cfg.accesslog?.trafficDrop === false) return [];
    const w = this.accessWindow || [];
    const recentFrom = nowMs - windowMs;
    // Сравняваме с ПРЕДХОДНИЯ период, не с целия пръстен — иначе самият срив
    // разрежда собствената си базова линия и алармата се самогаси.
    const prior = w.filter((b) => b.ts < recentFrom);
    const recent = w.filter((b) => b.ts >= recentFrom);
    // Нужна е поне толкова история, колкото е прозорецът — иначе рестарт на
    // панела гърми веднага.
    if (!prior.length || prior[0].ts > nowMs - 3 * windowMs) return [];
    if (recent.length < 2) return [];
    const priorTotal = prior.reduce((a, b) => a + b.total, 0);
    const recentTotal = recent.reduce((a, b) => a + b.total, 0);
    const minPrior = Math.max(50, (Number(this.cfg.accesslog?.minRequests) || 20) * 5);
    if (priorTotal < minPrior || recentTotal > 0) return [];
    const mins = Math.round(windowMs / 60000);
    return [
      {
        key: 'traffic:zero',
        severity: 'critical',
        title: 'Трафикът падна до нула',
        body:
          `Нито една заявка от истински посетител за последните ${mins} мин, при ${priorTotal} преди това. ` +
          'Продуктите отговарят на пробата, защото тя чука отвътре — това е точно провалът, който тя НЕ вижда: ' +
          'изтекъл домейн/DNS, правило в защитната стена, изтрит server_name, спрян CDN или блокиран порт при доставчика.',
        sustain: false,
      },
    ];
  }

  // Redis изхвърля ключове ТИХО: няма грешка, няма ред в лога, услугата е жива.
  // Единственият видим белег е броячът, който расте — затова се мери разликата.
  async redisChecks() {
    if (this.cfg.redis?.enabled === false) return [];
    let now;
    try {
      const r = await redisOverview();
      // „Няма docker" е законно НЯМА; грешка от docker при вече познат Redis е
      // незнание — иначе eviction алармата се резолвва при трепнал docker.
      if (!r.available) {
        if (this.lastRedis?.length) this.stale?.set('redis-', `docker не отговори (${r.error || '?'})`);
        return [];
      }
      now = r.instances;
    } catch (err) {
      if (this.lastRedis?.length) this.stale?.set('redis-', err.message);
      return [];
    }
    const out = evictionChecks(this.lastRedis, now, { memPct: Number(this.cfg.redis?.memPct) || 90 });
    this.lastRedis = now;
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
        values: points.map(memPercent).filter((v) => v !== null),
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

    // Собствената дупка: между две оценки е минало много повече от каданса.
    // Процесът е бил спрян, машината — приспана, или `evaluate()` е висяло.
    // Това е ПРОПУСНАТ период, не текущо състояние → еднократно събитие, не
    // аларма, която да се „възстановява". Казваме го, защото мълчанието в този
    // интервал не е доказателство, че всичко е било наред.
    const gapMs = this.lastEvalAt ? now - this.lastEvalAt : 0;
    const maxGap = Math.max(5 * (this.intervalMs || 60000), 10 * 60000);
    if (gapMs > maxGap) {
      await this.event({
        key: 'monitor:gap',
        severity: 'warning',
        title: 'Мониторингът е мълчал',
        body:
          `Между две проверки минаха ${fmtDuration(gapMs)} (каданс ${Math.round((this.intervalMs || 60000) / 1000)}s). ` +
          'През това време не е имало кой да види проблем — провери дали услугата е рестартирала или сървърът е бил спрян.',
      });
    }

    const conditions = await this.collect();

    // „Не знам" НЕ е „възстановено". Ключ от източник, който не е отговорил,
    // остава активен и НЕ праща фалшиво „Възстановено".
    //
    // Тези условия се добавят ПРЕДИ цикъла за пламване. По-рано бяха след него —
    // тогава потискането на резолва работеше, но самата аларма „Липсва
    // телеметрия" физически не можеше да пламне: човекът виждаше аларми, които
    // висят вечно, без нито един ред за причината. Мълчаливият пазач е по-лош от
    // липсващия, защото изглежда като работещ.
    const stale = this.stale || new Map();
    for (const [prefix, reason] of stale) {
      const affected = [...this.active.keys()].filter((k) => k.startsWith(prefix)).length;
      conditions.push({
        key: `stale:${prefix}`,
        severity: affected ? 'warning' : 'info',
        title: `Липсва телеметрия: ${prefix.replace(':', '')}`,
        body: `${reason}. ${affected ? `${affected} активни аларми остават в сила — не знаем дали са отпаднали.` : 'Няма активни аларми от този източник, но проверката не работи.'}`,
        sustain: false,
      });
    }

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

      // СЪБИТИЕ, не състояние. OOM, препълнена опашка и рестарт-цикъл се мерят по
      // РАЗЛИКА между две проверки: следващия път разликата е 0, ключът изчезва и
      // предишният код пращаше „Възстановено: Ядрото уби процес заради памет".
      // Второто известие е чиста лъжа — нищо не се е възстановило, просто повече
      // не се е случило. Тези условия минават през дневника и известието, но НЕ
      // влизат в активните.
      if (c.transient) {
        const lastSeen = this.transientSeen?.get(c.key) || 0;
        if (now - lastSeen >= cooldownMs) {
          (this.transientSeen ||= new Map()).set(c.key, now);
          events.push({ type: 'firing', ...c, oneShot: true });
        }
        continue;
      }

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
        // Заглавието също се обновява: „12.5% от заявките връщат 5xx" и „изтича
        // след 9 дни" са ЖИВИ числа. Без този ред панелът показваше стойността
        // от момента на пламване, а тялото — днешната, и двете си противоречаха.
        prev.title = c.title;
        prev.body = c.body;
        // Повторението е съразмерно на ВРЕМЕТО ЗА ДЕЙСТВИЕ, не на един плосък
        // час. Изтичащ след 30 дни домейн, напомнян на всеки час, е 720
        // критични съобщения — точно начинът да приучиш човека да мълчи канала.
        const repeatMs = Number(c.repeatEvery) || cooldownMs;
        if (now - prev.lastNotified >= repeatMs) {
          prev.lastNotified = now;
          events.push({ type: 'firing', ...c, repeat: true });
        }
      }
    }

    // Възстановени.
    //
    // Хистерезисът е СИМЕТРИЧЕН. Пламването иска `sustainSamples` съвпадения; ако
    // отпадането ставаше от една несъвпаднала проверка (както беше), осцилиращо
    // около прага условие произвежда безкрайни двойки „пламна/възстанови се" —
    // и то без cooldown, защото резолвът не минава през него. Две последователни
    // чисти проверки са евтина цена срещу този вид спам.
    const holdDown = Math.max(1, Number(cfg.alerts.resolveSamples) || 2);
    this.misses ||= new Map();
    for (const key of [...this.misses.keys()]) if (byKey.has(key)) this.misses.delete(key);
    for (const [key, prev] of [...this.active]) {
      if (byKey.has(key)) continue;
      if ([...stale.keys()].some((prefix) => key.startsWith(prefix))) continue; // мълчащ източник
      const miss = (this.misses.get(key) || 0) + 1;
      this.misses.set(key, miss);
      if (miss < holdDown) continue;
      this.misses.delete(key);
      this.active.delete(key);
      events.push({
        type: 'resolved',
        key,
        severity: 'ok',
        // Тежестта на ТОВА, което се вдига — иначе канал с праг „само критично"
        // получава алармата, но не и нейния край.
        wasSeverity: prev.severity,
        title: `Възстановено: ${prev.title}`,
        body: `Проблемът от ${new Date(prev.since).toLocaleString('bg-BG')} вече го няма.`,
      });
    }

    for (const ev of events) await this.dispatch(ev);
    this.lastEvalAt = Date.now();
    this.lastEvalError = null;
    this.save();
    // Мъртвецът-ключ: външният наблюдател чака този пинг. Спре ли — вдига
    // тревога ВМЕСТО нас. Това е единствената защита срещу тихо умрял панел.
    this.ping({ ok: true });
    await this.expireMaintenance();
    return { firing: this.listActive(), events };
  }

  // Изтекла поддръжка се чисти САМА и завършва с обобщение — човекът, който е
  // забравил да я изключи, получава точно съобщението „приключи; ето какво е
  // активно", а не вечна тишина.
  async expireMaintenance() {
    const m = this.cfg.alerts?.maintenance;
    if (!m?.until || Number(m.until) > Date.now()) return;
    const active = this.listActive();
    const worst = active.filter((a) => a.severity === 'critical').length;
    const suppressed = this.maintSuppressed || 0;
    this.maintSuppressed = 0;
    try {
      this.saveConfig?.(this.cfg, { alerts: { ...this.cfg.alerts, maintenance: null } });
    } catch {
      this.cfg.alerts.maintenance = null;
    }
    this.audit?.log({ action: 'alerts.maintenance.expired', suppressed });
    await this.event({
      key: 'maintenance:done',
      severity: worst ? 'critical' : 'info',
      title: 'Поддръжката приключи',
      body: `Потиснати известия: ${suppressed}. Активни аларми сега: ${active.length} (критични: ${worst}).${worst ? ' Виж панела.' : ''}`,
    });
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

    // Поддръжка: НИЩО не тръгва навън (вкл. „възстановено" — след края
    // обобщението казва какво е активно). Мъртвецът-ключ НЕ минава оттук —
    // пингът към външния наблюдател продължава: поддръжката спира шума към
    // човека, не пулса на пазача.
    if (this.maintenance() && ev.type !== 'test') {
      entry.maintenance = true;
      entry.sent = [];
      this.maintSuppressed = (this.maintSuppressed || 0) + 1;
      return entry;
    }

    // Заглушено: остава в дневника и в панела, само известието не тръгва.
    // Тихо изхвърляне без следа е начинът да не разбереш, че си сляп.
    const silence = ev.key ? this.silencedBy(ev.key) : null;
    if (silence) {
      entry.silenced = { until: silence.until, note: silence.note || null };
      entry.sent = [];
      return entry;
    }

    // „Аномалиите не будят човек" беше КОМЕНТАР, не механизъм: тежестта им е
    // `info`, но празният праг по канал (подразбирането) пуска всичко — значи
    // на чиста инсталация „нетипично поведение на процесора" влизаше в Telegram
    // като нормално съобщение. Точно това е класическият източник на умора от
    // известия. `info` живее в панела и в дневника; на телефона отива само
    // изрично (`alerts.notifyInfo`).
    if (ev.severity === 'info' && !this.cfg.alerts?.notifyInfo && ev.type !== 'test') {
      entry.sent = [];
      entry.infoOnly = true;
      return entry;
    }

    const results = await notify(this.cfg, ev);
    const real = results.filter((r) => !r.skipped);
    entry.sent = results.filter((r) => r.ok && !r.skipped).map((r) => r.channel);
    entry.skipped = results.filter((r) => r.skipped).map((r) => r.channel);
    entry.failed = real.filter((r) => !r.ok).map((r) => `${r.channel}:${r.error || r.status}`);
    // Здравето се мери само когато НАИСТИНА е имало опит: известие, изцяло
    // отсято по праг, не е доказателство нито за живи, нито за мъртви канали.
    if (real.length) {
      this.notifyHealth = {
        ts: Date.now(),
        attempted: real.length,
        delivered: entry.sent.length,
        failures: entry.failed,
      };
    }
    return entry;
  }

  listActive() {
    return [...this.active.entries()].map(([key, v]) => ({ key, ...v, silenced: this.silencedBy(key) || null }));
  }

  // Здравето на САМИЯ мониторинг — за панела и за другия VPS. „Няма аларми"
  // значи нещо съвсем различно според това дали проверката върви или е спряла.
  health() {
    const now = Date.now();
    const interval = this.intervalMs || Math.max(30, Number(this.cfg.alerts?.checkIntervalSec) || 60) * 1000;
    const ageMs = this.lastEvalAt ? now - this.lastEvalAt : null;
    return {
      enabled: Boolean(this.cfg.alerts?.enabled),
      lastEvalAt: this.lastEvalAt,
      ageMs,
      intervalMs: interval,
      // „Свежо" = не по-старо от два каданса. Първото пускане (null) не е провал.
      fresh: this.lastEvalAt == null ? null : ageMs <= interval * 2 + 15000,
      lastEvalError: this.lastEvalError,
      // „Настроен" и „работи" са различни неща — и второто е единственото, което
      // има значение за мъртвец-ключ. `pinged` е null, докато няма опит.
      heartbeat: Boolean(this.cfg.alerts?.heartbeatUrl),
      heartbeatOk: this.lastHeartbeat ? this.lastHeartbeat.ok && now - this.lastHeartbeat.ts <= interval * 2 + 15000 : null,
      lastHeartbeat: this.lastHeartbeat || null,
      notify: this.notifyHealth,
      channels: configuredChannels(this.cfg),
      silences: this.silences(),
    };
  }
}

const SEV_ORDER = { ok: 0, info: 1, warning: 2, critical: 3 };
export function worst(...severities) {
  return severities.reduce((a, b) => ((SEV_ORDER[b] ?? 0) > (SEV_ORDER[a] ?? 0) ? b : a), 'info');
}

function fmtGb(bytes) {
  const gb = (Number(bytes) || 0) / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round((Number(bytes) || 0) / 1024 ** 2)} MB`;
}

// Тест-достъпна чиста логика: решава дали условие трябва да пламне сега.
export function shouldFire({ sustain, streak, need }) {
  return sustain === false || streak >= need;
}
