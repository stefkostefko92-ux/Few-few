// Рентабилност — чистата сметка, без база.
//
// Въпросът, който собственикът на асансьорна фирма задава и на който досега
// продуктът не отговаряше: „този договор изкарва ли пари?". Приходът се вижда
// (фактурите са там), разходът — не: часовете на техника, вложените материали и
// платеното на котимиста живеят в три различни модула.
//
// Всичко е в ЦЕЛИ ЦЕНТЕСИМИ, както навсякъде другаде: марж, смятан с плаваща
// запетая, се разминава с фактурите точно там, където някой го гледа.
//
// ЧЕСТНО ЗА ТОЧНОСТТА. Това е управленска сметка, не счетоводство. Не влизат
// косвените разходи (наем, застраховки, автопарк, администрация) — тоест
// положителният марж тук НЕ значи печалба на фирмата. Числото служи за
// СРАВНЕНИЕ между договори и импианти, не за данъчна декларация. Този абзац е
// и в интерфейса, не само тук.

import { toCents, fromCents } from "@/lib/totals";

export interface RigaOre {
  /** Отработени часове (с четвъртинки). */
  ore: string | number;
  /** Цена на час за конкретния техник; липсва ⇒ разходът е НЕИЗВЕСТЕН, не нула. */
  costoOrario?: string | number | null;
}

export interface RigaMateriale {
  quantita: number;
  /** Доставна цена; липсва ⇒ неизвестен разход. */
  prezzoAcquisto?: string | number | null;
}

export interface IngressiRedditivita {
  /** Фактурирано БЕЗ ДДС — ДДС-то не е приход. */
  ricaviNetti: (string | number)[];
  ore: RigaOre[];
  materiali: RigaMateriale[];
  /** Платено на котимисти и външни изпълнители. */
  costiEsterni: (string | number)[];
}

export interface Redditivita {
  ricavi: string;
  costoManodopera: string;
  costoMateriali: string;
  costiEsterni: string;
  costoTotale: string;
  margine: string;
  /** Марж в проценти спрямо прихода; `null`, когато приходът е нула. */
  marginePerc: string | null;
  /** Часове без зададена цена — разход, който НЕ е в сметката. */
  oreSenzaCosto: string;
  /** Позиции без доставна цена — същото. */
  materialiSenzaCosto: number;
  /** Може ли числото да се приеме за пълно. */
  completo: boolean;
}

/** Часове × цена на час, в центесими. Часовете също са с две десетични. */
function costoOre(r: RigaOre): number | null {
  if (r.costoOrario === null || r.costoOrario === undefined || r.costoOrario === "") return null;
  // (часове×100) × (цена×100) / 100 = центесими, със закръгляне half-up НАКРАЯ.
  const prodotto = (toCents(r.ore) * toCents(r.costoOrario)) / 100;
  return Math.round(prodotto);
}

function costoMateriale(r: RigaMateriale): number | null {
  if (r.prezzoAcquisto === null || r.prezzoAcquisto === undefined || r.prezzoAcquisto === "")
    return null;
  return Math.round(r.quantita * toCents(r.prezzoAcquisto));
}

/**
 * Сметката.
 *
 * Липсващата цена НЕ се брои за нула — брои се за НЕИЗВЕСТНА и се отчита
 * отделно. Разликата е съществена: нула прави договора да изглежда печеливш
 * точно когато данните липсват, а това е най-честият случай в началото.
 */
export function calcolaRedditivita(i: IngressiRedditivita): Redditivita {
  const ricavi = i.ricaviNetti.reduce<number>((s, v) => s + toCents(v), 0);

  let manodopera = 0;
  let oreSenzaCosto = 0;
  for (const r of i.ore) {
    const c = costoOre(r);
    if (c === null) oreSenzaCosto += toCents(r.ore);
    else manodopera += c;
  }

  let materiali = 0;
  let materialiSenzaCosto = 0;
  for (const r of i.materiali) {
    const c = costoMateriale(r);
    if (c === null) materialiSenzaCosto += 1;
    else materiali += c;
  }

  const esterni = i.costiEsterni.reduce<number>((s, v) => s + toCents(v), 0);
  const costoTotale = manodopera + materiali + esterni;
  const margine = ricavi - costoTotale;

  return {
    ricavi: fromCents(ricavi),
    costoManodopera: fromCents(manodopera),
    costoMateriali: fromCents(materiali),
    costiEsterni: fromCents(esterni),
    costoTotale: fromCents(costoTotale),
    margine: fromCents(margine),
    // Процент спрямо ПРИХОДА (марж), не спрямо разхода (надценка) — двете се
    // бъркат постоянно и дават различни числа за една и съща сделка.
    marginePerc: ricavi === 0 ? null : (Math.round((margine / ricavi) * 10000) / 100).toFixed(2),
    oreSenzaCosto: fromCents(oreSenzaCosto),
    materialiSenzaCosto,
    completo: oreSenzaCosto === 0 && materialiSenzaCosto === 0,
  };
}

/** Подредба: първо най-губещото — то е причината да се гледа този отчет. */
export function ordinaPerMargine<T extends { redditivita: Redditivita }>(righe: T[]): T[] {
  return [...righe].sort((a, b) => toCents(a.redditivita.margine) - toCents(b.redditivita.margine));
}
