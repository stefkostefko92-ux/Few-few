import { personeOccupate } from '../abbonamenti/persone.js';
import { maxPersone } from '../abbonamenti/regole.js';
import { writeAudit } from '../audit.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { conservaFinoDa } from '../legale/emissioni.js';
import { sigilloDi } from '../legale/sigillo.js';
import { VERSIONE } from '../legale/versioni.js';
import { logger } from '../logger.js';
import type { SessionUser } from '../types.js';
import { clienteAttivo, originiCheckout } from './config.js';
import { offertaDi } from './offerta.js';
import { segnaFallito } from './riconcilia.js';
import { creaOrdine, ErroreRevolut } from './revolut.js';

/**
 * Плащането на план (#31; условията 2026-11-12, чл. 12): офертата се записва и запечатва (чл. 19.1 a) ПРЕДИ
 * Revolut; сумата — от плана на сървъра; поръчката в Revolut носи нашия id. Периодът се дава САМО за поръчка,
 * прочетена обратно от Revolut като `completed` със същата сума и валута — при връщането на човека, от
 * подписания webhook или от поддръжката — веднъж (редът на плащането и на фирмата `FOR UPDATE`, условно
 * „IN_ATTESA“). Планът, купен по време на пробата или на друг план, започва от края им (чл. 12.3).
 */

type T = (key: string, p?: Record<string, string | number>) => string;

/** Полетата на запечатания запис на приетата оферта (src/legale/sigillo.ts) — в този ред. */
export const CAMPI_OFFERTA = [
  'at',
  'userId',
  'userNome',
  'userEmail',
  'aziendaId',
  'aziendaNome',
  'ragioneSociale',
  'sede',
  'partitaIva',
  'livello',
  'mesi',
  'imponibileCent',
  'ivaCent',
  'totaleCent',
  'versione',
  'hash',
  'ip',
  'userAgent',
  'pagamentoId',
] as const;

export type EsitoAvvio =
  | { ok: true; checkoutUrl: string }
  | { ok: false; errore: 'spenti' | 'piano' | 'persone' | 'revolut' };

export interface Dichiarati {
  ragioneSociale: string;
  sede: string;
  partitaIva: { numero: string; paese: string };
}

/** Офертата за показване и за записа — от плана и от фирмата сега. */
export async function preparaOfferta(
  t: T,
  user: { email: string },
  aziendaId: string,
  piano: { livello: number; mesi: number; prezzoCent: number },
  dichiarati: Dichiarati,
  now: Date = new Date(),
) {
  const azienda = await prisma.azienda.findUniqueOrThrow({
    where: { id: aziendaId },
    select: { name: true, abbonamentoFino: true },
  });
  const posti = await personeOccupate(prisma, aziendaId, now);
  const occupati = posti.membri + posti.inviti;
  const offerta = offertaDi(t, {
    ...dichiarati,
    ...piano,
    utentiAttuali: occupati,
    email: user.email,
    versione: VERSIONE.CONDIZIONI,
    fineAttuale: azienda.abbonamentoFino,
    now,
  });
  const max = maxPersone(piano.livello);
  return { azienda, offerta, occupati, basta: max === null || occupati <= max };
}

export async function avviaPagamento(
  t: T,
  user: SessionUser,
  aziendaId: string,
  pianoId: string,
  dichiarati: Dichiarati,
  ctx: { ip: string | null; userAgent: string | null },
): Promise<EsitoAvvio> {
  const cli = await clienteAttivo();
  if (!cli) return { ok: false, errore: 'spenti' };
  const piano = await prisma.pianoAbbonamento.findFirst({ where: { id: pianoId, attivo: true } });
  if (!piano) return { ok: false, errore: 'piano' };
  const now = new Date();
  const { azienda, offerta, basta } = await preparaOfferta(
    t,
    user,
    aziendaId,
    piano,
    dichiarati,
    now,
  );
  // „Без срок“ (фирмите отпреди — чл. 12.8) не купува: планът би въвел срок, който още не важи за нея.
  if (!azienda.abbonamentoFino) return { ok: false, errore: 'piano' };
  if (!basta) return { ok: false, errore: 'persone' };
  const pagamento = await prisma.$transaction(async (tx) => {
    const p = await tx.pagamento.create({
      data: {
        aziendaId,
        aziendaNome: azienda.name,
        pianoId: piano.id,
        livello: piano.livello,
        mesi: piano.mesi,
        imponibileCent: offerta.importo.imponibile,
        ivaCent: offerta.importo.iva,
        totaleCent: offerta.importo.totale,
        regimeIva: offerta.importo.regime,
        ragioneSociale: dichiarati.ragioneSociale,
        sede: dichiarati.sede,
        partitaIva: dichiarati.partitaIva.numero,
        ambiente: cli.ambiente,
        createdById: user.id,
      },
    });
    const campi = {
      at: now,
      userId: user.id,
      userNome: user.name.slice(0, 120),
      userEmail: user.email,
      aziendaId,
      aziendaNome: azienda.name,
      ragioneSociale: dichiarati.ragioneSociale,
      sede: dichiarati.sede,
      partitaIva: dichiarati.partitaIva.numero,
      livello: piano.livello,
      mesi: piano.mesi,
      imponibileCent: offerta.importo.imponibile,
      ivaCent: offerta.importo.iva,
      totaleCent: offerta.importo.totale,
      versione: VERSIONE.CONDIZIONI,
      hash: offerta.hash,
      ip: ctx.ip?.slice(0, 45) ?? null,
      userAgent: ctx.userAgent?.slice(0, 300) ?? null,
      pagamentoId: p.id,
    };
    await tx.accettazioneOfferta.create({
      data: {
        ...campi,
        testo: offerta.testo,
        sigillo: sigilloDi(campi, CAMPI_OFFERTA),
        conservaFino: conservaFinoDa(now),
      },
    });
    await writeAudit(
      {
        actorId: user.id,
        action: 'PAGAMENTO_AVVIATO',
        aziendaId,
        targetType: 'pagamento',
        targetId: p.id,
        meta: { livello: piano.livello, mesi: piano.mesi, totaleCent: offerta.importo.totale },
      },
      tx,
    );
    return p;
  });
  try {
    const ordine = await creaOrdine(cli.c, {
      amount: offerta.importo.totale,
      description:
        `Rilievi Impianti — Premium livello ${piano.livello}, ${piano.mesi} mesi — ${azienda.name}`.slice(
          0,
          200,
        ),
      reference: pagamento.id,
      redirectUrl: `${config().PUBLIC_BASE_URL}/impostazioni/abbonamento/esito/${pagamento.id}`,
    });
    const checkout = new URL(ordine.checkout_url!);
    if (!originiCheckout().includes(checkout.origin)) throw new ErroreRevolut('risposta');
    await prisma.pagamento.update({
      where: { id: pagamento.id },
      data: { revolutOrderId: ordine.id, checkoutUrl: checkout.href },
    });
    return { ok: true, checkoutUrl: checkout.href };
  } catch (error) {
    if (!(error instanceof ErroreRevolut)) throw error;
    logger.warn({ stato: error.stato }, 'revolut: поръчката не се създаде');
    await segnaFallito(pagamento.id, 'FALLITO', user.id);
    return { ok: false, errore: 'revolut' };
  }
}
