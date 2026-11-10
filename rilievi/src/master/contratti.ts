import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { CAMPI_ACCETTAZIONE, sigilloValido } from '../legale/sigillo.js';
import { VERSIONE } from '../legale/versioni.js';
import type { SessionUser } from '../types.js';

/**
 * Договорът на фирмата: `firmate` — текущата версия е подписана с код (ред в регистъра); `esistente` —
 * отбелязана като приета от миграцията за фирмите отпреди условията (без ред — подпис, който не е бил,
 * не се измисля); `attesa` — чака подписа на администратора ѝ.
 */
export type StatoContratto = 'firmate' | 'esistente' | 'attesa';

export function statoContratto(
  condizioniVersione: string | null,
  ultimaVersioneFirmata: string | null,
): StatoContratto {
  if (condizioniVersione !== VERSIONE.CONDIZIONI) return 'attesa';
  return ultimaVersioneFirmata === VERSIONE.CONDIZIONI ? 'firmate' : 'esistente';
}

export interface RigaContratto {
  id: string;
  name: string;
  disattivata: boolean;
  stato: StatoContratto;
  firma: { at: Date; nome: string; versione: string; integro: boolean; copia: boolean } | null;
  regole: { accettate: number; totale: number };
  admin: number;
}

/** Всички фирми с договора им — първо чакащите, после по име. */
export async function elencoContratti(): Promise<RigaContratto[]> {
  const [aziende, firme, persone, regole, admin] = await Promise.all([
    prisma.azienda.findMany({
      select: { id: true, name: true, deactivatedAt: true, condizioniVersione: true },
      orderBy: { name: 'asc' },
    }),
    // Последният подпис на всяка фирма (DISTINCT ON — един ред за фирма).
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT ON ("aziendaId") id FROM "Accettazione"
      WHERE tipo = 'CONDIZIONI' AND "aziendaId" IS NOT NULL
      ORDER BY "aziendaId", at DESC`,
    prisma.membership.groupBy({
      by: ['aziendaId'],
      where: { user: { deactivatedAt: null } },
      _count: { _all: true },
    }),
    prisma.membership.groupBy({
      by: ['aziendaId'],
      where: { user: { deactivatedAt: null, regoleVersione: VERSIONE.REGOLE } },
      _count: { _all: true },
    }),
    prisma.membership.groupBy({
      by: ['aziendaId'],
      where: { role: 'ADMIN', user: { deactivatedAt: null } },
      _count: { _all: true },
    }),
  ]);
  const righe = await prisma.accettazione.findMany({
    where: { id: { in: firme.map((f) => f.id) } },
  });
  const firmaDi = new Map(righe.map((r) => [r.aziendaId, r]));
  const conta = (rows: Array<{ aziendaId: string; _count: { _all: number } }>) =>
    new Map(rows.map((r) => [r.aziendaId, r._count._all]));
  const [totali, accettate, amministratori] = [conta(persone), conta(regole), conta(admin)];
  const ordine: Record<StatoContratto, number> = { attesa: 0, esistente: 1, firmate: 2 };
  return aziende
    .map((a): RigaContratto => {
      const f = firmaDi.get(a.id);
      return {
        id: a.id,
        name: a.name,
        disattivata: a.deactivatedAt !== null,
        stato: statoContratto(a.condizioniVersione, f?.versione ?? null),
        firma: f
          ? {
              at: f.at,
              nome: f.userNome,
              versione: f.versione,
              integro: sigilloValido(f, CAMPI_ACCETTAZIONE),
              copia: Boolean(f.otpEmail && f.otpInviatoAt && f.otpVerificatoAt),
            }
          : null,
        regole: { accettate: accettate.get(a.id) ?? 0, totale: totali.get(a.id) ?? 0 },
        admin: amministratori.get(a.id) ?? 0,
      };
    })
    .sort(
      (x, y) =>
        Number(x.disattivata) - Number(y.disattivata) ||
        ordine[x.stato] - ordine[y.stato] ||
        x.name.localeCompare(y.name, 'it'),
    );
}

/**
 * „Richiedi la firma“: фирма, отбелязана като приела без подпис (`esistente`), става клиент — нейният
 * ADMIN подписва наистина (DEPLOY.md: `condizioniVersione = NULL`). Само при `esistente`: подписаната не
 * се отменя оттук, чакащата вече чака. Хората ѝ — от следващата заявка (членството се чете при всяка).
 */
export async function richiediFirma(
  master: SessionUser,
  aziendaId: string,
): Promise<'ok' | 'stato' | 'missing'> {
  return prisma.$transaction(async (tx) => {
    const azienda = await tx.azienda.findUnique({
      where: { id: aziendaId },
      select: { condizioniVersione: true },
    });
    if (!azienda) return 'missing';
    const firmata = await tx.accettazione.findFirst({
      where: { aziendaId, tipo: 'CONDIZIONI', versione: VERSIONE.CONDIZIONI },
      select: { id: true },
    });
    if (
      statoContratto(azienda.condizioniVersione, firmata ? VERSIONE.CONDIZIONI : null) !==
      'esistente'
    )
      return 'stato';
    const { count } = await tx.azienda.updateMany({
      where: { id: aziendaId, condizioniVersione: VERSIONE.CONDIZIONI },
      data: { condizioniVersione: null },
    });
    if (count === 0) return 'stato';
    await writeAudit(
      {
        actorId: master.id,
        action: 'CONDIZIONI_RICHIESTE',
        aziendaId,
        targetType: 'azienda',
        targetId: aziendaId,
        meta: { versione: VERSIONE.CONDIZIONI },
      },
      tx,
    );
    return 'ok';
  });
}
