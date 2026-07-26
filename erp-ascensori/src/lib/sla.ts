// Времената за отзив при авария и при блокиран човек.
//
// ЗАЩО ИЗОБЩО. Асансьорна фирма се продава по две неща: цената на canone-то и
// колко бързо идва при повикване. Второто днес не се мери никъде — казва се на
// думи в офертата и никой не може да го докаже нито пред клиента, нито пред
// себе си. Договор без измерено време за отзив е обещание без стойност.
//
// ЧЕСТНО ЗА НОРМАТИВАТА. UNI EN 81-28 („Allarmi remoti su ascensori") урежда
// системата за алармиране от кабината. Стандартът е ПЛАТЕН и точните му числа
// НЕ са възпроизведени тук — нито ще бъдат отгатнати. Затова праговете в този
// модул са ДОГОВОРНИ: идват от `Contratto`, договарят се с клиента и се
// доказват с този часовник. Подразбирането по-долу е търговско обичайно за
// италианския пазар, НЕ е цитат от норма и е обозначено така навсякъде.
//
// РАЗЛИКАТА МЕЖДУ ДВАТА ЧАСОВНИКА. „Пристигнах" и „уредбата работи" са различни
// обещания и се нарушават поотделно: техникът може да е на място за 30 минути и
// да чака резервна част три дни. Един-единствен показател би скрил точно това.

/** Кога е ЗАПОЧНАЛ часовникът — сигналът, не създаването на записа в системата. */
export interface Tempi {
  /** Обаждането/алармата. Без него часовник няма — и това не е грешка, а факт. */
  segnalatoAt?: Date | string | null;
  /** Техникът е на място. */
  arrivoAt?: Date | string | null;
  /** Уредбата е върната в служба (или блокираният е освободен). */
  ripristinoAt?: Date | string | null;
}

export interface Soglie {
  /** Минути до пристигане. `null` = не е договорено, тоест не се мери. */
  interventoMin?: number | null;
  /** Часове до възстановяване. `null` = не е договорено. */
  ripristinoOre?: number | null;
}

/**
 * Търговски обичайни прагове — предложение при нов договор, НЕ норма.
 *
 * Стоят тук, за да не се измислят наново във всяка форма, и се презаписват от
 * договора. Интерфейсът ги показва като предложение, не като задължение.
 */
export const SOGLIE_PREDEFINITE: Required<Soglie> = {
  interventoMin: 60,
  ripristinoOre: 24,
};

export type StatoSla =
  /** Няма договорен праг, или няма сигнал: часовник не тече. */
  | "non_applicabile"
  /** Тече и е в срок. */
  | "in_corso"
  /** Тече и е минал 80 % от срока — още може да се спаси. */
  | "a_rischio"
  /** Приключено в срок. */
  | "rispettato"
  /** Просрочено (тече или приключено късно) — двете НЕ се сливат. */
  | "violato";

/** Етикетите на италиански — един източник за интерфейса и за PDF-а. */
export const ETICHETTA_SLA: Record<StatoSla, string> = {
  non_applicabile: "Non applicabile",
  in_corso: "In corso",
  a_rischio: "A rischio",
  rispettato: "Rispettato",
  violato: "Fuori termine",
};

export interface MisuraSla {
  stato: StatoSla;
  /** Изтеклите минути; `null`, когато часовник не тече. */
  trascorsiMin: number | null;
  /** Договореният праг в минути. */
  sogliaMin: number | null;
  /** Оставащите минути; отрицателно значи просрочие. `null` без праг. */
  rimanentiMin: number | null;
  /** Приключил ли е часовникът (има отметка за край). */
  concluso: boolean;
}

function aData(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const MINUTO = 60_000;

/**
 * Един часовник: от начало до край (или до „сега", ако още тече).
 *
 * `adesso` се подава ОТВЪН. Функция, която сама си чете часа, не може да бъде
 * тествана за граничния случай „точно на прага" — а точно той решава дали
 * клиентът получава неустойка.
 */
function misura(
  inizio: Date | null,
  fine: Date | null,
  sogliaMin: number | null | undefined,
  adesso: Date,
): MisuraSla {
  const soglia = sogliaMin ?? null;
  if (!inizio || soglia === null || soglia <= 0)
    return {
      stato: "non_applicabile",
      trascorsiMin: null,
      sogliaMin: soglia,
      rimanentiMin: null,
      concluso: !!fine,
    };

  const riferimento = fine ?? adesso;
  // Закръгляне НАДОЛУ: 59,9 минути не са изтекъл час. Обратното би обявявало
  // нарушение секунда по-рано от истината.
  const trascorsi = Math.floor(
    (riferimento.getTime() - inizio.getTime()) / MINUTO,
  );
  const rimanenti = soglia - trascorsi;
  const oltre = trascorsi > soglia;

  return {
    stato: oltre
      ? "violato"
      : fine
        ? "rispettato"
        : trascorsi >= soglia * 0.8
          ? "a_rischio"
          : "in_corso",
    trascorsiMin: trascorsi,
    sogliaMin: soglia,
    rimanentiMin: rimanenti,
    concluso: !!fine,
  };
}

export interface EsitoSla {
  /** От сигнала до пристигането на техника. */
  intervento: MisuraSla;
  /** От сигнала до връщането в служба. */
  ripristino: MisuraSla;
  /** Нарушено ли е ПОНЕ едно от двете обещания. */
  violato: boolean;
}

/**
 * Двата часовника наведнъж.
 *
 * И двата тръгват от СИГНАЛА, не един от друг: клиентът е чакал от момента, в
 * който се е обадил. Мерене на възстановяването от пристигането би скрило
 * закъснението на самото пристигане.
 */
export function calcolaSla(
  tempi: Tempi,
  soglie: Soglie,
  adesso: Date,
): EsitoSla {
  const inizio = aData(tempi.segnalatoAt);
  const intervento = misura(
    inizio,
    aData(tempi.arrivoAt),
    soglie.interventoMin,
    adesso,
  );
  const ripristino = misura(
    inizio,
    aData(tempi.ripristinoAt),
    soglie.ripristinoOre === null || soglie.ripristinoOre === undefined
      ? null
      : soglie.ripristinoOre * 60,
    adesso,
  );
  return {
    intervento,
    ripristino,
    violato: intervento.stato === "violato" || ripristino.stato === "violato",
  };
}

/** Приоритетите, за които часовникът изобщо има смисъл. */
export const PRIORITA_CON_SLA = ["EMERGENZA", "URGENTE"] as const;

export function sogliaSiApplica(priorita: string): boolean {
  return (PRIORITA_CON_SLA as readonly string[]).includes(priorita);
}

/**
 * Човешки текст за изтекло/оставащо време.
 *
 * „93 минути" се чете по-бавно от „1h 33m", а това число се гледа под напрежение
 * — при отворена шахта и звънящ телефон.
 */
export function durataIt(minuti: number | null): string {
  if (minuti === null) return "—";
  const segno = minuti < 0 ? "-" : "";
  const m = Math.abs(minuti);
  if (m < 60) return `${segno}${m}m`;
  const ore = Math.floor(m / 60);
  const resto = m % 60;
  if (ore < 24) return resto ? `${segno}${ore}h ${resto}m` : `${segno}${ore}h`;
  const giorni = Math.floor(ore / 24);
  const oreResto = ore % 24;
  return oreResto ? `${segno}${giorni}g ${oreResto}h` : `${segno}${giorni}g`;
}
