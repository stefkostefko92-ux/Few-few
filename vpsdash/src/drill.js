// Проба за възстановяване („restore drill") и следене за ЛИПСВАЩ бекъп.
//
// Индустриалното правило е кратко: **бекъп, който никога не си възстановявал, не
// е бекъп.** Двата тихи провала, които това затваря:
//
//  1. **Бекъпът е спрял.** Кронът е паднал, дискът се е напълнил, ключът е
//     изтекъл — а никой не разбира, защото липсата на файл не вдига грешка.
//     Затова алармата е по ВЪЗРАСТТА на най-новия бекъп, не по „мина ли".
//  2. **Бекъпът е боклук.** Файлът е там, с правдоподобен размер, но е отрязан
//     или повреден. Единственият начин да се разбере е да се възстанови — затова
//     пробата е планирана, не „като се сетя".
//
// Пробата пипа само /tmp: разопакова, проверява целостта, брои таблици и трие.
// Живото остава недокоснато — иначе „проверката" сама става инцидент.
import fs from 'node:fs';
import path from 'node:path';
import { listDumps, restorePreviewSpec, resticConfigured } from './backups.js';

const STATE = 'drill.json';
const DAY_MS = 24 * 3600000;

export function newestDump() {
  const dumps = listDumps();
  if (!dumps.length) return null;
  // listDumps подрежда по mtime низходящо, но не разчитаме на това мълчаливо.
  return dumps.reduce((a, b) => (a.mtime > b.mtime ? a : b));
}

export function backupAge(now = Date.now()) {
  const newest = newestDump();
  if (!newest) return { hasBackup: false, ageDays: null, newest: null };
  const ageMs = now - new Date(newest.mtime).getTime();
  return {
    hasBackup: true,
    newest: newest.name,
    at: newest.mtime,
    sizeBytes: newest.sizeBytes,
    ageDays: Math.round((ageMs / 86400000) * 10) / 10,
    ageMs,
    // Празен/подозрително малък файл е същото като липсващ бекъп — само по-коварно.
    suspiciouslySmall: newest.sizeBytes < 1024,
  };
}

export class DrillStore {
  constructor(stateDir) {
    this.file = path.join(stateDir, STATE);
    this.state = this.load();
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return { lastRunAt: null, lastOkAt: null, lastResult: null, history: [] };
    }
  }

  save() {
    try {
      this.state.history = (this.state.history || []).slice(-30);
      fs.writeFileSync(this.file, JSON.stringify(this.state), { mode: 0o600 });
    } catch {
      /* best-effort */
    }
  }

  record({ ok, name, output, code }) {
    const entry = {
      ts: new Date().toISOString(),
      ok: Boolean(ok),
      dump: name || null,
      code: code ?? null,
      // Пазим само опашката на изхода — достатъчно за диагноза, без да расте.
      output: String(output || '').slice(-1200),
    };
    this.state.lastRunAt = entry.ts;
    this.state.lastResult = entry;
    if (ok) this.state.lastOkAt = entry.ts;
    this.state.history = [...(this.state.history || []), entry];
    this.save();
    return entry;
  }

  // Кога следва проба. Отделен, по-бавен каданс от алармите — пробата е скъпа.
  due(intervalDays = 30, now = Date.now()) {
    if (!this.state.lastRunAt) return true;
    return now - new Date(this.state.lastRunAt).getTime() >= intervalDays * 86400000;
  }

  status(cfg) {
    const age = backupAge();
    const drill = this.state.lastResult;
    const okAgeDays = this.state.lastOkAt
      ? Math.round(((Date.now() - new Date(this.state.lastOkAt).getTime()) / 86400000) * 10) / 10
      : null;
    return {
      backup: age,
      restic: resticConfigured(cfg),
      maxAgeDays: Number(cfg?.backups?.maxAgeDays ?? 2),
      drillIntervalDays: Number(cfg?.backups?.drillIntervalDays ?? 30),
      drillEnabled: cfg?.backups?.drillEnabled !== false,
      lastRunAt: this.state.lastRunAt,
      lastOkAt: this.state.lastOkAt,
      lastOkAgeDays: okAgeDays,
      lastResult: drill,
      history: (this.state.history || []).slice(-10).reverse(),
      due: this.due(Number(cfg?.backups?.drillIntervalDays ?? 30)),
    };
  }
}

// Задачата за пробата — най-новият дъмп минава през същия преглед, който човек
// би пуснал ръчно. Ако няма какво да се пробва, това САМО по себе си е находка.
export function drillSpec() {
  const newest = newestDump();
  if (!newest) {
    throw Object.assign(new Error('Няма нито един бекъп за проба — това е находката.'), { status: 400 });
  }
  const spec = restorePreviewSpec(newest.name);
  return { ...spec, title: `Проба за възстановяване: ${newest.name}`, dumpName: newest.name };
}

// Правилата за аларма. Отделени от alerts.js, за да са тестваеми без система.
export function backupChecks(cfg, drillStore, now = Date.now()) {
  const out = [];
  if (cfg?.backups?.alertEnabled === false) return out;
  // Хоризонтът на бекъп-алармите е ДНИ, не минути → повторно известие веднъж на
  // 24 часа. При плоския час провалената проба (каданс 30 дни) даваше стотици
  // критични съобщения до ръчна успешна проба — най-сигурният начин каналът да
  // бъде заглушен завинаги.
  const maxAgeDays = Number(cfg?.backups?.maxAgeDays ?? 2);
  const age = backupAge(now);

  if (!age.hasBackup) {
    out.push({
      key: 'backup:missing',
      severity: 'critical',
      title: 'Няма нито един бекъп',
      body: 'В папката с дъмпове няма нищо. Пусни „Снимка на всички бази" от панела и нагласи крон/таймер — иначе възстановяване няма от какво да стане.',
      sustain: false,
        repeatEvery: DAY_MS,
    });
  } else {
    if (age.ageDays > maxAgeDays) {
      out.push({
        key: 'backup:stale',
        severity: age.ageDays > maxAgeDays * 3 ? 'critical' : 'warning',
        title: `Бекъпът е на ${age.ageDays} дни`,
        body: `Най-новият е „${age.newest}" от ${age.at} (праг ${maxAgeDays} дни). Ако задачата е спряла, ще разбереш чак в деня, в който ти трябва.`,
        sustain: false,
        repeatEvery: DAY_MS,
      });
    }
    if (age.suspiciouslySmall) {
      out.push({
        key: 'backup:empty',
        severity: 'critical',
        title: 'Последният бекъп е практически празен',
        body: `„${age.newest}" е ${age.sizeBytes} байта. Файл със същото име и нула съдържание е по-опасен от липсващ — изглежда като успех.`,
        sustain: false,
        repeatEvery: DAY_MS,
      });
    }
  }

  // Провалена или никога непускана проба.
  const st = drillStore?.state;
  if (cfg?.backups?.drillEnabled !== false && st) {
    if (st.lastResult && !st.lastResult.ok) {
      out.push({
        key: 'backup:drill',
        severity: 'critical',
        title: 'Пробата за възстановяване се провали',
        body: `Последната проба (${st.lastResult.ts}) не мина. Бекъпът съществува, но не е доказано, че се възстановява.\n${String(st.lastResult.output || '').slice(-400)}`,
        sustain: false,
        repeatEvery: DAY_MS,
      });
    } else if (st.lastOkAt) {
      const days = (now - new Date(st.lastOkAt).getTime()) / 86400000;
      const interval = Number(cfg?.backups?.drillIntervalDays ?? 30);
      if (days > interval * 2) {
        out.push({
          key: 'backup:drill-old',
          severity: 'warning',
          title: `От ${Math.round(days)} дни няма успешна проба за възстановяване`,
          body: `Каданс ${interval} дни. Бекъп, който никога не си възстановявал, е обещание, не гаранция.`,
          sustain: false,
        repeatEvery: DAY_MS,
        });
      }
    }
  }
  return out;
}
