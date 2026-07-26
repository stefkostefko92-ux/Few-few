// „Разследване" — какво се е случило около момента, в който нещо се е счупило.
//
// Въпросът при инцидент почти никога не е „колко е процесорът". Той е: **какво
// се промени?** Отговорът е разпръснат между четири източника — метрики, одит
// (кой какво пипна), деплои и аларми — и събирането им на ръка отнема точно
// времето, в което сървърът е долу.
//
// Затова тук няма нищо ново: само сглобяване на вече събраното в ЕДНА времева
// линия около избран момент, плюс автоматично намиране на момента (CUSUM), ако
// човекът не знае кога е започнало.
//
// Съзнателно НЕ твърди причинност. Показва съвпадения по време и оставя
// заключението на човека — „деплой 40 секунди преди скока" е улика, не присъда.
import { changePoint, fmtDuration } from './forecast.js';

const SERIES = {
  cpu: { label: 'процесор', get: (p) => p.cpu, unit: '%' },
  memory: { label: 'памет', get: (p) => (p.memTotal ? (p.memUsed / p.memTotal) * 100 : null), unit: '%' },
  disk: { label: 'диск', get: (p) => p.diskMax ?? null, unit: '%' },
  load: { label: 'натоварване', get: (p) => p.load1 ?? null, unit: '' },
};

// Намира най-ранния момент на промяна измежду сериите — предположение за
// „кога е започнало", когато човекът не знае.
export function findIncident(points, { window = null } = {}) {
  const candidates = [];
  for (const [key, s] of Object.entries(SERIES)) {
    const series = points
      .map((p) => ({ x: new Date(p.ts).getTime(), y: s.get(p) }))
      .filter((p) => typeof p.y === 'number' && Number.isFinite(p.y));
    if (series.length < 20) continue;
    const cp = changePoint(series);
    if (cp) candidates.push({ series: key, label: s.label, at: cp.at, atMs: new Date(cp.at).getTime(), cusum: cp.cusum });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.atMs - b.atMs);
  const first = candidates[0];
  return {
    at: first.at,
    atMs: first.atMs,
    series: first.series,
    label: first.label,
    // Няколко серии, които се чупят заедно, са много по-силен сигнал от една.
    corroborated: candidates.filter((c) => Math.abs(c.atMs - first.atMs) < (window || 15 * 60000)).map((c) => c.label),
    all: candidates,
  };
}

// Одитните действия, които реално ПРОМЕНЯТ машината. Четенето не влиза — иначе
// времевата линия се удавя в „някой отвори секцията".
const MUTATING = /^(service|docker|compose|deploy|rollback|power|firewall|webserver|file|env|limits|cron|timer|backup|db|terminal|pty|agents|totp|settings|integrity|fail2ban|domains)\./;
// Изваждаме четящите глаголи: префиксът сам по себе си не стига („file.view" и
// „env.reveal" носят същия префикс като записа, но не променят нищо).
const READ_ONLY = /\.(view|read|reveal|status|list|verify)$|[Pp]review$/;

export function isMutatingAction(action) {
  const a = String(action || '');
  return MUTATING.test(a) && !READ_ONLY.test(a);
}

export function timeline({ at, windowMs = 30 * 60000, audit = [], alerts = [], releases = [], jobs = [] }) {
  const center = new Date(at).getTime();
  const from = center - windowMs;
  const to = center + windowMs;
  const events = [];
  const inWindow = (ts) => {
    const t = new Date(ts).getTime();
    return Number.isFinite(t) && t >= from && t <= to;
  };

  for (const e of audit) {
    if (!inWindow(e.ts) || !isMutatingAction(e.action)) continue;
    events.push({
      kind: 'одит',
      ts: e.ts,
      title: e.action,
      // Одитът никога не носи тайни (виж audit.js) — тук просто го показваме.
      detail: [e.unit, e.container, e.project, e.name, e.path, e.target, e.ip].filter(Boolean).join(' · ') || null,
      user: e.user || null,
    });
  }
  for (const a of alerts) {
    if (!inWindow(a.ts)) continue;
    events.push({ kind: a.type === 'resolved' ? 'възстановено' : 'аларма', ts: a.ts, title: a.title, detail: a.body?.slice(0, 200) || null, severity: a.severity });
  }
  for (const r of releases) {
    if (!inWindow(r.deployedAt || r.mtime)) continue;
    events.push({ kind: 'деплой', ts: r.deployedAt || r.mtime, title: `release ${r.name}`, detail: r.current ? 'текущият' : null });
  }
  for (const j of jobs) {
    if (!inWindow(j.startedAt)) continue;
    events.push({
      kind: 'задача',
      ts: j.startedAt,
      title: j.title,
      detail: j.code === 0 ? 'успех' : j.code == null ? 'върви' : `изход ${j.code}`,
      failed: j.code != null && j.code !== 0,
    });
  }

  events.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return events.map((e) => {
    const delta = new Date(e.ts).getTime() - center;
    return {
      ...e,
      offsetMs: delta,
      // „40 секунди ПРЕДИ" е уликата; „след" е обикновено следствие.
      when: delta === 0 ? 'в момента' : delta < 0 ? `${fmtDuration(-delta)} преди` : `${fmtDuration(delta)} след`,
      before: delta < 0,
    };
  });
}

// Извлича стойностите на сериите около момента — за графиката на разследването.
export function seriesAround(points, at, windowMs) {
  const center = new Date(at).getTime();
  const from = center - windowMs;
  const to = center + windowMs;
  const out = {};
  for (const [key, s] of Object.entries(SERIES)) {
    out[key] = {
      label: s.label,
      unit: s.unit,
      points: points
        .map((p) => ({ x: new Date(p.ts).getTime(), y: s.get(p) }))
        .filter((p) => p.x >= from && p.x <= to && typeof p.y === 'number' && Number.isFinite(p.y)),
    };
  }
  return out;
}

// Кратък извод на български — какво изпъква. Пак БЕЗ твърдение за причина.
export function summarize(incident, events) {
  const bits = [];
  if (incident) {
    bits.push(
      incident.corroborated.length > 1
        ? `Промяна около ${new Date(incident.at).toLocaleString('bg-BG')} едновременно в: ${incident.corroborated.join(', ')}.`
        : `Промяна в ${incident.label} около ${new Date(incident.at).toLocaleString('bg-BG')}.`
    );
  }
  const before = events.filter((e) => e.before);
  const deploys = before.filter((e) => e.kind === 'деплой' || /deploy|rollback/.test(e.title || ''));
  const changes = before.filter((e) => e.kind === 'одит');
  const failures = events.filter((e) => e.failed);
  if (deploys.length) bits.push(`Деплой ${deploys[deploys.length - 1].when} — първото място, където да погледнеш.`);
  if (changes.length) bits.push(`${changes.length} промени по машината преди момента (${changes.slice(-3).map((c) => c.title).join(', ')}).`);
  if (failures.length) bits.push(`${failures.length} провалени задачи в прозореца.`);
  if (!bits.length) return 'Нищо не изпъква в този прозорец — нито деплой, нито промяна по машината. Разшири прозореца или виж журнала.';
  bits.push('Това са съвпадения по време, не доказана причина.');
  return bits.join(' ');
}
