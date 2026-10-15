import { Router } from 'express';
import { config } from '../config.js';
import { requireCapability } from '../auth/guards.js';
import { pdfLimiter } from '../http/limits.js';
import { renderModulo } from '../ordini/pdf.js';
import { sceltoNellaScheda, SLOTS } from '../ordini/registry.js';
import { storedValori } from '../ordini/valori.js';
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
    if (
      !scheda ||
      scheda[slot.question] !== true ||
      !sceltoNellaScheda(slot, (key) => scheda[key as keyof typeof scheda])
    ) {
      return notFound(req, res);
    }
    const valori = storedValori(slot.modulo, scheda[slot.column]);
    if (!valori) return notFound(req, res);
    const pdf = Buffer.from(await renderModulo(slot.modulo, valori, config().PDF_FONT_DIR));
    const id = scheda.numeroImpianto ?? scheda.matricola ?? scheda.id.slice(-8);
    const name = `${slot.path}-${id}-${scheda.data.toISOString().slice(0, 10)}.pdf`.replace(
      /[^A-Za-z0-9._-]/g,
      '',
    );
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
