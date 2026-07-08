// Рекламни банери — заявки и броячи. First-party, без чужди тракери.
import db from './db.js';

// Активните банери за дадено място, подредени. Записва импресия за всеки показан.
export function activeBanners(placement = 'home') {
  const rows = db
    .prepare(
      `SELECT id, image, alt, link_url FROM banners
       WHERE placement = ? AND is_active = 1 AND image != ''
       ORDER BY sort_order ASC, id ASC`
    )
    .all(placement);
  if (rows.length) {
    const ids = rows.map((b) => b.id).join(',');
    db.exec(`UPDATE banners SET impressions = impressions + 1 WHERE id IN (${ids})`);
  }
  return rows;
}

// Регистрира клик и връща валидна цел за пренасочване (или null).
export function clickBanner(id) {
  const banner = db.prepare('SELECT link_url FROM banners WHERE id = ?').get(id);
  if (!banner) return null;
  db.prepare('UPDATE banners SET clicks = clicks + 1 WHERE id = ?').run(id);
  return /^https?:\/\//i.test(banner.link_url) ? banner.link_url : null;
}

export const allBanners = () =>
  db.prepare('SELECT * FROM banners ORDER BY sort_order ASC, id ASC').all();

export const getBanner = (id) => db.prepare('SELECT * FROM banners WHERE id = ?').get(id);
