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
  /**
   * До тази дата ИЗКЛЮЧИТЕЛНО.
   *
   * Изричен край, а не „до следващия ред": така последният ред КАЗВА докъде
   * знае таблицата. Без него функцията би върнала последната известна ставка
   * за всяка бъдеща дата — а точно този механизъм вкара 2,00 % в 2026 г.,
   * когато декретът беше сложил 1,60 %. Мълчаливо продължена ставка е
   * измислено число в покана за плащане.
   */
  al: string;
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
  { dal: "2021-01-01", al: "2022-01-01", tasso: 1 }, // 0,01 %
  { dal: "2022-01-01", al: "2023-01-01", tasso: 125 }, // 1,25 %
  { dal: "2023-01-01", al: "2024-01-01", tasso: 500 }, // 5,00 %
  { dal: "2024-01-01", al: "2025-01-01", tasso: 250 }, // 2,50 %
  { dal: "2025-01-01", al: "2026-01-01", tasso: 200 }, // 2,00 %
  // D.M. MEF 10.12.2025, G.U. n. 289 del 13.12.2025.
  { dal: "2026-01-01", al: "2027-01-01", tasso: 160 }, // 1,60 %
];

/**
 * Референтният процент по D.Lgs. 231/2002 (ЕЦБ + 8 пункта), за B2B и PA.
 *
 * Стойностите са вече сборът: базата се обявява на 1 януари и 1 юли и важи за
 * цялото полугодие.
 *
 * ТАБЛИЦАТА ИМА СРОК НА ГОДНОСТ И ТОВА Е ЧАСТ ОТ ПОДДРЪЖКАТА. Съобщението на
 * МФ за всяко полугодие излиза в ГУ през януари и през юли; между края на
 * последния ред и обнародването модулът смята само покритото и го КАЗВА (виж
 * `giorniNonCoperti`). Ставка за непокрит период не се екстраполира.
 */
export const TASSI_COMMERCIALI: TassoPeriodo[] = [
  { dal: "2023-01-01", al: "2023-07-01", tasso: 1050 }, // 2,50 + 8
  { dal: "2023-07-01", al: "2024-01-01", tasso: 1200 }, // 4,00 + 8
  { dal: "2024-01-01", al: "2024-07-01", tasso: 1250 }, // 4,50 + 8
  { dal: "2024-07-01", al: "2025-01-01", tasso: 1225 }, // 4,25 + 8
  { dal: "2025-01-01", al: "2025-07-01", tasso: 1115 }, // 3,15 + 8
  // Comunicato MEF, G.U. n. 161 del 14.07.2025.
  { dal: "2025-07-01", al: "2026-01-01", tasso: 1015 }, // 2,15 + 8
  { dal: "2026-01-01", al: "2026-07-01", tasso: 1015 }, // 2,15 + 8
  // Comunicato MEF, G.U. n. 163 del 16.07.2026.
  { dal: "2026-07-01", al: "2027-01-01", tasso: 1040 }, // 2,40 + 8
];

/** Ставката, важала на дадена дата; `null`, когато таблицата не я покрива. */
export function tassoVigente(
  tabella: TassoPeriodo[],
  data: Date,
): number | null {
  const iso = data.toISOString().slice(0, 10);
  const r = tabella.find((x) => x.dal <= iso && iso < x.al);
  return r ? r.tasso : null;
}

/** Един отрязък с ЕДНА ставка — така се показва в поканата за плащане. */
export interface TrattoInteressi {
  dal: string;
  /** Включително — така го чете длъжникът, не „до, без да броим". */
  al: string;
  giorni: number;
  tasso: number;
  importo: number;
}

export interface CalcoloInteressi {
  regime: RegimeInteressi;
  giorni: number;
  /**
   * Ставката, действала в НАЧАЛОТО на забавата; `null`, когато не е известна.
   *
   * Само за заглавие. Сметката е в `tratti` — при забава през нова година
   * едно число не описва нищо.
   */
  tasso: number | null;
  /** Начислената лихва в центесими; нула, когато ставката е неизвестна. */
  importo: number;
  /** Разбивката по периоди на действие на ставката. */
  tratti: TrattoInteressi[];
  /** Дни от забавата, за които таблицата няма ставка. */
  giorniNonCoperti: number;
  /** Кратко обяснение на италиански — влиза в поканата за плащане. */
  motivazione: string;
}

const GIORNO_MS = 86_400_000;

function iso(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Лихвата за забава.
 *
 * ПО ПЕРИОДИ, НЕ ПО ЕДНА СТАВКА. Ставката се сменя всяка година (законната) и
 * всяко полугодие (търговската), а лихвата тече по онази, която е ДЕЙСТВАЛА
 * през съответните дни. Фактура с падеж 15.01.2023, олихвена цялата с 5 %,
 * иска към днешна дата около два пъти повече от дължимото — и това е точно
 * сумата, която влиза в „messa in mora" и се защитава после в съда.
 *
 * `giorni` са календарни, годината е 365 дни (обичайната търговска практика в
 * Италия). При неизвестна ставка връща нула за тези дни и го КАЗВА, вместо да
 * предполага.
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
    (opts.oggi.getTime() - opts.scadenza.getTime()) / GIORNO_MS,
  );
  if (giorni <= 0)
    return {
      regime: opts.regime,
      giorni: 0,
      tasso: null,
      importo: 0,
      tratti: [],
      giorniNonCoperti: 0,
      motivazione:
        "Nessun ritardo: il termine di pagamento non è ancora scaduto.",
    };

  const capitale = Math.round(opts.capitale);
  // НАЧАЛОТО СЕ ПОДРАВНЯВА КЪМ ПОЛУНОЩ UTC.
  //
  // Границите в таблицата са полунощ; `giorni` е ЕДНО закръгляне надолу върху
  // целия отрязък, а покритието е СБОР от закръглявания по ред. Щом падежът
  // носи час (а той го носи: `Fattura.data` е `now()`, когато формата остави
  // датата празна), всяко пресичане на граница губи по един ден — и понеже
  // непокрит ден вече блокира поканата, дефектът се превръща от грешна сума в
  // постоянен отказ на функцията.
  const inizio = Math.floor(opts.scadenza.getTime() / GIORNO_MS) * GIORNO_MS;
  const fine = inizio + giorni * GIORNO_MS;

  // Уговореният процент няма таблица: той важи за целия период по договор.
  //
  // ЧЕСТНО ЗА ОБХВАТА ДНЕС: нито един извикващ не подава `tassoContrattuale` —
  // договорът още няма поле за уговорена лихва, тоест този клон е достижим
  // само от тестовете. Стои, а не се трие, защото е ПРАВИЛНОТО поведение,
  // когато полето влезе (чл. 1284, ал. 2 c.c.: писмено уговореният процент
  // измества законния), и защото изтриването му би значело, че утре същата
  // сметка се пише набързо в маршрута. Същият подход като `CANALI_IMPLEMENTATI`
  // в `sdi/trasmissione.ts`: възможността е налице и е обявена, не е скрита.
  if (opts.regime === "CONTRATTUALE") {
    const tasso = opts.tassoContrattuale ?? null;
    const motivazione = "Interessi al tasso convenuto in contratto.";
    if (tasso === null || tasso <= 0)
      return {
        regime: opts.regime,
        giorni,
        tasso: null,
        importo: 0,
        tratti: [],
        giorniNonCoperti: giorni,
        motivazione: motivazione + " " + MANCA_TASSO,
      };
    const importo = quota(capitale, tasso, giorni);
    return {
      regime: opts.regime,
      giorni,
      tasso,
      importo,
      tratti: [{ dal: iso(inizio), al: iso(fine), giorni, tasso, importo }],
      giorniNonCoperti: 0,
      motivazione,
    };
  }

  const commerciale = opts.regime === "COMMERCIALE";
  const tabella = commerciale ? TASSI_COMMERCIALI : TASSI_LEGALI;
  let motivazione = commerciale
    ? "Interessi di mora ex D.Lgs. 231/2002 (tasso BCE maggiorato di 8 punti) — transazioni commerciali e pubblica amministrazione."
    : "Interessi legali ex art. 1284 c.c. — il condominio non è un'impresa, quindi non si applica il D.Lgs. 231/2002.";

  const tratti: TrattoInteressi[] = [];
  let coperti = 0;
  for (const r of tabella) {
    const da = Math.max(inizio, Date.parse(r.dal + "T00:00:00Z"));
    const a = Math.min(fine, Date.parse(r.al + "T00:00:00Z"));
    const g = Math.floor((a - da) / GIORNO_MS);
    if (g <= 0) continue;
    coperti += g;
    tratti.push({
      dal: iso(da),
      al: iso(a),
      giorni: g,
      tasso: r.tasso,
      importo: quota(capitale, r.tasso, g),
    });
  }

  // Сборът е от отрязъците, не отделна сметка: поканата показва разбивката и
  // тя трябва да дава точно тоталa, иначе длъжникът има основание за спор.
  const importo = tratti.reduce((s, t) => s + t.importo, 0);
  const giorniNonCoperti = giorni - coperti;
  if (giorniNonCoperti > 0) motivazione += " " + MANCA_TASSO;

  return {
    regime: opts.regime,
    giorni,
    tasso: tratti.length ? tratti[0].tasso : null,
    importo,
    tratti,
    giorniNonCoperti,
    motivazione,
  };
}

/**
 * Едно и също изречение навсякъде: операторът трябва да го разпознава.
 *
 * ДВЕ ПОПРАВКИ СПРЯМО ПЪРВИЯ ТЕКСТ. „Per l'intero periodo" беше НЕВЯРНО —
 * непокрит е ОТРЯЗЪК, останалото е сметнато; текстът плашеше, че цялата сметка
 * липсва. И терминът е ЕДИН: полето е `tasso`, значи „tasso" и в изречението —
 * „saggio" в същия екран изглежда като втора, различна величина.
 */
const MANCA_TASSO =
  "Tasso non disponibile per una parte del periodo: gli interessi sono calcolati fino all'ultima data coperta, salvo conguaglio.";

/** capitale (cent) × tasso (стотни от пункт) × giorni / (10 000 × 365). */
function quota(capitale: number, tasso: number, giorni: number): number {
  const raw = capitale * tasso * giorni;
  return Math.sign(raw) * Math.round(Math.abs(raw) / 3_650_000);
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
