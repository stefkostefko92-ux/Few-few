import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf, sendError } from '../auth/guards.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import { formatoEuro } from '../pagamenti/offerta.js';
import { riconciliaRimborso } from '../pagamenti/rimborsi-riconcilia.js';
import { convertiti, importoDa, rimborsoDovuto } from '../pagamenti/rimborsi.js';
import { anteprimaRimborso, rimborsaSuRevolut } from '../pagamenti/rimborso-revolut.js';
import { confermaPassword } from './conferma-password.js';

/**
 * Връщането на едно плащане в конзолата на MASTER (условията 2026-11-13, чл. 12.9): страницата показва
 * дължимото, колко най-много може да отиде през Revolut и върху кои поръчки, досегашните връщания — и нарежда
 * връщането САМО с паролата (откраднатата сесия не мести пари). Ръчното отбелязване (върнато с превод) остава в
 * master-pagamenti-registro.ts. Само `aziende:manage`.
 */
export const masterPagamentiRimborsiRouter: Router = Router();
const manage = requireCapability('aziende:manage');
const PATH = '/master/pagamenti';

const notFound = (req: Request, res: Response) =>
  sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');

async function vista(
  req: Request,
  res: Response,
  status: number,
  id: string,
  errore: { chiave: string; max?: number } | null = null,
  importoScritto: string | null = null,
): Promise<void> {
  const p = await prisma.pagamento.findUnique({
    where: { id },
    include: { azienda: { select: { deactivatedAt: true } } },
  });
  if (!p) return notFound(req, res);
  const rimborsabile =
    (p.stato === 'COMPLETATO' || p.stato === 'DA_VERIFICARE') && p.revolutOrderId !== null;
  // Дължимото по чл. 12.9: само за платено време на спряна или изтрита фирма, непревърнато в кредит.
  const cessazione = p.aziendaId === null ? new Date() : (p.azienda?.deactivatedAt ?? null);
  const dovutoCent =
    p.stato === 'DA_VERIFICARE'
      ? p.totaleCent
      : p.stato === 'COMPLETATO' && cessazione && !(await convertiti()).has(p.id)
        ? rimborsoDovuto(p, cessazione)
        : 0;
  const [anteprima, righe] = await Promise.all([
    anteprimaRimborso(p.id, dovutoCent),
    prisma.rimborso.findMany({
      where: { perPagamentoId: p.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 50,
      include: { pagamento: { select: { createdAt: true } } },
    }),
  ]);
  const ordini = anteprima.parti.length
    ? await prisma.pagamento.findMany({
        where: { id: { in: anteprima.parti.map((x) => x.id) } },
        select: { id: true, createdAt: true },
      })
    : [];
  res.set('Cache-Control', 'no-store');
  res.status(status).render('master/rimborso', {
    p,
    rimborsabile,
    cessazione,
    dovutoCent,
    maxCent: anteprima.maxCent,
    parti: anteprima.parti.map((x) => ({
      cent: x.cent,
      data: ordini.find((o) => o.id === x.id)?.createdAt ?? p.createdAt,
    })),
    righe,
    importo: importoScritto ?? formatoEuro(Math.min(dovutoCent, anteprima.maxCent)),
    euro: formatoEuro,
    errore,
  });
}

masterPagamentiRimborsiRouter.get(`${PATH}/:id/rimborso`, manage, (req, res) =>
  vista(req, res, 200, String(req.params.id)),
);

masterPagamentiRimborsiRouter.post(
  `${PATH}/:id/rimborso-revolut`,
  manage,
  requireCsrf,
  async (req, res) => {
    const id = String(req.params.id);
    const scritto = (req.body as Record<string, unknown>).importo;
    const testo = typeof scritto === 'string' ? scritto.slice(0, 20) : '';
    const conferma = await confermaPassword(req, res);
    if (conferma === 'bloccato') return;
    if (conferma === 'errata')
      return vista(req, res, 422, id, { chiave: 'rimborsi.errore.password' }, testo);
    const importo = importoDa(scritto);
    if (importo === null || importo <= 0 || importo > 100_000_00) {
      const { maxCent } = await anteprimaRimborso(id, 0);
      return vista(req, res, 422, id, { chiave: 'rimborsi.errore.importo', max: maxCent }, testo);
    }
    const esito = await rimborsaSuRevolut(principalOf(req).user.id, id, importo);
    if (!esito.ok) {
      if (esito.errore === 'importo')
        return vista(
          req,
          res,
          422,
          id,
          { chiave: 'rimborsi.errore.importo', max: esito.maxCent },
          testo,
        );
      return vista(
        req,
        res,
        esito.errore === 'inCorso' ? 409 : 422,
        id,
        { chiave: `rimborsi.errore.${esito.errore}` },
        testo,
      );
    }
    if (esito.stato === 'rifiutato')
      setFlash(res, 'error', 'rimborsi.esito.rifiutato', { codice: esito.codice });
    else
      setFlash(
        res,
        esito.stato === 'senzaRisposta' ? 'info' : 'ok',
        `rimborsi.esito.${esito.stato}`,
      );
    res.redirect(303, `${PATH}/${encodeURIComponent(id)}/rimborso`);
  },
);

/** „Riprova“: връщане без отговор от Revolut — пак, със същия ключ; с отговор — четене на състоянието му. */
masterPagamentiRimborsiRouter.post(
  `${PATH}/rimborsi/:rid/riprova`,
  manage,
  requireCsrf,
  async (req, res) => {
    const r = await prisma.rimborso.findUnique({
      where: { id: String(req.params.rid) },
      select: { id: true, perPagamentoId: true, stato: true },
    });
    if (!r) return notFound(req, res);
    if (r.stato === 'IN_CORSO') {
      await riconciliaRimborso(r.id);
      setFlash(res, 'info', 'rimborsi.esito.riprovato');
    }
    res.redirect(303, `${PATH}/${encodeURIComponent(r.perPagamentoId)}/rimborso`);
  },
);
