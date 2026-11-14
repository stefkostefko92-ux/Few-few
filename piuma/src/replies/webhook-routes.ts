import express, { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../logger.js';
import { parseCommentEvents, type CommentEvent } from './events.js';
import { SIGNATURE_HEADER, challengeResponse, verifyWebhookSignature } from './signature.js';

export const WEBHOOK_PATH = '/webhooks/instagram';
/** Meta праща партиди до 1000 известия; 1 MB стига с голям запас. */
const BODY_LIMIT = '1mb';

export interface WebhookOptions {
  appSecret: string;
  /** Без него маршрутът не съществува (PR4) — функцията е изключена. */
  verifyToken: string | undefined;
  /** Записва и слага в опашката. Хвърли ли — 500, за да повтори Meta (PR3). */
  ingest: (events: CommentEvent[]) => Promise<void>;
}

/**
 * Известията от Meta за коментари. Монтира се ПРЕДИ общия JSON парсер: подписът е върху
 * суровите байтове, а парсерът би ги изял. Никаква мрежа към Meta в заявката — само запис
 * в базата и в опашката; изпращането е работа на работника.
 */
export function webhookRouter(options: WebhookOptions): Router {
  const router = Router();
  const verifyToken = options.verifyToken;
  if (!verifyToken) return router;

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.get(WEBHOOK_PATH, limiter, (req, res) => {
    const challenge = challengeResponse(req.query as Record<string, unknown>, verifyToken);
    if (challenge === null) {
      logger.warn({ ip: req.ip }, 'отказана проверка на webhook-а (mode/токен/вид)');
      res.status(403).type('text/plain').send('forbidden');
      return;
    }
    res.status(200).type('text/plain').send(challenge);
  });

  router.post(
    WEBHOOK_PATH,
    limiter,
    express.raw({ type: () => true, limit: BODY_LIMIT }),
    async (req, res) => {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!verifyWebhookSignature(options.appSecret, raw, req.get(SIGNATURE_HEADER))) {
        logger.warn({ ip: req.ip, bytes: raw.length }, 'webhook с невалиден подпис — отказан');
        res.status(401).end();
        return;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(raw.toString('utf8'));
      } catch {
        // Подписано, но нечетимо: 200, иначе Meta повтаря 36 часа нещо, което няма да прочетем.
        logger.warn({ bytes: raw.length }, 'подписан, но нечетим webhook — пропуснат');
        res.status(200).end();
        return;
      }
      const events = parseCommentEvents(payload);
      if (!events.length) {
        res.status(200).end();
        return;
      }
      try {
        await options.ingest(events);
        res.status(200).end();
      } catch (error) {
        // Само името на грешката: съобщението на Prisma носи аргументите (commentId).
        logger.error(
          { err: error instanceof Error ? error.name : 'неизвестна', events: events.length },
          'приемът на коментари се провали — Meta ще повтори',
        );
        res.status(500).end();
      }
    },
  );

  // Твърде голямо или повредено тяло: кодът на парсера (413/400), не общата страница за 500.
  router.use(WEBHOOK_PATH, (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      typeof (error as { status?: unknown })?.status === 'number'
        ? (error as { status: number }).status
        : 400;
    res.status(status).end();
  });

  return router;
}
