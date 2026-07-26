// Лихва при забавено плащане — и защо режимът НЕ е един.
//
// Изкушението е да се сложи един процент за всички. То е грешка, която струва
// дело: D.Lgs. 231/2002 (европейската директива срещу забавата) важи САМО в
// сделки между предприятия и към публичната администрация. Кондоминиумът НЕ е
// предприятие — той е краен потребител — и към него важи чл. 1284 от
// Гражданския кодекс, тоест законната лихва, освен ако в договора не е уговорен
// друг процент.
//
// Разликата е около десет пъти. Начислена по 231/2002 лихва към кондоминиум е
// неоснователно вземане: при спор съдът я маха, а вземането изглежда като опит
// за натиск.
//
// Модулът е чист. Ставките са ДАННИ, не литерали в кода: законната лихва се
// сменя с министерски декрет всяка година, а референтният лихвен процент на
// ЕЦБ — на всеки шест месеца. Затова тук стои таблица с дати, а не число.

export type RegimeInteressi = "COMMERCIALE" | "LEGALE" | "CONTRATTUALE";

export interface TassoPeriodo {
  /** От тази дата включително (полунощ UTC). */
  dal: string;
  /** Годишният процент в стотни (5,00 % → 500). */
  tasso: number;
}

/**
 * Законната лихва по чл. 1284 c.c. — определя се с декрет на МФ всяка година.
 *
 * Таблицата се допълва при нов декрет; НЕ се екстраполира. Ако плащането е
 * извън обхвата, функцията казва, че не знае — по-добре от измислено число в
 * покана за плащане.
 */
export const TASSI_LEGALI: TassoPeriodo[] = [
  { dal: "2021-01-01", tasso: 1 }, // 0,01 %
  { dal: "2022-01-01", tasso: 125 }, // 1,25 %
  { dal: "2023-01-01", tasso: 500 }, // 5,00 %
  { dal: "2024-01-01", tasso: 250 }, // 2,50 %
  { dal: "2025-01-01", tasso: 200 }, // 2,00 %
  { dal: "2026-01-01", tasso: 200 }, // 2,00 %
];

/**
 * Референтният процент по D.Lgs. 231/2002 (ЕЦБ + 8 пункта), за B2B и PA.
 *
 * Стойностите са вече сборът: базата се обявява на 1 януари и 1 юли и важи за
 * цялото полугодие.
 */
export const TASSI_COMMERCIALI: TassoPeriodo[] = [
  { dal: "2023-01-01", tasso: 1050 }, // 2,50 + 8
  { dal: "2023-07-01", tasso: 1200 }, // 4,00 + 8
  { dal: "2024-01-01", tasso: 1250 }, // 4,50 + 8
  { dal: "2024-07-01", tasso: 1225 }, // 4,25 + 8
  { dal: "2025-01-01", tasso: 1115 }, // 3,15 + 8
  { dal: "2025-07-01", tasso: 1035 }, // 2,35 + 8
  { dal: "2026-01-01", tasso: 1015 }, // 2,15 + 8
];

/** Ставката, важала на дадена дата; `null`, когато таблицата не я покрива. */
export function tassoVigente(
  tabella: TassoPeriodo[],
  data: Date,
): number | null {
  const iso = data.toISOString().slice(0, 10);
  let trovato: number | null = null;
  for (const r of tabella) {
    if (r.dal <= iso) trovato = r.tasso;
    else break;
  }
  return trovato;
}

export interface CalcoloInteressi {
  regime: RegimeInteressi;
  giorni: number;
  /** Годишният процент в стотни; `null` значи, че не е известен за периода. */
  tasso: number | null;
  /** Начислената лихва в центесими; нула, когато ставката е неизвестна. */
  importo: number;
  /** Кратко обяснение на италиански — влиза в поканата за плащане. */
  motivazione: string;
}

/**
 * Лихвата за забава.
 *
 * `giorni` са календарни, годината е 365 дни (обичайната търговска практика в
 * Италия). При неизвестна ставка връща нула и го КАЗВА, вместо да предполага.
 */
export function calcolaInteressi(opts: {
  capitale: number;
  scadenza: Date;
  oggi: Date;
  regime: RegimeInteressi;
  /** Само при `CONTRATTUALE`: уговореният процент в стотни. */
  tassoContrattuale?: number | null;
}): CalcoloInteressi {
  const giorni = Math.floor(
    (opts.oggi.getTime() - opts.scadenza.getTime()) / 86_400_000,
  );
  if (giorni <= 0)
    return {
      regime: opts.regime,
      giorni: 0,
      tasso: null,
      importo: 0,
      motivazione:
        "Nessun ritardo: il termine di pagamento non è ancora scaduto.",
    };

  let tasso: number | null;
  let motivazione: string;
  if (opts.regime === "CONTRATTUALE") {
    tasso = opts.tassoContrattuale ?? null;
    motivazione = "Interessi al tasso convenuto in contratto.";
  } else if (opts.regime === "COMMERCIALE") {
    tasso = tassoVigente(TASSI_COMMERCIALI, opts.scadenza);
    motivazione =
      "Interessi di mora ex D.Lgs. 231/2002 (tasso BCE maggiorato di 8 punti) — transazioni commerciali e pubblica amministrazione.";
  } else {
    tasso = tassoVigente(TASSI_LEGALI, opts.scadenza);
    motivazione =
      "Interessi legali ex art. 1284 c.c. — il condominio non è un'impresa, quindi non si applica il D.Lgs. 231/2002.";
  }

  if (tasso === null)
    return {
      regime: opts.regime,
      giorni,
      tasso: null,
      importo: 0,
      motivazione:
        motivazione +
        " Tasso non disponibile per il periodo: aggiornare la tabella prima di emettere il sollecito.",
    };

  // capitale (cent) × tasso (centesimi di punto) × giorni / (10 000 × 365)
  const raw = Math.round(opts.capitale) * tasso * giorni;
  const importo = Math.sign(raw) * Math.round(Math.abs(raw) / 3_650_000);
  return { regime: opts.regime, giorni, tasso, importo, motivazione };
}

/**
 * Режимът, който важи за даден длъжник.
 *
 * Това е правно решение, взето от ЕДНО място: разпръснато из маршрутите то
 * неизбежно се разминава.
 */
export function regimePerDebitore(d: {
  condominio: boolean;
  pubblicaAmministrazione?: boolean | null;
  partitaIva?: string | null;
  tassoContrattuale?: number | null;
}): RegimeInteressi {
  if (d.tassoContrattuale != null && d.tassoContrattuale > 0)
    return "CONTRATTUALE";
  if (d.pubblicaAmministrazione) return "COMMERCIALE";
  // Кондоминиумът е краен потребител дори когато има данъчен номер за
  // заместничеството по данъка — той не упражнява стопанска дейност.
  if (d.condominio) return "LEGALE";
  return d.partitaIva ? "COMMERCIALE" : "LEGALE";
}
