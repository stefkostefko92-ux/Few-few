import { prisma } from '../db.js';
import { versioniValide } from '../legale/versioni.js';
import { DAY } from '../time.js';
import { inizioSettimana } from './tempo.js';

/** Колко седмици назад гледа графиката на дейността. */
export const SETTIMANE = 12;

/** Действията в одита, които са работа по уредбите — графиката ги брои по вид. */
export const SERIE = {
  schede: ['SCHEDA_CREATE', 'SCHEDA_UPDATE'],
  assistenza: [
    'INTERVENTO_CREATE',
    'INTERVENTO_CONFIRM',
    'VERBALE_CREATE',
    'VERBALE_CONFIRM',
    'CARTELLO_CREATE',
  ],
  calcoli: ['ARGANO_CALCOLO', 'LIMITATORE_CALCOLO'],
} as const;

export type Serie = keyof typeof SERIE;

export interface Settimana {
  /** Понеделникът на седмицата (UTC). */
  da: Date;
  valori: Record<Serie, number>;
  totale: number;
}

const vuota = (): Record<Serie, number> => ({ schede: 0, assistenza: 0, calcoli: 0 });

/**
 * Броевете по седмица и вид → `SETTIMANE` седмици до `now` включително, най-старата първа; седмица без
 * нищо е с нули (графиката е непрекъсната). Чисто, без база.
 */
export function perSettimana(
  righe: ReadonlyArray<{ settimana: Date; action: string; n: number }>,
  now: Date,
): Settimana[] {
  const ultima = inizioSettimana(now).getTime();
  const settimane: Settimana[] = Array.from({ length: SETTIMANE }, (_, i) => ({
    da: new Date(ultima - (SETTIMANE - 1 - i) * 7 * DAY),
    valori: vuota(),
    totale: 0,
  }));
  const indice = new Map(settimane.map((s) => [s.da.getTime(), s]));
  for (const riga of righe) {
    const s = indice.get(inizioSettimana(riga.settimana).getTime());
    const serie = (Object.keys(SERIE) as Serie[]).find((k) =>
      (SERIE[k] as readonly string[]).includes(riga.action),
    );
    if (!s || !serie) continue;
    s.valori[serie] += riga.n;
    s.totale += riga.n;
  }
  return settimane;
}

/** Отпечатъкът на всичко, което MASTER вижда на първата страница на конзолата. */
export async function panoramica(now: Date = new Date()) {
  const da30 = new Date(now.getTime() - 30 * DAY);
  const daGrafico = new Date(inizioSettimana(now).getTime() - (SETTIMANE - 1) * 7 * DAY);
  const azioni = Object.values(SERIE).flat();
  const [
    aziendeAttive,
    aziendeSpente,
    aziendeSenzaFirma,
    utenti,
    utentiAttivi30,
    utenti2fa,
    schede,
    schede30,
    cestino,
    interventi,
    verbali,
    cartelli,
    calcoliArgano,
    calcoliLimitatore,
    emissioni30,
    richieste,
    righe,
    perAzienda,
  ] = await Promise.all([
    prisma.azienda.count({ where: { deactivatedAt: null } }),
    prisma.azienda.count({ where: { deactivatedAt: { not: null } } }),
    prisma.azienda.count({
      where: {
        deactivatedAt: null,
        OR: [{ condizioniVersione: null }, { condizioniVersione: { notIn: versioniValide() } }],
      },
    }),
    prisma.user.count({ where: { master: false, deactivatedAt: null } }),
    prisma.user.count({
      where: { master: false, deactivatedAt: null, lastLoginAt: { gte: da30 } },
    }),
    prisma.user.count({
      where: { master: false, deactivatedAt: null, totpEnabledAt: { not: null } },
    }),
    prisma.scheda.count({ where: { deletedAt: null } }),
    prisma.scheda.count({ where: { deletedAt: null, createdAt: { gte: da30 } } }),
    prisma.scheda.count({ where: { deletedAt: { not: null } } }),
    prisma.intervento.count(),
    prisma.verbale.count(),
    prisma.cartello.count(),
    prisma.calcoloArgano.count(),
    prisma.calcoloLimitatore.count(),
    prisma.emissioneCalcolo.count({ where: { at: { gte: da30 } } }),
    prisma.accessRequest.count({ where: { status: 'NEW' } }),
    prisma.$queryRaw<Array<{ settimana: Date; action: string; n: number }>>`
      SELECT date_trunc('week', "at") AS settimana, "action", count(*)::int AS n
      FROM "AuditLog"
      WHERE "at" >= ${daGrafico} AND "action" = ANY(${azioni})
      GROUP BY 1, 2`,
    prisma.$queryRaw<Array<{ aziendaId: string; n: number }>>`
      SELECT "aziendaId", count(*)::int AS n
      FROM "AuditLog"
      WHERE "at" >= ${da30} AND "aziendaId" IS NOT NULL AND "action" = ANY(${azioni})
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 5`,
  ]);
  const nomi = await prisma.azienda.findMany({
    where: { id: { in: perAzienda.map((r) => r.aziendaId) } },
    select: { id: true, name: true },
  });
  const nome = new Map(nomi.map((a) => [a.id, a.name]));
  return {
    aziende: { attive: aziendeAttive, disattivate: aziendeSpente, senzaFirma: aziendeSenzaFirma },
    utenti: { attivi: utenti, attivi30: utentiAttivi30, dueFattori: utenti2fa },
    schede: { totale: schede, ultimi30: schede30, cestino },
    documenti: { interventi, verbali, cartelli },
    calcoli: { argano: calcoliArgano, limitatore: calcoliLimitatore, emissioni30 },
    richieste,
    settimane: perSettimana(righe, now),
    piuAttive: perAzienda
      .filter((r) => nome.has(r.aziendaId))
      .map((r) => ({ id: r.aziendaId, name: nome.get(r.aziendaId) ?? '', n: r.n })),
  };
}

export type Panoramica = Awaited<ReturnType<typeof panoramica>>;
