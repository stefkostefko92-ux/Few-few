import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { PRODUCTS, findProduct } from '../seed/products';
import type { Character } from '../types/domain';
import { logFromRequest, logEvent } from '../lib/logger';

const router = Router();

/* =========================================================================
 * Stripe initialisation — optional.
 *
 * If STRIPE_SECRET_KEY is set, real Stripe Checkout sessions are created
 * and the user is redirected to Stripe's hosted page. After payment, the
 * client calls back to /api/payments/verify which checks session.payment_status
 * with Stripe and credits the purchase.
 *
 * If no key is set the server runs in "dev mode": checkout returns a fake
 * URL that points at /api/payments/dev-complete and the purchase is granted
 * instantly. This lets the entire purchase flow be demoed without configuring
 * Stripe.
 * ======================================================================= */

let stripe: any = null;
let stripeReady = false;
function tryInitStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return;
  try {
    // Lazy import so the server boots even if the stripe package isn't installed.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Stripe = require('stripe');
    stripe = new Stripe(key, { apiVersion: '2024-06-20' });
    stripeReady = true;
    console.log('[payments] Stripe initialised');
  } catch (e) {
    console.warn('[payments] Stripe SDK not available — dev mode active');
  }
}
tryInitStripe();

function isDevMode(): boolean {
  // Audit #1 critical: dev-mode in production lets anyone mint gems
  // by calling /checkout → /verify with no payment. Hard-block.
  if (process.env.NODE_ENV === 'production') return false;
  return !stripeReady;
}

function refuseInProduction(res: any): boolean {
  if (process.env.NODE_ENV === 'production' && !stripeReady) {
    res.status(503).json({ error: 'Payments are temporarily unavailable.' });
    return true;
  }
  return false;
}

function getChar(uid: number): Character | undefined {
  return getDb().prepare('SELECT * FROM characters WHERE user_id = ?').get(uid) as Character | undefined;
}

/* ---- Public catalog ---- */
router.get('/products', (_req, res) => {
  res.json({
    products: PRODUCTS,
    mode: isDevMode() ? 'dev' : 'stripe',
  });
});

router.use(authRequired);

/* ---- Recent purchase history for the logged-in hero ---- */
router.get('/history', (req, res) => {
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const rows = getDb()
    .prepare(`SELECT id, kind, amount_cents, currency, gems_granted, status, mode, created_at, completed_at
              FROM purchases WHERE character_id = ?
              ORDER BY created_at DESC LIMIT 50`)
    .all(char.id);
  res.json({ history: rows, mode: isDevMode() ? 'dev' : 'stripe' });
});

/* ---- Create a checkout session ---- */
const checkoutSchema = z.object({ kind: z.string() });

router.post('/checkout', async (req, res) => {
  const parse = checkoutSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const product = findProduct(parse.data.kind);
  if (!product) { res.status(404).json({ error: 'Unknown product' }); return; }

  const db = getDb();
  const now = Date.now();
  const insert = db.prepare(
    `INSERT INTO purchases (character_id, kind, amount_cents, currency, gems_granted, effect_payload, status, mode, created_at)
     VALUES (?, ?, ?, 'usd', ?, ?, 'pending', ?, ?)`,
  );
  const info = insert.run(
    char.id, product.kind, product.price_cents, product.effects.gems || 0,
    JSON.stringify(product.effects), isDevMode() ? 'dev' : 'stripe', now,
  );
  // currency override
  if (product.currency && product.currency !== 'usd') {
    getDb().prepare('UPDATE purchases SET currency = ? WHERE id = ?').run(product.currency, info.lastInsertRowid);
  }
  const purchaseId = info.lastInsertRowid as number;

  logFromRequest(req, {
    category: 'payment',
    action: 'checkout_started',
    character_id: char.id,
    target_id: purchaseId,
    target_type: 'purchase',
    message: `Started checkout for ${product.name}`,
    meta: { kind: product.kind, price_cents: product.price_cents, currency: product.currency, mode: isDevMode() ? 'dev' : 'stripe' },
  });

  if (isDevMode()) {
    // Return a redirect URL that completes the purchase on visit.
    const origin = req.headers.origin || `http://${req.headers.host}`;
    res.json({
      mode: 'dev',
      url: `${origin}/app/premium?dev_complete=${purchaseId}`,
      purchase_id: purchaseId,
    });
    return;
  }

  try {
    const origin = req.headers.origin || `http://${req.headers.host}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: product.currency || 'eur',
            unit_amount: product.price_cents,
            product_data: {
              name: product.name,
              description: product.description,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/app/premium?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/app/premium?cancelled=1`,
      client_reference_id: String(purchaseId),
      metadata: { purchase_id: String(purchaseId), character_id: String(char.id) },
    });
    db.prepare('UPDATE purchases SET stripe_session_id = ? WHERE id = ?').run(session.id, purchaseId);
    res.json({ mode: 'stripe', url: session.url, session_id: session.id, purchase_id: purchaseId });
  } catch (e: any) {
    db.prepare(`UPDATE purchases SET status = 'failed' WHERE id = ?`).run(purchaseId);
    res.status(500).json({ error: e.message || 'Could not create checkout session' });
  }
});

/* ---- Credit a pending purchase ---- */
function applyPurchase(purchaseId: number): { ok: true; granted: any } | { ok: false; error: string } {
  const db = getDb();
  const row = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId) as any;
  if (!row) return { ok: false, error: 'Purchase not found' };
  if (row.status === 'completed') return { ok: true, granted: JSON.parse(row.effect_payload || '{}') };
  if (row.status === 'failed') return { ok: false, error: 'Purchase already failed' };

  const effects = JSON.parse(row.effect_payload || '{}');
  const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(row.character_id) as Character | undefined;
  if (!char) return { ok: false, error: 'Character missing' };

  const updates: string[] = [];
  const params: any[] = [];
  if (effects.gems) {
    updates.push('gems = gems + ?', 'total_gems_earned = total_gems_earned + ?');
    params.push(effects.gems, effects.gems);
  }
  if (effects.energy_refill) {
    updates.push('energy = MIN(energy_max, energy + ?)');
    params.push(effects.energy_refill);
  }
  if (effects.rest) {
    updates.push('hp = hp_max', 'mp = mp_max');
  }
  if (effects.name_change) {
    // Clear the last-rename timer so the player can immediately rename for free.
    updates.push('last_rename_at = 0');
  }
  if (updates.length) {
    params.push(char.id);
    db.prepare(`UPDATE characters SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  db.prepare(`UPDATE purchases SET status = 'completed', completed_at = ? WHERE id = ?`).run(Date.now(), purchaseId);

  logEvent({
    category: 'payment',
    action: 'completed',
    level: 'info',
    character_id: char.id,
    target_id: purchaseId,
    target_type: 'purchase',
    message: `Granted ${row.kind} to ${char.name}`,
    meta: { kind: row.kind, amount_cents: row.amount_cents, currency: row.currency, granted: effects },
  });

  // Mail receipt
  db.prepare(
    `INSERT INTO mail (character_id, from_name, subject, body, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    char.id,
    'The Royal Mint',
    `Receipt — ${row.kind.replace(/_/g, ' ')}`,
    `Your purchase of ${row.kind.replace(/_/g, ' ')} for $${(row.amount_cents / 100).toFixed(2)} ${(row.currency || 'usd').toUpperCase()} was completed.${effects.gems ? ` +${effects.gems} gems credited.` : ''}${effects.name_change ? ' Your rename cooldown has been cleared.' : ''}`,
    Date.now(),
  );

  return { ok: true, granted: effects };
}

/* ---- Stripe redirect handler (success_url comes back here via the client) ---- */
const verifySchema = z.object({ session_id: z.string().optional(), purchase_id: z.number().optional() });
router.post('/verify', async (req, res) => {
  const parse = verifySchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }

  let purchaseId: number | undefined = parse.data.purchase_id;
  const db = getDb();
  if (!purchaseId && parse.data.session_id) {
    const row = db.prepare('SELECT id FROM purchases WHERE stripe_session_id = ?').get(parse.data.session_id) as { id: number } | undefined;
    purchaseId = row?.id;
  }
  if (!purchaseId) { res.status(404).json({ error: 'No matching purchase' }); return; }

  if (stripeReady) {
    const row = db.prepare('SELECT stripe_session_id, character_id, status FROM purchases WHERE id = ?').get(purchaseId) as any;
    if (!row) { res.status(404).json({ error: 'Purchase not found' }); return; }
    if (row.character_id !== char.id) { res.status(403).json({ error: 'Wrong hero for this purchase' }); return; }
    if (row.status === 'completed') {
      res.json({ ok: true, status: 'completed' });
      return;
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(row.stripe_session_id);
      if (session.payment_status === 'paid') {
        const result = applyPurchase(purchaseId);
        if ('error' in result) { res.status(500).json({ error: result.error }); return; }
        res.json({ ok: true, status: 'completed', granted: result.granted });
      } else {
        res.json({ ok: false, status: session.payment_status });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  } else {
    // Dev mode — instant complete. Hard-block this path in production
    // (audit #1 critical: free gems).
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({ error: 'Payments are temporarily unavailable.' });
      return;
    }
    const row = db.prepare('SELECT character_id, status FROM purchases WHERE id = ?').get(purchaseId) as any;
    if (!row) { res.status(404).json({ error: 'Purchase not found' }); return; }
    if (row.character_id !== char.id) { res.status(403).json({ error: 'Wrong hero' }); return; }
    if (row.status === 'completed') { res.json({ ok: true, status: 'completed' }); return; }
    const result = applyPurchase(purchaseId);
    if ('error' in result) { res.status(500).json({ error: result.error }); return; }
    res.json({ ok: true, status: 'completed', granted: result.granted });
  }
});

/* ---- Optional Stripe webhook ----
 *
 * Audit (security/deploy round): this handler MUST NOT sit behind
 * `authRequired` — Stripe sends no Authorization header, and Stripe is
 * the *only* legitimate caller, so we authenticate via the signature
 * instead. It also MUST NOT sit behind the global /api rate limiter,
 * because Stripe retry-storms after a transient 5xx and would self-
 * throttle. We export the handler on a dedicated router that
 * server.ts mounts BEFORE both the apiLimiter and the auth gate. */
export const webhookRouter = Router();
webhookRouter.post('/', async (req, res) => {
  if (!stripeReady) { res.status(503).json({ error: 'Stripe not configured' }); return; }
  const sig = req.headers['stripe-signature'] as string | undefined;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !sig) { res.status(400).json({ error: 'Missing webhook secret' }); return; }
  const raw = (req as any).rawBody as Buffer | undefined;
  if (!raw) { res.status(400).json({ error: 'Raw body missing — webhook misconfigured' }); return; }
  let event: any;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err: any) {
    res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    return;
  }
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const purchaseId = Number(session.metadata?.purchase_id || session.client_reference_id);
      if (purchaseId) applyPurchase(purchaseId);
    }
    res.json({ received: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
