import { createHash } from 'node:crypto';
import db from './db.js';

// Извлича реалния клиентски IP (зад reverse proxy като Hetzner).
export function clientIp(req) {
  return (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').trim();
}

// Записва събитие по сигурността/поверителността в tamper-evident верига:
// hash = SHA-256(prev_hash + at + user_id + event + detail + ip). Промяна на
// стар запис би счупила веригата надолу и се открива от verifyAuditChain().
export function audit(req, event, { userId = null, detail = null } = {}) {
  const uid = userId ?? req?.user?.id ?? null;
  const ip = req ? clientIp(req) : null;
  const at = new Date().toISOString();
  const prev = db.prepare('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
  const prevHash = prev?.hash || '';
  const hash = createHash('sha256')
    .update(`${prevHash}|${at}|${uid ?? ''}|${event}|${detail ?? ''}|${ip ?? ''}`)
    .digest('hex');
  db.prepare(
    'INSERT INTO audit_log (user_id, event, detail, ip, at, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(uid, event, detail, ip, at, prevHash, hash);
}

// Проверява целостта на одит веригата. Връща { ok, brokenAt }.
export function verifyAuditChain() {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id ASC').all();
  let prevHash = '';
  for (const r of rows) {
    const expected = createHash('sha256')
      .update(`${prevHash}|${r.at}|${r.user_id ?? ''}|${r.event}|${r.detail ?? ''}|${r.ip ?? ''}`)
      .digest('hex');
    if (r.prev_hash !== prevHash || r.hash !== expected) {
      return { ok: false, brokenAt: r.id };
    }
    prevHash = r.hash;
  }
  return { ok: true, brokenAt: null };
}
