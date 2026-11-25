import type { StatoOrdine } from '@prisma/client';
import { z } from 'zod';
import { writeAudit } from '../audit.js';
import { aziendaWhere, type Scope } from '../auth/scope.js';
import { prisma } from '../db.js';
import { sendMail, type MailResult } from '../mail/mailer.js';
import { ordineMail } from '../mail/templates.js';
import { ordineConsentito } from '../schede/approvazione.js';
import type { SchedaFull } from '../schede/service.js';
import type { SessionUser } from '../types.js';
import { moduloDellaScheda } from './modulo-scheda.js';
import type { ModuloSlot } from './registry.js';

/**
 * Поръчката към доставчика от портала (собственикът, 12 ноември 2026 — точка C2): PDF-ът на модула на
 * картата по имейл (Brevo) до доставчик от адресника или до написан адрес, с бележка по избор; отговорът —
 * до пратилия (`replyTo`). Само от одобрена карта, ако фирмата ползва одобрението (C7). Записва се само
 * тръгналата: `OrdineFornitore` (адресът — той е поръчката; износът го носи) и одит без адреса. После —
 * „confermato“ (доставчикът е потвърдил, на ръка) или „annullato“.
 */
export const MAX_MESSAGGIO = 2000;

export const destinatarioSchema = z.object({
  nome: z
    .string()
    .transform((v) =>
      v
        .replace(/\p{Cc}/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .pipe(z.string().min(1).max(120)),
  email: z.string().trim().toLowerCase().max(254).email(),
});

export const messaggioSchema = z
  .string()
  .transform((v) =>
    v
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
      .trim(),
  )
  .pipe(z.string().max(MAX_MESSAGGIO))
  .transform((v) => (v === '' ? null : v));

export type EsitoInvio = MailResult | 'approvazione' | 'modulo';

export async function inviaOrdine(params: {
  scheda: SchedaFull;
  slot: ModuloSlot;
  destinatario: z.output<typeof destinatarioSchema>;
  messaggio: string | null;
  actor: SessionUser;
}): Promise<EsitoInvio> {
  const { scheda, slot, destinatario, messaggio, actor } = params;
  const azienda = await prisma.azienda.findUniqueOrThrow({
    where: { id: scheda.aziendaId },
    select: { name: true, approvazioneSchede: true },
  });
  if (!ordineConsentito(scheda, azienda)) return 'approvazione';
  const modulo = await moduloDellaScheda(scheda, slot);
  if (!modulo) return 'modulo';
  const esito = await sendMail(
    ordineMail({
      to: destinatario.email,
      replyTo: actor.email,
      fornitore: destinatario.nome,
      azienda: azienda.name,
      mittente: actor.name,
      modulo: modulo.titolo,
      impianto: [scheda.indirizzo, scheda.matricola].filter(Boolean).join(' · '),
      messaggio,
      pdf: modulo.pdf,
      filename: modulo.nome,
    }),
  );
  if (esito !== 'sent') return esito;
  await prisma.$transaction(async (tx) => {
    const ordine = await tx.ordineFornitore.create({
      data: {
        aziendaId: scheda.aziendaId,
        schedaId: scheda.id,
        modulo: slot.path,
        destinatarioNome: destinatario.nome,
        destinatarioEmail: destinatario.email,
        messaggio,
        inviatoDaId: actor.id,
      },
      select: { id: true },
    });
    await writeAudit(
      {
        actorId: actor.id,
        action: 'ORDINE_INVIATO',
        aziendaId: scheda.aziendaId,
        targetType: 'ordine',
        targetId: ordine.id,
        meta: { modulo: slot.path, scheda: scheda.id },
      },
      tx,
    );
  });
  return 'sent';
}

export const notaSchema = z
  .string()
  .transform((v) =>
    v
      .replace(/\p{Cc}/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  .pipe(z.string().max(1000))
  .transform((v) => (v === '' ? null : v));

/** Пратена → потвърдена или отменена (само от „inviato“); false — няма такава в обхвата или не е пратена. */
export async function aggiornaOrdine(
  scope: Scope,
  id: string,
  stato: Exclude<StatoOrdine, 'INVIATO'>,
  nota: string | null,
  actorId: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const ordine = await tx.ordineFornitore.findFirst({
      where: { id, ...aziendaWhere(scope) },
      select: { aziendaId: true },
    });
    if (!ordine) return false;
    const { count } = await tx.ordineFornitore.updateMany({
      where: { id, stato: 'INVIATO' },
      data: { stato, nota, confermatoAt: stato === 'CONFERMATO' ? new Date() : null },
    });
    if (count === 0) return false;
    await writeAudit(
      {
        actorId,
        action: 'ORDINE_STATO',
        aziendaId: ordine.aziendaId,
        targetType: 'ordine',
        targetId: id,
        meta: { stato },
      },
      tx,
    );
    return true;
  });
}

export function ordiniDellaScheda(schedaId: string) {
  return prisma.ordineFornitore.findMany({
    where: { schedaId },
    orderBy: { inviatoAt: 'desc' },
    select: {
      id: true,
      modulo: true,
      destinatarioNome: true,
      destinatarioEmail: true,
      stato: true,
      inviatoAt: true,
      confermatoAt: true,
      nota: true,
      inviatoDa: { select: { name: true } },
    },
  });
}

export function elencoOrdini(scope: Scope, stato: StatoOrdine | null) {
  return prisma.ordineFornitore.findMany({
    where: { ...aziendaWhere(scope), ...(stato ? { stato } : {}) },
    orderBy: { inviatoAt: 'desc' },
    take: 300,
    select: {
      id: true,
      modulo: true,
      destinatarioNome: true,
      stato: true,
      inviatoAt: true,
      confermatoAt: true,
      scheda: { select: { id: true, indirizzo: true, matricola: true } },
      azienda: { select: { name: true } },
      inviatoDa: { select: { name: true } },
    },
  });
}
