import { Router, type Request, type Response } from 'express';
import {
  ESPORTAZIONE_PORTALE_PATH,
  principalOf,
  requireCsrf,
  requireUser,
  sendError,
} from '../auth/guards.js';
import { soloEsportazione } from '../auth/memberships.js';
import { clearSessionCookie } from '../auth/sessions.js';
import {
  annullaCambio,
  cambiaEsito,
  prorogaCambio,
  richiediCambio,
  ultimaEsportazione,
} from '../aziende/cambio.js';
import {
  ESITI,
  giorniAllaFine,
  isEsito,
  isProroga,
  PROROGHE,
  statoCambio,
} from '../aziende/cambio-tempi.js';
import { eliminazioneIl } from '../aziende/eliminazione.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import { esportaLimiter } from '../http/limits.js';
import { reauthPassword } from '../services/reauth.js';
import type { SessionUser } from '../types.js';
import { scaricaEsportazione } from './aziende-fine.js';
import { confermaPassword } from './conferma-password.js';
import { ICONE_SEZIONI, SEZIONI_IMPOSTAZIONI } from './impostazioni-vista.js';

/**
 * „Esportazione e cambio fornitore“ в настройките (Data Act, чл. 23–30; собственикът, 12 ноември 2026 —
 * точки A1 и A4): ADMIN на фирмата (и MASTER) сваля сам всичко в един файл, иска смяна на доставчика,
 * удължава веднъж прехода или го оттегля. Не по способност (`aziende:settings`), а по роля във фирмата:
 * ADMIN на свършила фирма (`soloEsportazione`) няма способности, но износът е негов до изтриването. Само
 * активна фирма може да иска, удължава и оттегля. Чужда фирма — 404.
 */
export const impostazioniEsportazioneRouter: Router = Router();
const PATH = ESPORTAZIONE_PORTALE_PATH;

const SELECT = {
  id: true,
  name: true,
  deactivatedAt: true,
  cambioRichiestoAt: true,
  cambioFineAt: true,
  cambioEsito: true,
  cambioProrogato: true,
} as const;

/** Фирмите, чийто износ човекът може да свали: MASTER — всички; иначе — където е ADMIN. */
function aziendeEsportabili(user: SessionUser) {
  const ids = user.memberships.filter((m) => m.role === 'ADMIN').map((m) => m.aziendaId);
  return prisma.azienda.findMany({
    where: user.master ? {} : { id: { in: ids } },
    orderBy: { name: 'asc' },
    select: SELECT,
  });
}
type AziendaEsportabile = Awaited<ReturnType<typeof aziendeEsportabili>>[number];

async function scelta(req: Request, raw: unknown) {
  const aziende = await aziendeEsportabili(principalOf(req).user);
  const wanted = typeof raw === 'string' ? raw : null;
  return { aziende, azienda: wanted ? aziende.find((a) => a.id === wanted) : aziende[0] };
}

async function render(
  req: Request,
  res: Response,
  status: number,
  aziende: AziendaEsportabile[],
  azienda: AziendaEsportabile,
  error: string | null = null,
): Promise<void> {
  const user = principalOf(req).user;
  const now = new Date();
  const stato = statoCambio(azienda, now);
  const soloQui = soloEsportazione(user);
  res.status(status).render('impostazioni/sezione', {
    sezione: 'esportazione',
    // Свършила фирма: без другите раздели — човекът там може само да свали данните.
    sezioni: soloQui ? [] : SEZIONI_IMPOSTAZIONI,
    senzaPanoramica: soloQui,
    icone: ICONE_SEZIONI,
    aziende,
    azienda,
    error,
    esportazione: {
      attiva: azienda.deactivatedAt === null,
      stato,
      giorni: azienda.cambioFineAt ? giorniAllaFine(azienda.cambioFineAt, now) : null,
      ultimoGiorno: azienda.cambioFineAt ? new Date(azienda.cambioFineAt.getTime() - 1) : null,
      eliminazione: azienda.deactivatedAt ? eliminazioneIl(azienda.deactivatedAt) : null,
      ultima: await ultimaEsportazione(azienda.id),
      esiti: ESITI,
      proroghe: PROROGHE,
    },
  });
}

impostazioniEsportazioneRouter.get(PATH, requireUser, async (req, res) => {
  const { aziende, azienda } = await scelta(req, req.query.azienda);
  if (!azienda) return notFound(req, res);
  await render(req, res, 200, aziende, azienda);
});

/**
 * Свалянето — с паролата (Правният Разбирач, 12 ноември 2026: откраднатата сесия не изнася всичко на
 * фирмата): опитът се брои в заключването (services/reauth.ts); заключи ли се акаунтът — сесиите падат.
 */
impostazioniEsportazioneRouter.post(
  `${PATH}/scarica`,
  requireUser,
  requireCsrf,
  esportaLimiter,
  async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const { aziende, azienda } = await scelta(req, body.azienda);
    if (!azienda || typeof body.azienda !== 'string') return notFound(req, res);
    const password = typeof body.password === 'string' ? body.password : '';
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: principalOf(req).user.id },
      select: { id: true, passwordHash: true },
    });
    const esito = password ? await reauthPassword(user, password) : 'wrong';
    if (esito === 'locked') {
      // Грешните пароли заключиха акаунта: сесиите вече ги няма — към входа.
      clearSessionCookie(res);
      setFlash(res, 'error', 'flash.bloccatoSessione');
      return res.redirect(303, '/accesso');
    }
    if (esito === 'wrong') {
      return render(req, res, 422, aziende, azienda, 'esportazione.errore.password');
    }
    await scaricaEsportazione(req, res, azienda.id);
  },
);

/** Изборът какво става с данните се сменя до края на прехода (Allegato B, B.3). */
impostazioniEsportazioneRouter.post(`${PATH}/esito`, requireUser, requireCsrf, async (req, res) => {
  const ctx = await attiva(req);
  if (!ctx) return notFound(req, res);
  if (!isEsito(ctx.body.esito)) {
    return render(req, res, 422, ctx.aziende, ctx.azienda, 'esportazione.errore.esito');
  }
  const fatto = await cambiaEsito(ctx.user, ctx.azienda.id, ctx.body.esito);
  setFlash(res, fatto ? 'ok' : 'info', fatto ? 'flash.cambio.esito' : 'flash.cambio.nessuno');
  res.redirect(303, back(ctx.azienda.id));
});

/** Записите — само за активна фирма в списъка на човека; иначе 404 (свършила, чужда). */
async function attiva(req: Request) {
  const body = req.body as Record<string, unknown>;
  const { aziende, azienda } = await scelta(req, body.azienda);
  if (!azienda || azienda.deactivatedAt || typeof body.azienda !== 'string') return null;
  return { aziende, azienda, body, user: principalOf(req).user };
}

const back = (aziendaId: string) => `${PATH}?azienda=${encodeURIComponent(aziendaId)}`;

impostazioniEsportazioneRouter.post(
  `${PATH}/cambio`,
  requireUser,
  requireCsrf,
  async (req, res) => {
    const ctx = await attiva(req);
    if (!ctx) return notFound(req, res);
    const { aziende, azienda, body, user } = ctx;
    if (!isEsito(body.esito)) {
      return render(req, res, 422, aziende, azienda, 'esportazione.errore.esito');
    }
    const conferma = typeof body.conferma === 'string' ? body.conferma.trim() : '';
    if (conferma !== azienda.name || body.letto !== '1') {
      return render(req, res, 422, aziende, azienda, 'esportazione.errore.conferma');
    }
    // С паролата (одитът от 12 ноември 2026): искането спира услугата след 30 дни — не с открадната сесия.
    const password = await confermaPassword(req, res);
    if (password === 'bloccato') return;
    if (password === 'errata')
      return render(req, res, 422, aziende, azienda, 'esportazione.errore.passwordCambio');
    const esito = await richiediCambio(user, azienda.id, body.esito);
    if (esito === 'assente') return notFound(req, res);
    setFlash(res, esito === 'ok' ? 'ok' : 'info', `flash.cambio.${esito}`);
    res.redirect(303, back(azienda.id));
  },
);

impostazioniEsportazioneRouter.post(
  `${PATH}/proroga`,
  requireUser,
  requireCsrf,
  async (req, res) => {
    const ctx = await attiva(req);
    if (!ctx) return notFound(req, res);
    const giorni = Number(ctx.body.giorni);
    if (!isProroga(giorni)) {
      return render(req, res, 422, ctx.aziende, ctx.azienda, 'esportazione.errore.proroga');
    }
    const fatto = await prorogaCambio(ctx.user, ctx.azienda.id, giorni);
    setFlash(
      res,
      fatto ? 'ok' : 'info',
      fatto ? 'flash.cambio.prorogato' : 'flash.cambio.nonProrogabile',
    );
    res.redirect(303, back(ctx.azienda.id));
  },
);

impostazioniEsportazioneRouter.post(
  `${PATH}/annulla`,
  requireUser,
  requireCsrf,
  async (req, res) => {
    const ctx = await attiva(req);
    if (!ctx) return notFound(req, res);
    const fatto = await annullaCambio(ctx.user, ctx.azienda.id);
    setFlash(res, fatto ? 'ok' : 'info', fatto ? 'flash.cambio.annullato' : 'flash.cambio.nessuno');
    res.redirect(303, back(ctx.azienda.id));
  },
);

function notFound(req: Request, res: Response): void {
  sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
}
