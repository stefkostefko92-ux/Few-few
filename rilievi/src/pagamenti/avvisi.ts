import { config } from '../config.js';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { sendMail, type MailMessage } from '../mail/mailer.js';
import {
  pagamentoInVerificaMail,
  pagamentoMasterMail,
  pagamentoRicevutoMail,
  pagamentoVerificaMasterMail,
} from '../mail/templates-pagamenti.js';
import type { EsitoApplica } from './applica.js';

/**
 * Писмата след плащане (#31): копието на приетата оферта до платилия (чл. 12.1; Дир. 2000/31, чл. 11) и известие
 * до всеки MASTER — ново плащане за фактуриране (фактурата е обещана до 5 дни) или плащане, което чака проверка
 * (платено, а периодът не е даден). Тръгват след отговора; писмо, което не тръгне, се записва с номера на плащането.
 */

async function invia(pagamento: string, messaggio: MailMessage): Promise<void> {
  const esito = await sendMail(messaggio);
  if (esito === 'failed')
    logger.error({ evento: 'pagamento.mail_fallita', pagamento }, 'pagamento: email non inviata');
}

const indirizziMaster = async (): Promise<string[]> =>
  (
    await prisma.user.findMany({
      where: { master: true, deactivatedAt: null },
      select: { email: true },
    })
  ).map((m) => m.email);

const emailDi = async (userId: string | null): Promise<string | null> =>
  userId
    ? ((await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email ??
      null)
    : null;

export async function avvisaDopoPagamento(esito: EsitoApplica): Promise<void> {
  if (!esito || esito.tipo === 'prova') return;
  const p = esito.pagamento;
  try {
    const link = `${config().PUBLIC_BASE_URL}/master/pagamenti`;
    const [master, chi] = await Promise.all([indirizziMaster(), emailDi(p.createdById)]);
    if (esito.tipo === 'verifica') {
      for (const to of master)
        await invia(
          p.id,
          pagamentoVerificaMasterMail({ to, pagamento: p, motivo: esito.motivo, link }),
        );
      if (chi) await invia(p.id, pagamentoInVerificaMail({ to: chi, pagamento: p }));
      return;
    }
    const prova = await prisma.accettazioneOfferta.findUnique({
      where: { pagamentoId: p.id },
      select: { testo: true },
    });
    if (chi && prova)
      await invia(
        p.id,
        pagamentoRicevutoMail({
          to: chi,
          azienda: p.aziendaNome,
          totaleCent: p.totaleCent,
          ultimoGiorno: new Date(esito.fine.getTime() - 1),
          offerta: prova.testo,
        }),
      );
    for (const to of master)
      await invia(
        p.id,
        pagamentoMasterMail({ to, pagamento: p, ricalcolato: esito.ricalcolato, link }),
      );
  } catch (error) {
    logger.error(
      { evento: 'pagamento.mail_fallita', err: errorMessage(error), pagamento: p.id },
      'pagamento: email non inviate',
    );
  }
}
