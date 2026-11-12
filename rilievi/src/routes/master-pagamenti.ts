import type { AmbienteRevolut } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import { leggiConfig, registraIlWebhook, salvaConfig } from '../pagamenti/config.js';
import { formatoEuro, GIORNI_FATTURA } from '../pagamenti/offerta.js';
import { attivaPiano, creaPiano, leggiPiano, tuttiIPiani } from '../pagamenti/piani.js';
import { elencoContestazioni } from '../pagamenti/contestazioni.js';
import { riconcilia } from '../pagamenti/riconcilia.js';
import { ErroreRevolut } from '../pagamenti/revolut.js';
import { rimborsiDovuti } from '../pagamenti/rimborsi.js';
import { isProduction } from '../config.js';
import { clearSessionCookie } from '../auth/sessions.js';
import { sendMail } from '../mail/mailer.js';
import { pagamentiCambiatiMail } from '../mail/templates-pagamenti.js';
import { reauthPassword } from '../services/reauth.js';

/**
 * „Pagamenti“ в конзолата на MASTER (#31): Revolut Business вкл./изкл., sandbox/продукция, ключът (само се пише),
 * webhook-ът с един бутон, плановете (добавяне, изключване — без триене) и последните плащания със сверка на ръка.
 * Само `aziende:manage`.
 */
export const masterPagamentiRouter: Router = Router();
const manage = requireCapability('aziende:manage');
const PATH = '/master/pagamenti';

async function vista(
  res: Response,
  status: number,
  extra: { errore?: string | null; erroreConfig?: string | null } = {},
): Promise<void> {
  const riga = {
    id: true,
    createdAt: true,
    completatoAt: true,
    aziendaNome: true,
    livello: true,
    mesi: true,
    totaleCent: true,
    stato: true,
    verificaMotivo: true,
    ragioneSociale: true,
    partitaIva: true,
    rimborsoCent: true,
    viesConsultazione: true,
    viesAt: true,
    viesNome: true,
  } as const;
  const [cfg, piani, pagamenti, daVerificare, daFatturare, rimborsi, contestazioni] =
    await Promise.all([
      leggiConfig(),
      tuttiIPiani(),
      prisma.pagamento.findMany({ orderBy: { createdAt: 'desc' }, take: 50, select: riga }),
      // Платено, а периодът не е даден — чака решението на MASTER (връщане или на ръка).
      prisma.pagamento.findMany({
        where: { stato: 'DA_VERIFICARE' },
        orderBy: { createdAt: 'asc' },
        take: 100,
        select: riga,
      }),
      // За фактуриране (до 5 дни от плащането): завършените без отметка; пробите в Sandbox на живия сървър — не.
      prisma.pagamento.findMany({
        where: {
          stato: 'COMPLETATO',
          fatturataAt: null,
          ...(isProduction() ? { ambiente: 'PRODUZIONE' as const } : {}),
        },
        orderBy: { completatoAt: 'asc' },
        take: 100,
        select: riga,
      }),
      rimborsiDovuti(),
      elencoContestazioni(),
    ]);
  res.status(status).render('master/pagamenti', {
    cfg: {
      attivo: cfg.attivo,
      ambiente: cfg.ambiente,
      haChiave: cfg.chiave !== null,
      webhook: cfg.webhookId !== null && cfg.webhookSegreto !== null,
      updatedAt: cfg.updatedAt,
      updatedBy: cfg.updatedBy,
    },
    piani,
    pagamenti,
    daVerificare,
    daFatturare,
    rimborsi,
    contestazioni,
    giorniFattura: GIORNI_FATTURA,
    euro: formatoEuro,
    errore: extra.errore ?? null,
    erroreConfig: extra.erroreConfig ?? null,
  });
}

const corpo = (req: Request) => req.body as Record<string, unknown>;

masterPagamentiRouter.get(PATH, manage, (_req, res) => vista(res, 200));

masterPagamentiRouter.post(PATH, manage, requireCsrf, async (req, res) => {
  const b = corpo(req);
  const ambiente: AmbienteRevolut = b.ambiente === 'PRODUZIONE' ? 'PRODUZIONE' : 'SANDBOX';
  const raw = typeof b.chiave === 'string' ? b.chiave.trim() : '';
  if (raw.length > 300 || /\s|\p{Cc}/u.test(raw))
    return vista(res, 422, { erroreConfig: 'pagamenti.master.senzaChiave' });
  // Нов ключ или друга среда решават къде отиват парите на клиентите: само с паролата (откраднатата сесия не
  // пренасочва плащанията), с писмо до всички MASTER.
  const prima = await leggiConfig();
  const delicato = raw !== '' || prima.ambiente !== ambiente;
  if (delicato) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: principalOf(req).user.id },
      select: { id: true, passwordHash: true },
    });
    const password = typeof b.password === 'string' ? b.password : '';
    const esito = password ? await reauthPassword(user, password) : 'wrong';
    if (esito === 'locked') {
      clearSessionCookie(res);
      setFlash(res, 'error', 'flash.bloccatoSessione');
      return res.redirect(303, '/accesso');
    }
    if (esito === 'wrong') return vista(res, 422, { erroreConfig: 'pagamenti.master.password' });
  }
  const esito = await salvaConfig(principalOf(req).user.id, {
    attivo: b.attivo === '1',
    ambiente,
    chiave: raw === '' ? null : raw,
  });
  if (esito === 'senzaChiave')
    return vista(res, 422, { erroreConfig: 'pagamenti.master.senzaChiave' });
  if (delicato) await avvisaMaster(principalOf(req).user.name, ambiente, raw !== '');
  setFlash(res, 'ok', 'pagamenti.master.salvato');
  res.redirect(303, PATH);
});

masterPagamentiRouter.post(`${PATH}/webhook`, manage, requireCsrf, async (req, res) => {
  try {
    const esito = await registraIlWebhook(principalOf(req).user.id);
    if (esito === 'senzaChiave') setFlash(res, 'error', 'pagamenti.master.senzaChiave');
    else if (esito === 'senzaDispute') setFlash(res, 'info', 'rimborsi.webhookSenzaDispute');
    else setFlash(res, 'ok', 'pagamenti.master.webhookOk');
  } catch (error) {
    if (!(error instanceof ErroreRevolut)) throw error;
    setFlash(res, 'error', 'pagamenti.master.webhookErrore', { codice: String(error.stato) });
  }
  res.redirect(303, PATH);
});

masterPagamentiRouter.post(`${PATH}/piani`, manage, requireCsrf, async (req, res) => {
  const dati = leggiPiano(corpo(req));
  if (!dati) return vista(res, 422, { errore: 'pagamenti.master.pianoErrore' });
  await creaPiano(principalOf(req).user.id, dati);
  setFlash(res, 'ok', 'pagamenti.master.pianoCreato');
  res.redirect(303, `${PATH}#h-piani`);
});

masterPagamentiRouter.post(`${PATH}/piani/:id`, manage, requireCsrf, async (req, res) => {
  await attivaPiano(principalOf(req).user.id, String(req.params.id), corpo(req).attivo === '1');
  res.redirect(303, `${PATH}#h-piani`);
});

masterPagamentiRouter.post(`${PATH}/:id/verifica`, manage, requireCsrf, async (req, res) => {
  const stato = await riconcilia(String(req.params.id));
  if (stato) setFlash(res, 'info', `pagamenti.master.statoPagamento.${stato}`);
  res.redirect(303, `${PATH}#h-pagamenti`);
});

/** Писмо до всеки MASTER: кой и какво е сменил (без ключа). */
async function avvisaMaster(chi: string, ambiente: AmbienteRevolut, chiaveNuova: boolean) {
  const master = await prisma.user.findMany({
    where: { master: true, deactivatedAt: null },
    select: { email: true },
  });
  for (const m of master)
    await sendMail(pagamentiCambiatiMail({ to: m.email, chi, ambiente, chiaveNuova }));
}
