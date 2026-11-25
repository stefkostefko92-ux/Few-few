import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { ID_PATTERN } from '../ids.js';
import { LEGAL_DOCUMENTS } from '../legal/documents.js';
import { recordRegistrationAcceptance } from '../legal/acceptance.js';
import { hasPending, pendingLegal, type PendingLegal } from '../legal/pending.js';

/**
 * „Актуалните условия“ (SPEC 92): нова версия на общите условия или договора за обработване се приема изрично
 * при следващия вход. Докато не е приета, страниците на приложението водят тук — освен тези, с които човекът
 * може да откаже и да си тръгне с данните си: „Сигурност“ (моите данни, закриване), езикът, износът на фирмата
 * и прекратяването ѝ.
 */
const OPEN: readonly RegExp[] = [
  /^\/app\/usloviya$/,
  /^\/app\/sigurnost(?:\/|$)/,
  /^\/app\/ezik$/,
  new RegExp(`^/app/o/${ID_PATTERN}/iznos\\.zip$`),
  new RegExp(`^/app/o/${ID_PATTERN}/prekratyavane(?:/otmeni)?$`),
];

/** Къде да се върне след приемането — само адрес в приложението (не `//друг-сайт`), не самата страница. */
export function safeNext(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1000) return '/app';
  if (!/^\/app(?:[/?#]|$)/.test(value) || value.includes('\\')) return '/app';
  // Втвърдяване (Разбивача, 25.11.2026): без „//“, сегмент „..“ (и кодиран) и управляващи знаци — браузърът ги
  // нормализира извън `/app`, макар и на същия сайт.
  if (/\/\/|(?:^|\/)(?:\.|%2e){2}(?:[/?#]|$)|[\u0000-\u001f\u007f]/i.test(value)) return '/app';
  if (/^\/app\/usloviya(?:[/?#]|$)/.test(value)) return '/app';
  return value;
}

export async function requireCurrentLegal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.principal?.user;
  const path = req.baseUrl + req.path;
  if (!user || user.platformRole !== 'NONE' || OPEN.some((open) => open.test(path))) {
    next();
    return;
  }
  if (!hasPending(await pendingLegal(user.id, user.platformRole))) {
    next();
    return;
  }
  const back = req.method === 'GET' ? req.originalUrl : '/app';
  res.redirect(303, `/app/usloviya?next=${encodeURIComponent(safeNext(back))}`);
}

function render(
  res: Response,
  status: number,
  view: { pending: PendingLegal; next: string; error: boolean },
): void {
  // Прозорецът „Какво ново“ не се показва върху приемането.
  res.locals.newsPopup = null;
  res.status(status).render('app/legal-update', {
    ...view,
    date: LEGAL_DOCUMENTS.terms.date,
  });
}

export function appLegalRouter(): Router {
  const router = Router();

  router.get('/app/usloviya', async (req, res) => {
    const next = safeNext(req.query['next']);
    const pending = await pendingLegal(req.principal!.user.id);
    if (!hasPending(pending)) return res.redirect(303, next);
    render(res, 200, { pending, next, error: false });
  });

  router.post('/app/usloviya', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const next = safeNext(body['next']);
    const userId = req.principal!.user.id;
    const pending = await pendingLegal(userId);
    if (!hasPending(pending)) return res.redirect(303, next);
    // Отметката е изрична — никога не идва отметната (като при регистрацията).
    if (body['acceptTerms'] !== 'on') return render(res, 400, { pending, next, error: true });
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      // Собственикът приема общите условия и договора за обработване от името на всяка своя фирма.
      for (const company of pending.companies) {
        await recordRegistrationAcceptance(tx, { userId, organizationId: company.id, now });
        await audit(tx, {
          actorId: userId,
          organizationId: company.id,
          action: 'legal.accepted',
          targetType: 'Organization',
          targetId: company.id,
          details: { terms: LEGAL_DOCUMENTS.terms.version, dpa: LEGAL_DOCUMENTS.dpa.version },
        });
      }
      // Без своя фирма — само общите условия за себе си (и политиката — прочетена).
      if (pending.companies.length === 0) {
        await tx.legalAcceptance.createMany({
          data: (['terms', 'privacy'] as const).map((document) => ({
            userId,
            organizationId: null,
            document,
            version: LEGAL_DOCUMENTS[document].version,
            acceptedAt: now,
          })),
        });
      }
    });
    res.redirect(303, next);
  });

  return router;
}
