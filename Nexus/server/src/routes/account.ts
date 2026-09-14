import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { passwordRule, PASSWORD_BCRYPT_ROUNDS } from './auth';
import { eraseUser } from '../lib/erasure';

const router = Router();
router.use(authRequired);

router.get('/me', (req, res) => {
  const db = getDb();
  const user = db
    .prepare('SELECT id, username, email, created_at, is_admin FROM users WHERE id = ?')
    .get(req.auth!.uid) as { id: number; username: string; email: string; created_at: number; is_admin: number } | undefined;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const charCount = (db.prepare('SELECT COUNT(*) AS c FROM characters WHERE user_id = ?').get(req.auth!.uid) as { c: number }).c;
  res.json({ user, hasCharacter: charCount > 0 });
});

const changePwSchema = z.object({
  current: z.string().min(1),
  next: passwordRule,
});

router.post('/password', async (req, res) => {
  const parse = changePwSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  const db = getDb();
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.auth!.uid) as { password_hash: string } | undefined;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const ok = await bcrypt.compare(parse.data.current, user.password_hash);
  if (!ok) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }
  const hash = await bcrypt.hash(parse.data.next, PASSWORD_BCRYPT_ROUNDS);
  // Bump token_version so every JWT issued under the old password is
  // immediately revoked — this IS the documented "I think my account
  // was compromised" recovery path; without the bump a stolen token
  // outlives the rotation.
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?')
    .run(hash, req.auth!.uid);
  res.json({ ok: true });
});

const deleteCharSchema = z.object({
  confirm: z.literal('DELETE'),
});

router.post('/delete-character', (req, res) => {
  const parse = deleteCharSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Type DELETE to confirm.' });
    return;
  }
  const db = getDb();
  // schema.ts:6 sets PRAGMA foreign_keys=ON, so the ON DELETE CASCADE on
  // characters(id) cascades to inventory / mail / quest_log / combat_log
  // / achievements / bestiary / guild_members / character_stats / purchases.
  // Marketplace listings cascade on seller_id; auction_listings.bidder_id
  // is SET NULL. The only thing we need to do explicitly is cancel any
  // active marketplace listing so the buyer doesn't see a ghost.
  const tx = db.transaction((userId: number) => {
    db.prepare(
      `UPDATE marketplace_listings
         SET status = 'cancelled'
       WHERE seller_id IN (SELECT id FROM characters WHERE user_id = ?)
         AND status = 'active'`,
    ).run(userId);
    db.prepare('DELETE FROM characters WHERE user_id = ?').run(userId);
  });
  tx(req.auth!.uid);
  res.json({ ok: true });
});

/**
 * GDPR Art. 20 — Right to data portability.
 * Returns a JSON dump of every row tied to the calling user. Caller can
 * download it from the client and feed it to any other service. Sensitive
 * fields (password hash, tokens) are stripped.
 */
router.get('/export', (req, res) => {
  const db = getDb();
  const userId = req.auth!.uid;
  const user = db
    .prepare(
      `SELECT id, username, email, created_at, is_admin, email_verified, email_verified_at
         FROM users WHERE id = ?`,
    )
    .get(userId) as Record<string, unknown> | undefined;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const characters = db.prepare('SELECT * FROM characters WHERE user_id = ?').all(userId) as Array<{ id: number }>;
  const charIds = characters.map((c) => c.id);
  const collect = (sql: string) =>
    charIds.length === 0
      ? []
      : (db
          .prepare(sql + ` WHERE character_id IN (${charIds.map(() => '?').join(',')})`)
          .all(...charIds) as Record<string, unknown>[]);
  const purchases = db
    .prepare('SELECT id, character_id, amount_cents, currency, status, created_at, completed_at FROM purchases WHERE character_id IN (' + (charIds.length ? charIds.map(() => '?').join(',') : 'NULL') + ')')
    .all(...charIds) as Record<string, unknown>[];
  res.setHeader('Content-Disposition', `attachment; filename="nexus-export-${userId}.json"`);
  res.json({
    exportedAt: new Date().toISOString(),
    user,
    characters,
    inventory: collect('SELECT * FROM inventory'),
    quest_log: collect('SELECT * FROM quest_log'),
    achievements: collect('SELECT * FROM achievements'),
    bestiary: collect('SELECT * FROM bestiary'),
    mail: collect('SELECT id, character_id, from_name, subject, body, sent_at, read_at FROM mail'),
    purchases,
  });
});

const deleteAccountSchema = z.object({
  password: z.string().min(1),
  confirm: z.literal('DELETE MY ACCOUNT'),
});

/**
 * GDPR Art. 17 — Right to erasure.
 * Requires password + literal confirmation phrase. Cascades through every
 * character-owned table (FK ON DELETE CASCADE) and finally drops the user.
 * Purchase rows are pseudonymised, not deleted — VAT/OSS bookkeeping
 * requires retention; we null out character_id but keep the totals.
 */
router.post('/delete-account', async (req, res) => {
  const parse = deleteAccountSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Confirm by typing "DELETE MY ACCOUNT" and your password.' });
    return;
  }
  const db = getDb();
  const userId = req.auth!.uid;
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const ok = await bcrypt.compare(parse.data.password, user.password_hash);
  if (!ok) {
    res.status(401).json({ error: 'Password incorrect.' });
    return;
  }
  // Споделен erasure (вкл. разпускане на водени гилдии — иначе FK RESTRICT
  // на guilds.leader_id проваля триенето за гилдийни лидери).
  db.transaction((uid: number) => eraseUser(db, uid))(userId);
  res.json({ ok: true });
});

export default router;
