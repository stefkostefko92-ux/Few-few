// Дневна статистика на визитката — само брой преглеждания на ден, без лични данни.
// Повторните посещения се отсяват преди това (public.js, хеш само в паметта).
import db from './db.js';

const bump = db.prepare(
  `INSERT INTO profile_views_daily (profile_id, day, views) VALUES (?, date('now'), 1)
   ON CONFLICT(profile_id, day) DO UPDATE SET views = views + 1`
);

export function recordView(profileId) {
  db.prepare('UPDATE profiles SET views = views + 1 WHERE id = ?').run(profileId);
  bump.run(profileId);
}

/**
 * Последните `days` дни (включително днес, UTC), всеки ден присъства — и дните без
 * преглеждания (0), иначе графиката лъже с липсващи точки.
 */
export function dailyViews(profileId, days = 30) {
  const rows = db
    .prepare(
      `SELECT day, views FROM profile_views_daily
        WHERE profile_id = ? AND day >= date('now', ?)`
    )
    .all(profileId, `-${days - 1} days`);
  const byDay = new Map(rows.map((r) => [r.day, r.views]));
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i)
    );
    const day = d.toISOString().slice(0, 10);
    out.push({ day, views: byDay.get(day) || 0 });
  }
  return out;
}

// Готова за изгледа графика: точки за SVG (без JavaScript — CSP-безопасно) + сборове.
export function viewsChart(profileId, days = 30) {
  const series = dailyViews(profileId, days);
  const max = Math.max(1, ...series.map((p) => p.views));
  const W = 300;
  const H = 64;
  const step = W / (series.length - 1);
  const points = series.map((p, i) => [
    Math.round(i * step * 10) / 10,
    Math.round((H - (p.views / max) * (H - 4) - 2) * 10) / 10,
  ]);
  const line = points.map(([x, y]) => `${x},${y}`).join(' ');
  const sum = (n) => series.slice(-n).reduce((a, p) => a + p.views, 0);
  return {
    series,
    max,
    width: W,
    height: H,
    line,
    area: `0,${H} ${line} ${W},${H}`,
    last7: sum(7),
    last30: sum(30),
    // Предходните 7 дни — за посоката („+3 спрямо предишната седмица“).
    prev7: series.slice(-14, -7).reduce((a, p) => a + p.views, 0),
  };
}
