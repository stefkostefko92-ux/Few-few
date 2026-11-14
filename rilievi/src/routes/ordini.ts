import { Router } from 'express';
import { requireCapability } from '../auth/guards.js';
import { pdfLimiter } from '../http/limits.js';
import { moduloDellaScheda } from '../ordini/modulo-scheda.js';
import { SLOTS } from '../ordini/registry.js';
import { getScheda } from '../schede/service.js';
import { notFound, scope } from './schede-shared.js';

/**
 * PDF-ите на модулите (поръчка на табло Pelazza, MoviLift или Mastech, листът с данни за аргано, листът
 * на 2SG за окачванията) — отделно от PDF-а на картата. Същият обхват като картата: чужда, непопълнена
 * или с друга марка или модел — 404.
 * `?inline=1` го отваря в браузъра (за печат), иначе се тегли.
 */
export const ordiniRouter: Router = Router();

const read = requireCapability('schede:read');

for (const slot of SLOTS) {
  ordiniRouter.get(`/schede/:id/${slot.path}`, read, pdfLimiter, async (req, res) => {
    const scheda = await getScheda(
      scope(req, 'schede:read'),
      String(req.params.id),
      scope(req, 'schede:trash'),
    );
    // Записаната карта пази само видимото: „Sì“ (или отметката, която отваря модула) значи видимо поле;
    // слотът с предимство го затваря.
    if (!scheda) return notFound(req, res);
    const modulo = await moduloDellaScheda(scheda, slot);
    if (!modulo) return notFound(req, res);
    const { pdf, nome: name } = modulo;
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${name}"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'no-store',
      })
      .end(pdf);
  });
}
