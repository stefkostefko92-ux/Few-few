import { Router } from 'express';
import crypto from 'crypto';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { addConnection, issueTicket, consumeTicket } from '../lib/stream';

const router = Router();

/** Издай краткоживущ ticket за SSE (authed — има Authorization header). */
router.post('/ticket', authRequired, (req, res) => {
  const token = crypto.randomBytes(24).toString('hex');
  issueTicket(req.auth!.uid, token);
  res.json({ ticket: token });
});

/**
 * SSE поток. Auth през ?ticket (EventSource не праща headers). Държи
 * връзката отворена и push-ва събития (notification/chat) от lib/stream.
 */
router.get('/', (req, res) => {
  const ticket = String(req.query.ticket || '');
  const uid = consumeTicket(ticket);
  if (uid == null) { res.status(401).end(); return; }
  const char = getDb().prepare('SELECT id FROM characters WHERE user_id = ?').get(uid) as { id: number } | undefined;
  if (!char) { res.status(404).end(); return; }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // спри буфериране на nginx
  });
  res.flushHeaders?.();
  res.write('event: ready\ndata: {}\n\n');

  const cleanup = addConnection(res, char.id);
  req.on('close', cleanup);
});

export default router;
