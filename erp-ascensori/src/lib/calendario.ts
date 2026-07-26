// Календарният изглед на работата: кой ден, кой техник, къде.
//
// ЗАЩО НЕ СТИГА СПИСЪКЪТ С ОРДИНИ. Диспечерът не пита „кои ордини са отворени",
// а „свободен ли е Марко в четвъртък и стигат ли му часовете". Това е въпрос за
// СЕДМИЦА и за ЧОВЕК, не за документ — и списък, подреден по дата, не му
// отговаря.
//
// ЧИСТА ЛОГИКА, БЕЗ БАЗА. Тук се смятат само мрежата от дни и разпределението;
// заявките остават в маршрута. Така подредбата на седмицата, границите на
// месеца и претоварването носят тестове, а не коментари.
//
// СЕДМИЦАТА ЗАПОЧВА В ПОНЕДЕЛНИК. В Италия (и в ISO 8601) е така; неделя-първа
// е северноамериканска подредба и би разцепила работната седмица на две.

export interface Impegno {
  id: string;
  /** Кога е насрочено. */
  data: Date;
  titolo: string;
  /** Кой го изпълнява; `null` = още неразпределено, и това се вижда. */
  tecnicoId: string | null;
  tecnico: string | null;
  tipo: "ordine" | "visita" | "verifica";
  priorita?: string | null;
  impianto?: string | null;
}

export interface Giorno {
  /** `AAAA-MM-GG` — ключ, стабилен през часови зони. */
  chiave: string;
  data: Date;
  /** Извън търсения месец: показва се сиво, за да не се къса мрежата. */
  fuoriPeriodo: boolean;
  impegni: Impegno[];
}

/** Италиански кратки имена на дните, от понеделник. */
export const GIORNI_IT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export const MESI_IT = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

const GIORNO = 86_400_000;

/** Ключ на деня по КАЛЕНДАР, не по UTC отместване. */
export function chiaveGiorno(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Понеделникът на седмицата, в която пада датата. */
export function lunediDi(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // `getDay()` дава 0 за неделя — тя принадлежи на ПРЕДХОДНАТА седмица.
  const scarto = (x.getDay() + 6) % 7;
  return new Date(x.getTime() - scarto * GIORNO);
}

/**
 * Мрежата на месеца: цели седмици, от понеделник до неделя.
 *
 * Винаги пълни седмици — иначе първият ред на месеца е с дупка, а окото чете
 * дупката като „свободен ден". Дните извън месеца се маркират, не се махат.
 */
export function grigliaMese(anno: number, mese: number): Date[] {
  const primo = new Date(anno, mese - 1, 1);
  const ultimo = new Date(anno, mese, 0);
  const inizio = lunediDi(primo);
  const fine = lunediDi(ultimo);
  const giorni: Date[] = [];
  // СТЪПКАТА Е ПО КАЛЕНДАР, НЕ ПО МИЛИСЕКУНДИ. Денят на връщането на часа
  // (последната неделя на октомври в Италия) е 25 ЧАСА: `+86 400 000` спира
  // на 23:00 от СЪЩИЯ ден и мрежата получава 25 октомври два пъти, а всичко
  // след него се измества с една колона — понеделник застава под „Domenica".
  // `setDate(+1)` пита календара, не аритметиката.
  const fineT = fine.getTime() + 6 * GIORNO;
  // Шест седмици покриват всеки възможен месец; спираме на последната нужна.
  for (
    const d = new Date(inizio);
    d.getTime() <= fineT;
    d.setDate(d.getDate() + 1)
  )
    giorni.push(new Date(d));
  return giorni;
}

/**
 * Разпределя ангажиментите по дни.
 *
 * Ден без ангажименти НЕ изчезва: празната клетка е информацията, която
 * диспечерът търси („в четвъртък няма нищо").
 */
export function distribuisci(
  giorni: Date[],
  impegni: Impegno[],
  mese: number,
): Giorno[] {
  const per = new Map<string, Impegno[]>();
  for (const i of impegni) {
    const k = chiaveGiorno(i.data);
    const lista = per.get(k);
    if (lista) lista.push(i);
    else per.set(k, [i]);
  }

  return giorni.map((d) => {
    const chiave = chiaveGiorno(d);
    const lista = (per.get(chiave) ?? []).slice().sort(ordinaImpegni);
    return {
      chiave,
      data: d,
      fuoriPeriodo: d.getMonth() + 1 !== mese,
      impegni: lista,
    };
  });
}

/** Спешното е първо: в календара се гледа какво гори, не какво е азбучно. */
const PESO_PRIORITA: Record<string, number> = {
  EMERGENZA: 0,
  URGENTE: 1,
  ORDINARIA: 2,
};

export function ordinaImpegni(a: Impegno, b: Impegno): number {
  const pa = PESO_PRIORITA[a.priorita ?? "ORDINARIA"] ?? 2;
  const pb = PESO_PRIORITA[b.priorita ?? "ORDINARIA"] ?? 2;
  if (pa !== pb) return pa - pb;
  // Неразпределеното е второто по важност: то иска решение ДНЕС.
  if (!a.tecnicoId !== !b.tecnicoId) return a.tecnicoId ? 1 : -1;
  return a.titolo.localeCompare(b.titolo, "it");
}

export interface CaricoTecnico {
  tecnicoId: string;
  tecnico: string;
  interventi: number;
  /** Над договорения дневен капацитет. */
  sovraccarico: boolean;
}

/**
 * Натоварването по техник за даден ден — в БРОЙ ангажименти, не в часове.
 *
 * ЗАЩО НЕ ЧАСОВЕ. Часовете на един ордин не се знаят предварително: те се
 * научават от рапортино-то СЛЕД намесата. Мярка, която стои на неизвестно
 * число, е или измислена, или винаги нула — и в двата случая ръчката
 * „капацитет" не прави нищо, а инсталаторът я открива при клиента. Броят
 * посещения е това, което диспечерът наистина знае сутринта.
 *
 * `capacita` идва отвън: шест посещения са предположение, а не закон. Стойност
 * `0` или по-малка изключва проверката, вместо да обяви всичко за претоварено.
 */
export function caricoDelGiorno(
  giorno: Giorno,
  capacita: number,
): CaricoTecnico[] {
  const m = new Map<string, CaricoTecnico>();
  for (const i of giorno.impegni) {
    const id = i.tecnicoId ?? "";
    let v = m.get(id);
    if (!v) {
      v = {
        tecnicoId: id,
        tecnico: i.tecnico ?? "Non assegnato",
        interventi: 0,
        sovraccarico: false,
      };
      m.set(id, v);
    }
    v.interventi += 1;
  }
  for (const v of m.values())
    // Неразпределеното (`tecnicoId` празен) не е ничие натоварване: то е
    // купчина за разпределяне, а не претоварен човек.
    v.sovraccarico = !!v.tecnicoId && capacita > 0 && v.interventi > capacita;
  return [...m.values()].sort((a, b) => b.interventi - a.interventi);
}
