// Плащането е ОТДЕЛНО измерение от жизнения цикъл на документа.
//
// Досега `stato = PAGATA` беше и статус на документа, и статус на плащането, и
// косвено твърдение за SDI. Три различни неща в едно поле значат, че никое от
// тях не се знае точно: частично платена фактура нямаше как да се опише, а
// „изпратена" не казваше изпратена КЪДЕ.
//
// Тук живее само аритметиката на плащането. Кодировките са тези на SDI, защото
// същите стойности влизат в XML-а — да ги превеждаме между два речника би било
// още едно място за разминаване.

/** Начини на плащане по кодировката на FatturaPA. */
export const MODALITA_PAGAMENTO: Record<string, string> = {
  MP01: "Contanti",
  MP02: "Assegno",
  MP03: "Assegno circolare",
  MP05: "Bonifico",
  MP08: "Carta di pagamento",
  MP09: "RID",
  MP12: "RIBA",
  MP17: "Bollettino postale",
  MP19: "SEPA Direct Debit",
  MP21: "SEPA Direct Debit B2B",
  MP23: "PagoPA",
};

/** Условия на плащане по кодировката на FatturaPA. */
export const CONDIZIONI_PAGAMENTO: Record<string, string> = {
  TP01: "Pagamento a rate",
  TP02: "Pagamento completo",
  TP03: "Anticipo",
};

export const STATI_PAGAMENTO = ["NON_PAGATA", "PARZIALE", "PAGATA"] as const;
export type StatoPagamento = (typeof STATI_PAGAMENTO)[number];

export function modalitaValida(c: string): boolean {
  return Object.hasOwn(MODALITA_PAGAMENTO, c);
}

export function condizioneValida(c: string): boolean {
  return Object.hasOwn(CONDIZIONI_PAGAMENTO, c);
}

export interface BaseIncasso {
  imponibile: number;
  imposta: number;
  /** Удържаното по чл. 25-ter — фирмата НЕ го получава. */
  ritenuta: number;
  /** Чл. 17-ter: ДДС-то се внася от публичния получател, не от нас. */
  splitPayment: boolean;
}

/**
 * Сумата, която фирмата реално очаква да получи.
 *
 * Не е сборът на фактурата. Удържаното отива в държавата през кондоминиума, а
 * при split payment и ДДС-то не минава през нас. Ако сравняваме постъпленията
 * с брутото, всяка коректно платена фактура изглежда недоплатена — и някой
 * праща покана за плащане на клиент, който не дължи нищо.
 */
export function importoDaIncassare(b: BaseIncasso): number {
  const iva = b.splitPayment ? 0 : Math.round(b.imposta);
  return Math.round(b.imponibile) + iva - Math.round(b.ritenuta);
}

/** Статусът на плащането от очакваното и полученото. */
export function statoDaIncassi(
  daIncassare: number,
  incassato: number,
): StatoPagamento {
  const atteso = Math.round(daIncassare);
  const avuto = Math.round(incassato);
  if (avuto <= 0) return "NON_PAGATA";
  // Надплащане също е „платена": остатъкът е въпрос на кредитно известие, не
  // повод фактурата да стои отворена.
  if (avuto >= atteso) return "PAGATA";
  return "PARZIALE";
}

/** Остатъкът за събиране; нула, когато е платена или надплатена. */
export function residuo(daIncassare: number, incassato: number): number {
  return Math.max(0, Math.round(daIncassare) - Math.round(incassato));
}

/**
 * Дните забава спрямо падежа.
 *
 * Отрицателна стойност значи, че падежът още не е дошъл — извикващият решава
 * дали да я показва. Нарочно НЕ смята лихва: режимът зависи от това кой е
 * длъжникът (D.Lgs. 231/2002 важи между предприятия и към публичната
 * администрация, но НЕ и към кондоминиум като краен потребител — там е чл.
 * 1284 от Гражданския кодекс). Тази разлика е в `interessi.ts`.
 */
export function giorniRitardo(scadenza: Date, oggi: Date): number {
  const ms = oggi.getTime() - scadenza.getTime();
  return Math.floor(ms / 86_400_000);
}
