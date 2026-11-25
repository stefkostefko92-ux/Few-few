import { Router } from 'express';
import { z } from 'zod';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { writeAudit } from '../audit.js';
import { aziendeImpostabili } from '../aziende/sezioni.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import { textParser } from '../schede/field-parsers.js';
import { notFound, pathSezione, renderImpostazioni } from './impostazioni-vista.js';

/**
 * „Buono di lavoro“ в настройките (собственикът — „impostabili per azienda“): кодът на модула горе вдясно
 * на листа и клаузата долу, както фирмата ги ползва на хартия; празно — нищо. Пише ADMIN на фирмата (и
 * MASTER). Одит `AZIENDA_BUONO` без текста.
 */
export const impostazioniBuonoRouter: Router = Router();

export const MAX_CODICE = 80;
export const MAX_CLAUSOLA = 1000;

const schema = z.object({
  codice: textParser({ kind: 'text', maxLength: MAX_CODICE }),
  clausola: textParser({ kind: 'textarea', maxLength: MAX_CLAUSOLA }),
});

impostazioniBuonoRouter.post(
  '/impostazioni/buono',
  requireCapability('aziende:settings'),
  requireCsrf,
  async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const user = principalOf(req).user;
    const aziende = await aziendeImpostabili(user);
    const azienda = aziende.find((a) => a.id === body.azienda);
    if (!azienda) return notFound(req, res);
    const parsed = schema.safeParse({ codice: body.codice, clausola: body.clausola });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] = 'errore';
      const text = (v: unknown, max: number) =>
        typeof v === 'string' ? v.slice(0, max + 100) : '';
      return renderImpostazioni(res, 422, {
        sezione: 'buoni',
        aziende,
        azienda,
        buono: {
          values: {
            codice: text(body.codice, MAX_CODICE),
            clausola: text(body.clausola, MAX_CLAUSOLA),
          },
          errors,
        },
      });
    }
    await prisma.$transaction(async (tx) => {
      await tx.azienda.update({
        where: { id: azienda.id },
        data: { buonoCodice: parsed.data.codice, buonoClausola: parsed.data.clausola },
      });
      await writeAudit(
        {
          actorId: user.id,
          action: 'AZIENDA_BUONO',
          aziendaId: azienda.id,
          targetType: 'azienda',
          targetId: azienda.id,
          meta: { codice: parsed.data.codice !== null, clausola: parsed.data.clausola !== null },
        },
        tx,
      );
    });
    setFlash(res, 'ok', 'buoni.flash.intestazione');
    res.redirect(303, pathSezione('buoni', azienda.id));
  },
);
