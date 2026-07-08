// Собствени бутони/връзки на визитката.
import db from './db.js';

export const MAX_LINKS = 12;

export const getLinks = (profileId) =>
  db
    .prepare(
      'SELECT id, icon, label, url FROM links WHERE profile_id = ? ORDER BY sort_order ASC, id ASC'
    )
    .all(profileId);

// Замества всички връзки на профила с подадения списък (в реда, в който е).
export function replaceLinks(profileId, links) {
  const del = db.prepare('DELETE FROM links WHERE profile_id = ?');
  const ins = db.prepare(
    'INSERT INTO links (profile_id, icon, label, url, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    del.run(profileId);
    links.slice(0, MAX_LINKS).forEach((l, i) => ins.run(profileId, l.icon, l.label, l.url, i));
  });
  tx();
}

// Извлича връзките от индексираните полета на формата (link_url_0, link_label_0…).
export function parseLinkFields(body) {
  const out = [];
  for (let i = 0; i < MAX_LINKS; i++) {
    const url = String(body[`link_url_${i}`] || '').trim();
    if (!url) continue;
    if (!/^https?:\/\//i.test(url))
      return { error: 'Връзките трябва да започват с http:// или https://.' };
    out.push({
      icon: String(body[`link_icon_${i}`] || '')
        .trim()
        .slice(0, 8),
      label:
        String(body[`link_label_${i}`] || '')
          .trim()
          .slice(0, 60) || url.replace(/^https?:\/\//, ''),
      url: url.slice(0, 300),
    });
  }
  return { links: out };
}
