import db from './db.js';

// Записва събитие по сигурността/поверителността. clientIp извлича реалния адрес
// (зад reverse proxy като този на Hetzner) за одит и разследване на инциденти.
export function clientIp(req) {
  return (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').trim();
}

export function audit(req, event, { userId = null, detail = null } = {}) {
  const uid = userId ?? req?.user?.id ?? null;
  db.prepare(
    'INSERT INTO audit_log (user_id, event, detail, ip) VALUES (?, ?, ?, ?)'
  ).run(uid, event, detail, req ? clientIp(req) : null);
}
