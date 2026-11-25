import { isProduction } from '../config.js';
import { prisma } from '../db.js';

/**
 * Прагът за продажбите с български ДДС на клиенти от друга държава от ЕС без ДДС номер, валиден във VIES (режим
 * `iva-bg-ue`; условията 2026-11-14, чл. 12.10): чл. 59в от Директива 2006/112/ЕО и чл. 20б ЗДДС — мястото на
 * изпълнение остава в България, докато общата стойност на тези доставки, без ДДС, не надхвърля 10 000 € през
 * текущата календарна година и не го е надхвърлила през предходната. Продажбата, с която прагът би се
 * надхвърлил, вече се облага в държавата на клиента (OSS) — порталът не я прави онлайн и собственикът се
 * известява. Подготвен казус — Данъчника; не е данъчен съвет.
 */
export const SOGLIA_UE_CENT = 10_000_00;

export interface VenditeSenzaVies {
  /** Сумата без ДДС от началото на текущата календарна година. */
  corrente: number;
  /** Сумата без ДДС за предходната календарна година. */
  precedente: number;
}

/** Може ли още една такава продажба за `nuovoCent` (без ДДС) да стане онлайн. */
export function entroSoglia(v: VenditeSenzaVies, nuovoCent: number): boolean {
  return v.precedente <= SOGLIA_UE_CENT && v.corrente + nuovoCent <= SOGLIA_UE_CENT;
}

/** Колко процента от прага са стигнати тази година (надолу до цяло). */
export const quotaSoglia = (v: VenditeSenzaVies): number =>
  Math.floor((v.corrente * 100) / SOGLIA_UE_CENT);

/** От колко процента нагоре собственикът се известява (да подготви OSS навреме). */
export const AVVISO_SOGLIA_PERCENTO = 80;

/**
 * Продажбите извън портала, въведени от MASTER, спрямо годината `anno`: числото за „тази година“ важи за годината,
 * в която е въведено — на следващата то вече е „миналата“ (и текущата започва от нула), а по-старо не се брои.
 */
export function altreVendite(
  cfg: {
    altreVenditeUeCent: number;
    altreVenditeUePrecCent: number;
    altreVenditeUeAnno: number | null;
  } | null,
  anno: number,
): { altre: number; altrePrecedente: number } {
  if (!cfg) return { altre: 0, altrePrecedente: 0 };
  const di = cfg.altreVenditeUeAnno ?? anno;
  if (di === anno)
    return { altre: cfg.altreVenditeUeCent, altrePrecedente: cfg.altreVenditeUePrecCent };
  if (di === anno - 1) return { altre: 0, altrePrecedente: cfg.altreVenditeUeCent };
  return { altre: 0, altrePrecedente: 0 };
}

/**
 * Продаденото в този режим през портала (`portale`) и извън него (`altre`, въведено от MASTER): платеното (и върнатото после — доставката е станала), чакащото MASTER и още
 * отворените поръчки от последния час (могат да се платят всеки момент). На живия сървър — само Produzione.
 */
export async function venditeSenzaVies(
  now: Date = new Date(),
): Promise<VenditeSenzaVies & { portale: number; altre: number; altrePrecedente: number }> {
  const anno = now.getUTCFullYear();
  const inizio = (a: number) => new Date(Date.UTC(a, 0, 1));
  const comune = {
    regimeIva: 'iva-bg-ue',
    ...(isProduction() ? { ambiente: 'PRODUZIONE' as const } : {}),
  };
  const somma = async (da: Date, a: Date): Promise<number> =>
    (
      await prisma.pagamento.aggregate({
        where: {
          ...comune,
          OR: [
            {
              stato: { in: ['COMPLETATO', 'RIMBORSATO', 'DA_VERIFICARE'] },
              completatoAt: { gte: da, lt: a },
            },
            {
              stato: 'IN_ATTESA',
              createdAt: {
                gte: new Date(Math.max(da.getTime(), now.getTime() - 60 * 60_000)),
                lt: a,
              },
            },
          ],
        },
        _sum: { imponibileCent: true },
      })
    )._sum.imponibileCent ?? 0;
  const [portale, precedente, cfg] = await Promise.all([
    somma(inizio(anno), inizio(anno + 1)),
    somma(inizio(anno - 1), inizio(anno)),
    prisma.configPagamenti.findUnique({
      where: { id: 'revolut' },
      select: {
        altreVenditeUeCent: true,
        altreVenditeUePrecCent: true,
        altreVenditeUeAnno: true,
      },
    }),
  ]);
  // Прагът е на цялата фирма: продаденото другаде го въвежда MASTER от счетоводството.
  const { altre, altrePrecedente } = altreVendite(cfg, anno);
  return {
    corrente: portale + altre,
    precedente: precedente + altrePrecedente,
    portale,
    altre,
    altrePrecedente,
  };
}
