// Проверка за пълнота на товарителницата (documento di trasporto).
//
// Основанието е чл. 1, ал. 3 D.P.R. 472/1996: документът трябва да носи датата,
// данните на прехвърлителя, на приобретателя и на евентуалния превозвач,
// естеството/качеството/количеството на стоките и основанието за превоза.
//
// ЧИСТА ФУНКЦИЯ, БЕЗ БАЗА. Оттам и тестовете: правилото се проверява без сървър,
// а маршрутът, интерфейсът и PDF-ът ползват ЕДНА истина. Две проверки за едни и
// същи реквизити се разминават — точно това стана веднъж с фактурата и затова
// валидаторът за SDI също е един (`validaPerSdi`).

export interface DdtDaControllare {
  numero: string | null;
  data: Date | string | null;
  causale: string | null;
  destinatario: string | null;
  indirizzoConsegna: string | null;
  vettore: string | null;
  inizioTrasporto: Date | string | null;
  righe: { descrizione: string | null; quantita: unknown; um: string | null }[];
}

export interface EsitoDdt {
  /** Липсва реквизит, който нормата изброява поименно. */
  problemi: string[];
  /** Формално минава, но документът е слаб на проверка. */
  avvisi: string[];
}

function vuoto(v: string | null | undefined): boolean {
  return !String(v ?? "").trim();
}

function dataValida(v: Date | string | null): boolean {
  if (!v) return false;
  const d = typeof v === "string" ? new Date(v) : v;
  return !Number.isNaN(d.getTime());
}

/**
 * Кои реквизити липсват.
 *
 * ЗАЩО ЧАСЪТ Е ПРЕДУПРЕЖДЕНИЕ, А НЕ ПРОБЛЕМ. Ал. 3 изброява „датата", не часа;
 * часът идва от практиката около отменената bolla di accompagnamento и е това,
 * което свързва документа с конкретния курс при пътна проверка. Да го обявим за
 * блокиращ значи да наложим на клиента тълкуване, което нормата не изписва — и
 * да спрем издаването на документ, който данъчният приема. Обратното — да го
 * премълчим — оставя оператора да разбере на пътя. Затова: полето съществува,
 * проверката го иска на глас, решението е на клиента и на неговия счетоводител.
 */
export function controllaDdt(d: DdtDaControllare): EsitoDdt {
  const problemi: string[] = [];
  const avvisi: string[] = [];

  if (vuoto(d.numero))
    problemi.push("Manca il numero progressivo del documento.");
  if (!dataValida(d.data)) problemi.push("Manca la data del documento.");
  if (vuoto(d.destinatario))
    problemi.push(
      "Mancano i dati del destinatario (art. 1, comma 3, D.P.R. 472/1996).",
    );
  if (vuoto(d.causale))
    problemi.push(
      "Manca la causale del trasporto (art. 1, comma 3, D.P.R. 472/1996).",
    );

  if (!d.righe.length)
    problemi.push("Il documento non ha righe: manca la descrizione dei beni.");
  const senzaDescrizione = d.righe.filter((r) => vuoto(r.descrizione)).length;
  if (senzaDescrizione)
    problemi.push(
      `${senzaDescrizione} riga/e senza descrizione: natura, qualità e quantità dei beni sono obbligatorie.`,
    );
  const senzaUm = d.righe.filter((r) => vuoto(r.um)).length;
  if (senzaUm)
    avvisi.push(
      `${senzaUm} riga/e senza unità di misura: la quantità resta ambigua.`,
    );

  if (!dataValida(d.inizioTrasporto))
    avvisi.push(
      "Manca la data e ora di inizio del trasporto: senza di essa il documento non si lega al singolo viaggio in caso di controllo su strada.",
    );

  // Превоз от трето лице: адресът на доставка е това, което превозвачът
  // изпълнява. Без него на товарителницата пише „занеси го някъде".
  if (!vuoto(d.vettore) && vuoto(d.indirizzoConsegna))
    avvisi.push(
      "Trasporto affidato a un vettore senza indirizzo di consegna indicato.",
    );

  return { problemi, avvisi };
}

/** Само блокиращите — за извикващите, които питат „готов ли е документът". */
export function validaDdt(d: DdtDaControllare): string[] {
  return controllaDdt(d).problemi;
}
