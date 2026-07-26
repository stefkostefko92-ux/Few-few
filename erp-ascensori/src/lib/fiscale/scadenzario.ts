// Падежите на вземанията: колко се чака, от кого и откога.
//
// ЗАЩО ОТДЕЛЕН ПОГЛЕД, А НЕ ФИЛТЪР ВЪРХУ СПИСЪКА С ФАКТУРИ. Въпросът „кои
// фактури са неплатени" и въпросът „колко пари ми дължат и от колко време" са
// различни. Вторият се решава с ВЪЗРАСТОВИ КОФИ (aging), защото просрочие от
// седмица и просрочие от година не са едно и също нещо: първото е разсеяност,
// второто е загуба, която още не е призната.
//
// КОФИТЕ СА ПО ДНИ СЛЕД ПАДЕЖА, не по дата на издаване. Фактура от януари с
// падеж декември не е просрочена.
//
// НУЛА НЕ Е СЪЩОТО КАТО ЛИПСА. Клиент без просрочени фактури изчезва от списъка;
// клиент с нула остатък по всички — също. Обратното пълни екрана с редове, които
// не искат действие, и точно затова никой не гледа екрана.

/** Границите в дни след падежа. Последната кофа е отворена нагоре. */
export const FASCE = [
  { chiave: "corrente", etichetta: "A scadere", da: -Infinity, a: -1 },
  { chiave: "g0_30", etichetta: "0–30 giorni", da: 0, a: 30 },
  { chiave: "g31_60", etichetta: "31–60 giorni", da: 31, a: 60 },
  { chiave: "g61_90", etichetta: "61–90 giorni", da: 61, a: 90 },
  { chiave: "oltre90", etichetta: "Oltre 90 giorni", da: 91, a: Infinity },
] as const;

export type ChiaveFascia = (typeof FASCE)[number]["chiave"];

export interface Credito {
  fatturaId: string;
  numero: string;
  data: Date;
  /** Падежът. Липсващ падеж се третира като датата на документа — виж по-долу. */
  dataScadenza: Date | null;
  /** Остатъкът в центесими. Само цели числа, никакъв float. */
  residuoCentesimi: number;
  /** Кой дължи — кондоминиум или администратор, вече решено от извикващия. */
  debitoreId: string;
  debitore: string;
}

export interface RigaScadenzario extends Credito {
  /** Дни СЛЕД падежа. Отрицателно = още не е дошъл. */
  giorniRitardo: number;
  fascia: ChiaveFascia;
}

const GIORNO = 86_400_000;

/**
 * Дни между два дни, без часовете.
 *
 * Часовете тук са шум и вредят: фактура с падеж днес в 23:00 не е просрочена в
 * 08:00 сутринта, а разлика в милисекунди би я направила „1 ден закъснение".
 */
export function giorniTra(da: Date, a: Date): number {
  const g = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((g(a) - g(da)) / GIORNO);
}

export function fasciaPerRitardo(giorni: number): ChiaveFascia {
  for (const f of FASCE) if (giorni >= f.da && giorni <= f.a) return f.chiave;
  return "oltre90";
}

/**
 * Подрежда вземанията.
 *
 * Липсващият падеж НЕ се пропуска: фактура без падеж е дължима при издаване
 * (чл. 4 D.Lgs. 231/2002 дава 30 дни по подразбиране в търговските сделки, но
 * това е ПРАВЕН извод, който продуктът не прави сам). Тук се взима датата на
 * документа — най-ранната защитима стойност — и това се вижда в отговора,
 * вместо редът да изчезне тихо.
 */
export function componiScadenzario(
  crediti: Credito[],
  oggi: Date,
): RigaScadenzario[] {
  return crediti
    .filter((c) => c.residuoCentesimi > 0)
    .map((c) => {
      const scadenza = c.dataScadenza ?? c.data;
      const giorniRitardo = giorniTra(scadenza, oggi);
      return { ...c, giorniRitardo, fascia: fasciaPerRitardo(giorniRitardo) };
    })
    // Най-старото просрочие най-горе: това е редът, по който се звъни.
    .sort((a, b) => b.giorniRitardo - a.giorniRitardo);
}

export interface TotaliFascia {
  chiave: ChiaveFascia;
  etichetta: string;
  centesimi: number;
  documenti: number;
}

export function totaliPerFascia(righe: RigaScadenzario[]): TotaliFascia[] {
  return FASCE.map((f) => {
    const sue = righe.filter((r) => r.fascia === f.chiave);
    return {
      chiave: f.chiave,
      etichetta: f.etichetta,
      centesimi: sue.reduce((s, r) => s + r.residuoCentesimi, 0),
      documenti: sue.length,
    };
  });
}

export interface RiepilogoDebitore {
  debitoreId: string;
  debitore: string;
  centesimi: number;
  documenti: number;
  /** Най-старото просрочие — по него се решава кой да се потърси първи. */
  ritardoMassimo: number;
}

/**
 * По длъжник, подредено по РИСК, не по сума.
 *
 * Голяма прясна фактура не е проблем; малка отпреди година е. Подредбата по
 * сума би поставила първата отгоре и би скрила втората.
 */
export function perDebitore(righe: RigaScadenzario[]): RiepilogoDebitore[] {
  const m = new Map<string, RiepilogoDebitore>();
  for (const r of righe) {
    let v = m.get(r.debitoreId);
    if (!v) {
      v = {
        debitoreId: r.debitoreId,
        debitore: r.debitore,
        centesimi: 0,
        documenti: 0,
        ritardoMassimo: -Infinity,
      };
      m.set(r.debitoreId, v);
    }
    v.centesimi += r.residuoCentesimi;
    v.documenti += 1;
    v.ritardoMassimo = Math.max(v.ritardoMassimo, r.giorniRitardo);
  }
  return [...m.values()].sort(
    (a, b) => b.ritardoMassimo - a.ritardoMassimo || b.centesimi - a.centesimi,
  );
}

/** Степените на поканата. Всяка следваща е с по-остър тон и по-къс срок. */
export const LIVELLI_SOLLECITO = [
  {
    livello: 1,
    etichetta: "Primo sollecito",
    /** След колко дни просрочие има смисъл. */
    daGiorni: 1,
    conInteressi: false,
  },
  {
    livello: 2,
    etichetta: "Secondo sollecito",
    daGiorni: 30,
    // Лихвата влиза чак тук: искане на лихва при седмица закъснение разваля
    // отношения, които струват повече от лихвата.
    conInteressi: true,
  },
  {
    livello: 3,
    etichetta: "Messa in mora",
    daGiorni: 60,
    conInteressi: true,
  },
] as const;

export type LivelloSollecito = (typeof LIVELLI_SOLLECITO)[number]["livello"];

/**
 * Коя е СЛЕДВАЩАТА покана — не коя е текущата.
 *
 * Разликата е съществена за интерфейса: „следваща" е предложение за ДЕЙСТВИЕ,
 * а `null` значи „сега не прави нищо". Система, която предлага покана за всяка
 * неплатена фактура, обучава хората да натискат „изпрати" без да гледат.
 *
 * Три правила, всяко от които сам по себе си връща `null`:
 *   • няма просрочие;
 *   • степента още не е дошла по срок (не се изпреварва: втора покана на петия
 *     ден закъснение е неоправдана);
 *   • третата е изпратена — оттам нататък въпросът е правен, не програмен, и
 *     продуктът няма какво да предложи.
 *
 * Степен не се прескача: втора покана без първа е груба и процесуално по-слаба.
 */
export function livelloSuggerito(
  giorniRitardo: number,
  giaInviati: number,
): LivelloSollecito | null {
  const prossimo = Math.max(0, Math.floor(giaInviati)) + 1;
  const def = LIVELLI_SOLLECITO.find((l) => l.livello === prossimo);
  if (!def) return null;
  if (giorniRitardo < def.daGiorni) return null;
  return def.livello;
}
