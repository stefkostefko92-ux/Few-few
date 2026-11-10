import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import type { SessionUser } from '../types.js';
import type { DatiCopia } from './copia.js';
import { conservaFinoDa } from './emissioni.js';
import { verificaCodice, type Dichiarati, type EsitoCodice } from './firma.js';
import { CAMPI_ACCETTAZIONE, sigilloDi, taglia } from './sigillo.js';
import { hashTesto, leggiTesto, testoPiano, type TestoLegaleDoc } from './testi.js';

/** Откъде е дошло приемането — пази се в регистъра (чл. 19.1 от условията). */
export interface Contesto {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Пише текста на версията в `TestoLegale` при първото ѝ приемане. Същата версия с друг хеш — грешка:
 * текстът е бил пипнат, без да се вдигне версията (тестът го хваща още преди това).
 */
async function registraTesto(tx: Prisma.TransactionClient, doc: TestoLegaleDoc): Promise<string> {
  const hash = hashTesto(doc);
  await tx.testoLegale.createMany({
    data: [{ tipo: doc.tipo, versione: doc.versione, hash, testo: testoPiano(doc) }],
    skipDuplicates: true,
  });
  const salvato = await tx.testoLegale.findUniqueOrThrow({
    where: { tipo_versione: { tipo: doc.tipo, versione: doc.versione } },
    select: { hash: true },
  });
  if (salvato.hash !== hash)
    throw new Error(`${doc.tipo} ${doc.versione}: текстът е сменен без нова версия`);
  return hash;
}

const contesto = (ctx: Contesto) => ({
  ip: ctx.ip ? taglia(ctx.ip, 45) : null,
  userAgent: ctx.userAgent ? taglia(ctx.userAgent, 300) : null,
});

const persona = (user: SessionUser) => {
  const m = user.memberships[0];
  return {
    userId: user.id,
    userNome: taglia(user.name, 120),
    userEmail: taglia(user.email, 254),
    aziendaId: m?.aziendaId ?? null,
    aziendaNome: m ? taglia(m.aziendaName, 120) : null,
    ruolo: m?.role ?? null,
  };
};

/**
 * Правилата за ползване (чл. 4.5 от условията) — всеки човек сам, с една отметка. Пише доказателството
 * (запечатано), версията за пропуска и одита в една транзакция.
 */
export async function accettaRegole(user: SessionUser, ctx: Contesto): Promise<void> {
  const doc = leggiTesto('REGOLE');
  await prisma.$transaction(async (tx) => {
    const at = new Date();
    const campi = {
      at,
      tipo: doc.tipo,
      versione: doc.versione,
      hash: await registraTesto(tx, doc),
      clausole: [] as string[],
      ...persona(user),
      ...contesto(ctx),
    };
    await tx.accettazione.create({
      data: {
        ...campi,
        sigillo: sigilloDi(campi, CAMPI_ACCETTAZIONE),
        conservaFino: conservaFinoDa(at),
      },
    });
    await tx.user.update({ where: { id: user.id }, data: { regoleVersione: doc.versione } });
    await writeAudit(
      {
        actorId: user.id,
        action: 'REGOLE_ACCETTATE',
        aziendaId: campi.aziendaId,
        targetType: 'user',
        targetId: user.id,
        meta: { versione: doc.versione },
      },
      tx,
    );
  });
}

export type EsitoFirma =
  { ok: true; firmato: DatiCopia; copia: Buffer } | Extract<EsitoCodice, { ok: false }>;

/**
 * Втората стъпка: специалното одобрение на клаузите (чл. 24), подписано с кода (FES по чл. 3.1 от
 * условията и Cass. 20945/2026). Кодът се проверява и изгаря, ролята — наново под ключ; копието се прави
 * тук, за да влезе отпечатъкът му в запечатания ред.
 */
export async function firmaCondizioni(
  user: SessionUser,
  codice: string,
  ctx: Contesto,
  copiaDi: (firmato: DatiCopia) => Promise<Buffer>,
): Promise<EsitoFirma> {
  const doc = leggiTesto('CONDIZIONI');
  return prisma.$transaction(
    async (tx) => {
      const esito = await verificaCodice(tx, user, codice);
      if (!esito.ok) return esito;
      const { sfida } = esito;
      const dichiarati = sfida.dichiarati as unknown as Dichiarati;
      const at = new Date();
      const hash = await registraTesto(tx, doc);
      const firmato: DatiCopia = {
        at,
        versione: doc.versione,
        hash,
        clausole: doc.clausoleSpecifiche.map((c) => c.numero),
        ragioneSociale: dichiarati.ragioneSociale,
        sede: dichiarati.sede,
        partitaIva: dichiarati.partitaIva,
        nome: user.name,
        email: user.email,
        otpEmail: sfida.email,
        otpInviatoAt: sfida.inviatoAt,
        otpVerificatoAt: esito.verificatoAt,
      };
      const copia = await copiaDi(firmato);
      const campi = {
        at,
        tipo: doc.tipo,
        versione: doc.versione,
        hash,
        clausole: [...firmato.clausole],
        ...persona(user),
        aziendaId: sfida.aziendaId,
        aziendaNome: taglia(esito.aziendaNome, 120),
        ruolo: 'ADMIN' as const,
        ragioneSociale: dichiarati.ragioneSociale,
        sede: dichiarati.sede,
        partitaIva: dichiarati.partitaIva,
        otpEmail: sfida.email,
        otpInviatoAt: sfida.inviatoAt,
        otpVerificatoAt: esito.verificatoAt,
        ...contesto(ctx),
        copiaHash: createHash('sha256').update(copia).digest('hex'),
      };
      await tx.accettazione.create({
        data: {
          ...campi,
          sigillo: sigilloDi(campi, CAMPI_ACCETTAZIONE),
          conservaFino: conservaFinoDa(at),
        },
      });
      await tx.azienda.update({
        where: { id: sfida.aziendaId },
        data: { condizioniVersione: doc.versione },
      });
      await writeAudit(
        {
          actorId: user.id,
          action: 'CONDIZIONI_ACCETTATE',
          aziendaId: sfida.aziendaId,
          targetType: 'azienda',
          targetId: sfida.aziendaId,
          meta: { versione: doc.versione },
        },
        tx,
      );
      return { ok: true, firmato, copia } as const;
    },
    { timeout: 15_000 },
  );
}

/** Администраторите на фирмата — за човека, който чака тях да приемат условията. */
export async function amministratoriDi(aziendaId: string): Promise<string[]> {
  const rows = await prisma.membership.findMany({
    where: { aziendaId, role: 'ADMIN', user: { deactivatedAt: null } },
    select: { user: { select: { name: true } } },
    orderBy: { user: { name: 'asc' } },
  });
  return rows.map((row) => row.user.name);
}

/** Последното приемане на условията за фирмата — за копието в портала; null — няма. */
export function ultimaAccettazione(aziendaId: string) {
  return prisma.accettazione.findFirst({
    where: { aziendaId, tipo: 'CONDIZIONI' },
    orderBy: { at: 'desc' },
  });
}
