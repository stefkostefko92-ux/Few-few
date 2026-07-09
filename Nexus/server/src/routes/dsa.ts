/**
 * DSA notice-and-action mechanism (Regulation (EU) 2022/2065).
 *
 * Art. 16 — any user (logged-in or not) can submit a notice about
 *   allegedly illegal content. The notice must capture the URL or game
 *   identifier of the content, why it is allegedly illegal, the notifier's
 *   contact details (for non-anonymous notices) and an affirmation of
 *   good faith.
 * Art. 17 — the platform must send a statement of reasons to the
 *   affected user. We don't auto-act here — the moderation team reviews
 *   the queue daily and decides. The endpoint just persists the notice
 *   and returns a public ticket id.
 * Art. 24 — yearly transparency report. The notices table is the raw
 *   data the report is built from.
 *
 * The route is rate-limited (re-uses the API limiter applied in
 * server.ts) so we don't end up with abusive auto-flood traffic.
 */

import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { logFromRequest } from '../lib/logger';

const router = Router();

// Idempotent forward migration — the notices table lives next to the
// route so the import alone is enough to set it up on first boot.
{
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS dsa_notices (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      content_kind    TEXT NOT NULL,          -- 'chat' | 'auction' | 'character_name' | 'guild_name' | 'mail' | 'other'
      content_ref     TEXT NOT NULL,          -- url or "auction:42" / "char:Foo" etc.
      reason          TEXT NOT NULL,          -- 'illegal_hate' | 'illegal_csam' | 'impersonation' | 'copyright' | 'spam' | 'other'
      description     TEXT NOT NULL,
      notifier_email  TEXT,                   -- nullable for anonymous notices
      notifier_name   TEXT,
      good_faith      INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'actioned' | 'rejected'
      decided_at      INTEGER,
      decision        TEXT,                   -- statement-of-reasons text (Art. 17)
      ip_country      TEXT,
      created_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dsa_status ON dsa_notices(status, created_at DESC);
  `);
}

const noticeSchema = z.object({
  contentKind: z.enum(['chat', 'auction', 'character_name', 'guild_name', 'mail', 'other']),
  contentRef: z.string().min(1).max(500),
  reason: z.enum(['illegal_hate', 'illegal_csam', 'impersonation', 'copyright', 'spam', 'other']),
  description: z.string().min(20, 'Describe the issue in at least 20 characters.').max(5000),
  // Optional for anonymous notices but recommended (Art. 16(2)(d)).
  notifierEmail: z.string().email().optional().or(z.literal('')),
  notifierName: z.string().max(100).optional().or(z.literal('')),
  goodFaith: z.literal(true, {
    errorMap: () => ({ message: 'You must affirm good-faith belief that the content is illegal.' }),
  }),
});

router.post('/notice', (req, res) => {
  const parse = noticeSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  const data = parse.data;
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO dsa_notices
         (content_kind, content_ref, reason, description, notifier_email, notifier_name, good_faith, ip_country, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      data.contentKind,
      data.contentRef,
      data.reason,
      data.description,
      data.notifierEmail || null,
      data.notifierName || null,
      (req as any).ipCountry || null,
      Date.now(),
    );
  const ticketId = info.lastInsertRowid as number;
  logFromRequest(req, {
    category: 'dsa',
    action: 'notice_received',
    target_id: ticketId,
    target_type: 'dsa_notice',
    message: `DSA notice ${ticketId} (${data.contentKind} / ${data.reason})`,
  });
  res.status(201).json({
    ticketId,
    statementOfReasons:
      'Thank you. Your notice has been logged and will be reviewed by our trust & safety team. ' +
      'Per DSA Art. 17 you will receive a statement of reasons by email if the content is acted on. ' +
      'Per Art. 20 both you and the affected user may appeal any decision within 6 months.',
  });
});

/**
 * Public transparency window — counts only, no PII. The yearly Art. 24
 * report can be built from this; we expose monthly aggregates so the
 * studio's transparency page can pull them.
 */
router.get('/transparency', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT strftime('%Y-%m', datetime(created_at / 1000, 'unixepoch')) AS month,
              content_kind, reason, status, COUNT(*) AS n
         FROM dsa_notices
        GROUP BY month, content_kind, reason, status
        ORDER BY month DESC`,
    )
    .all() as Array<{ month: string; content_kind: string; reason: string; status: string; n: number }>;
  res.json({ months: rows });
});

export default router;
