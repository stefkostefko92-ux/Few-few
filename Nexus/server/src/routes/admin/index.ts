/**
 * Админ API — /api/admin/*. Един Router; модулите в тази папка само
 * регистрират маршрути в него (плосък стек → тестът изброява ВСЕКИ маршрут).
 *
 * Инварианти (гейтвани от src/game/__tests__/admin*.test.ts):
 *  - ВСЕКИ ендпойнт минава през authRequired + adminRequired (router.use по-долу);
 *    не-админ → 403, без токен → 401.
 *  - ВСЕКИ вход е валидиран със zod (id-та, тела, query; пагинацията е с таван).
 *  - ВСЯКО мутиращо действие оставя одит ред „кой · какво · кога · от → към"
 *    (lib/adminKit.audit); предпазна мрежа логва и пропуснатите.
 *  - Многостъпковите промени са в транзакция (kit.inTx).
 *  - Липсващ обект → 404, конфликт със състоянието → 409, лош вход → 400.
 *  - Разрушителните действия минават през destructiveLimiter.
 *  - Отговорите никога не съдържат password_hash или тайни на webhook-и.
 *
 * Модули: catalog (предмети/чудовища/куестове) · content (статично + магазин) ·
 * users · characters · guilds · mail · economy · world (кула/бос/сезон…) ·
 * moderation (DSA + чат) · system (настройки/дневници/webhook-и/сървър).
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { getDb } from '../../db';
import { authRequired } from '../../middleware/auth';
import { adminRequired } from '../../middleware/admin';
import { logFromRequest } from '../../lib/logger';
import { count } from './kit';
import { registerCatalog } from './catalog';
import { registerContent } from './content';
import { registerUsers } from './users';
import { registerCharacters } from './characters';
import { registerGuilds } from './guilds';
import { registerMail } from './mail';
import { registerEconomy } from './economy';
import { registerWorld } from './world';
import { registerModeration } from './moderation';
import { registerSystem } from './system';

const router = Router();
router.use(authRequired, adminRequired);

/* ---------------------------------------------------------------
   Предпазна мрежа на одита: всяка УСПЕШНА мутация, която хендлърът не е
   одитирал изрично, пак оставя ред (warn), за да няма тих пропуск.
   --------------------------------------------------------------- */
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const path = req.path;
  const method = req.method;
  res.on('finish', () => {
    if (res.locals.audited || res.statusCode >= 400) return;
    logFromRequest(req, {
      category: 'admin',
      action: `${method.toLowerCase()}_${path.replace(/^\//, '').split('/')[0] || 'root'}`,
      level: 'warn',
      target_type: path.replace(/^\//, '').split('/')[0] || '',
      message: `Unaudited admin ${method} ${path}`,
      meta: { admin_id: req.auth?.uid ?? null, status: res.statusCode },
    });
  });
  next();
});

/* =========================================================
   Dashboard / overview
   ========================================================= */
router.get('/overview', (_req, res) => {
  const db = getDb();
  const counts = {
    users: count(db, 'SELECT COUNT(*) AS c FROM users'),
    admins: count(db, 'SELECT COUNT(*) AS c FROM users WHERE is_admin = 1'),
    banned: count(db, 'SELECT COUNT(*) AS c FROM users WHERE banned = 1 AND (banned_until = 0 OR banned_until > ?)', Date.now()),
    characters: count(db, 'SELECT COUNT(*) AS c FROM characters WHERE is_npc = 0'),
    npcs: count(db, 'SELECT COUNT(*) AS c FROM characters WHERE is_npc = 1'),
    items: count(db, 'SELECT COUNT(*) AS c FROM items'),
    monsters: count(db, 'SELECT COUNT(*) AS c FROM monsters'),
    quests: count(db, 'SELECT COUNT(*) AS c FROM quests'),
    battles: count(db, 'SELECT COUNT(*) AS c FROM combat_log'),
    guilds: count(db, 'SELECT COUNT(*) AS c FROM guilds'),
    open_notices: count(db, "SELECT COUNT(*) AS c FROM dsa_notices WHERE status = 'open'"),
    purchases_completed: count(db, "SELECT COUNT(*) AS c FROM purchases WHERE status = 'completed'"),
    market_sales: count(db, "SELECT COUNT(*) AS c FROM marketplace_listings WHERE status = 'sold'"),
    market_listings_active: count(db, "SELECT COUNT(*) AS c FROM marketplace_listings WHERE status = 'active'"),
    pending_trades: count(db, "SELECT COUNT(*) AS c FROM trade_offers WHERE status = 'pending'"),
    tower_climbs: count(db, "SELECT COUNT(*) AS c FROM event_log WHERE action IN ('tower_clear','tower_wipe')"),
    bounty_claims: count(db, "SELECT COUNT(*) AS c FROM event_log WHERE action = 'bounty_claim'"),
    trial_tokens_spent: count(db, 'SELECT COUNT(*) AS c FROM trial_purchases'),
    battle_pass_passes: count(db, 'SELECT COUNT(*) AS c FROM battle_pass'),
    battle_pass_premium: count(db, 'SELECT COUNT(*) AS c FROM battle_pass WHERE premium_unlocked = 1'),
  };
  const recentUsers = db
    .prepare('SELECT id, username, email, created_at, last_seen_at, is_admin FROM users ORDER BY created_at DESC LIMIT 10')
    .all();
  const topChars = db
    .prepare('SELECT id, name, class, level, arena_rating, gold, is_npc FROM characters WHERE is_npc = 0 ORDER BY level DESC, arena_rating DESC LIMIT 10')
    .all();
  res.json({ counts, recentUsers, topChars });
});

registerCatalog(router);
registerContent(router);
registerUsers(router);
registerCharacters(router);
registerGuilds(router);
registerMail(router);
registerEconomy(router);
registerWorld(router);
registerModeration(router);
registerSystem(router);

export default router;
