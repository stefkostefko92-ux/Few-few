import { Router, type Response } from 'express';
import {
  isPartial,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
  safeNext,
  sendError,
} from '../auth/guards.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import {
  chiudiComunicazione,
  creaComunicazione,
  elencoComunicazioni,
  fermaComunicazione,
  statoDi,
} from '../master/comunicazioni.js';
import { leggiForm, LIVELLI } from '../master/comunicazioni-form.js';
import { businessDay } from '../time.js';

/**
 * „Comunicazioni“ в конзолата на MASTER: лента над страниците на портала за хората на всички или на
 * избрани фирми, от ден до ден, по избор и писмо до администраторите им; спиране по всяко време. И
 * „Chiudi“ на лентата за всеки вписан човек (`/comunicazioni/:id/chiudi`).
 */
export const masterComunicazioniRouter: Router = Router();
const manage = requireCapability('aziende:manage');

const ID = /^[a-z0-9]{20,40}$/;

async function mostra(
  res: Response,
  status: number,
  form: Record<string, unknown> = {},
  errore: string | null = null,
): Promise<void> {
  const [aziende, elenco] = await Promise.all([
    prisma.azienda.findMany({
      where: { deactivatedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    elencoComunicazioni(),
  ]);
  const now = new Date();
  const nomi = new Map(aziende.map((a) => [a.id, a.name]));
  // Дните по Рим: началото е полунощ на първия, краят — полунощ след последния.
  const giorno = (at: Date) => res.locals.fmt.day(new Date(`${businessDay(at)}T00:00:00Z`));
  res
    .status(status)
    .set('Cache-Control', 'no-store')
    .render('master/comunicazioni', {
      aziende,
      livelli: LIVELLI,
      oggi: businessDay(now),
      form,
      errore,
      elenco: elenco.map((c) => ({
        ...c,
        stato: statoDi(c, now),
        dal: giorno(c.inizioAt),
        al: c.fineAt ? giorno(new Date(c.fineAt.getTime() - 1)) : null,
        destinatari: c.aziendaIds.map((id) => nomi.get(id)).filter(Boolean),
      })),
    });
}

masterComunicazioniRouter.get('/master/comunicazioni', manage, (_req, res) => mostra(res, 200));

masterComunicazioniRouter.post('/master/comunicazioni', manage, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const attive = await prisma.azienda.findMany({
    where: { deactivatedAt: null },
    select: { id: true },
  });
  const esito = leggiForm(body, new Set(attive.map((a) => a.id)));
  if (!esito.ok) return mostra(res, 422, body, `master.comunicazioni.errore.${esito.errore}`);
  const { email, doppio } = await creaComunicazione(principalOf(req).user, esito.value);
  if (doppio) setFlash(res, 'info', 'master.comunicazioni.flash.doppia');
  else if (email === null) setFlash(res, 'ok', 'master.comunicazioni.flash.creata');
  else setFlash(res, 'ok', 'master.comunicazioni.flash.creataEmail', { n: email });
  res.redirect(303, '/master/comunicazioni');
});

masterComunicazioniRouter.post(
  '/master/comunicazioni/:id/ferma',
  manage,
  requireCsrf,
  async (req, res) => {
    const id = req.params.id;
    if (typeof id !== 'string' || !ID.test(id))
      return sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
    const fermata = await fermaComunicazione(principalOf(req).user, id);
    if (!fermata) return sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
    setFlash(res, 'ok', 'master.comunicazioni.flash.fermata');
    res.redirect(303, '/master/comunicazioni');
  },
);

/** „Chiudi“ на лентата: с JavaScript — 204 във фонов режим; без него — обратно на страницата. */
masterComunicazioniRouter.post(
  '/comunicazioni/:id/chiudi',
  requireUser,
  requireCsrf,
  async (req, res) => {
    const id = req.params.id;
    if (typeof id === 'string' && ID.test(id)) await chiudiComunicazione(principalOf(req).user, id);
    if (isPartial(req)) {
      res.status(204).end();
      return;
    }
    res.redirect(303, safeNext((req.body as Record<string, unknown>).torna));
  },
);
