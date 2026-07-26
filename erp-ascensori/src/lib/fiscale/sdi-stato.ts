// Пътят на фактурата през Sistema di Interscambio.
//
// Досега в продукта имаше един статус „INVIATA" и нищо повече. Това е
// подвеждащо: подаването е само началото. SDI отговаря с известие, а от вида
// на известието зависи дали документът изобщо СЪЩЕСТВУВА:
//
//   RC — доставена на получателя. Издадена.
//   MC — SDI не намери канала. ИЗДАДЕНА Е: стои в кутията на получателя в
//        Agenzia delle Entrate, а подателят е длъжен да го уведоми по друг
//        път, че документът е там.
//   NS — отхвърлена. НЕ Е издадена. Номерът и датата остават свободни и
//        същите се преиздават в 5 дни от известието (циркуляр 13/E от 2018 г.
//        на Agenzia delle Entrate). Изгарянето на номера при отказ прави
//        дупка в регистъра, която после трябва да се обяснява.
//   NE — само публична администрация: приемане (EC01) или отказ (EC02).
//   DT — PA не се произнесе за 15 дни; равносилно на приемане.
//   AT — удостоверение за подаване, когато доставката е невъзможна.
//
// Модулът е чист: без база, без HTTP. Затова правилата тук носят тестове.

export const STATI_SDI = [
  "NON_INVIATA",
  "GENERATA",
  "INVIATA",
  "CONSEGNATA",
  "MANCATA_CONSEGNA",
  "SCARTATA",
  "ACCETTATA",
  "RIFIUTATA",
  "DECORSI_TERMINI",
] as const;
export type StatoSdi = (typeof STATI_SDI)[number];

export const TIPI_NOTIFICA = ["RC", "NS", "MC", "NE", "DT", "AT"] as const;
export type TipoNotifica = (typeof TIPI_NOTIFICA)[number];

/**
 * Позволените преходи.
 *
 * SCARTATA НЕ е финална: точно от нея тръгва преиздаването със същия номер.
 * CONSEGNATA също не е — за публичната администрация след доставката идва
 * произнасяне (NE или DT).
 */
export const TRANSIZIONI_SDI: Record<StatoSdi, readonly StatoSdi[]> = {
  NON_INVIATA: ["GENERATA"],
  GENERATA: ["INVIATA", "NON_INVIATA"],
  INVIATA: ["CONSEGNATA", "MANCATA_CONSEGNA", "SCARTATA"],
  CONSEGNATA: ["ACCETTATA", "RIFIUTATA", "DECORSI_TERMINI"],
  MANCATA_CONSEGNA: ["CONSEGNATA", "ACCETTATA", "RIFIUTATA", "DECORSI_TERMINI"],
  // Преиздаване: документът се генерира наново със СЪЩИЯ номер и дата.
  SCARTATA: ["GENERATA"],
  ACCETTATA: [],
  RIFIUTATA: ["GENERATA"], // отказът от PA също се поправя и преподава
  DECORSI_TERMINI: [],
};

export function transizioneSdiAmmessa(da: StatoSdi, a: StatoSdi): boolean {
  return TRANSIZIONI_SDI[da].includes(a);
}

/** Статусът, който известието налага. `esito` важи само за NE. */
export function statoDaNotifica(
  tipo: TipoNotifica,
  esito?: string | null,
): StatoSdi {
  switch (tipo) {
    case "RC":
      return "CONSEGNATA";
    case "MC":
      return "MANCATA_CONSEGNA";
    case "NS":
      return "SCARTATA";
    case "DT":
      return "DECORSI_TERMINI";
    case "NE":
      return String(esito ?? "").toUpperCase() === "EC02"
        ? "RIFIUTATA"
        : "ACCETTATA";
    // AT удостоверява подаването, но не мени съдбата на документа.
    case "AT":
      return "INVIATA";
  }
}

/** Дните за преиздаване след отказ. */
export const GIORNI_RINVIO_DOPO_SCARTO = 5;

/**
 * Докога отхвърленият документ може да бъде преиздаден със същия номер.
 *
 * Датата е ЧИСТА (полунощ UTC): срокът тече в дни, а не в часове, и не бива
 * да зависи от това по кое време е дошло известието.
 */
export function scadenzaRinvio(dataNotifica: Date): Date {
  const d = new Date(
    Date.UTC(
      dataNotifica.getUTCFullYear(),
      dataNotifica.getUTCMonth(),
      dataNotifica.getUTCDate(),
    ),
  );
  d.setUTCDate(d.getUTCDate() + GIORNI_RINVIO_DOPO_SCARTO);
  return d;
}

/**
 * Свободен ли е още номерът на този документ.
 *
 * Отхвърлената фактура не е издадена — номерът ѝ не е изразходван и НЕ бива да
 * се дава на следващия документ.
 */
export function numeroAncoraLibero(stato: StatoSdi): boolean {
  return (
    stato === "NON_INVIATA" || stato === "GENERATA" || stato === "SCARTATA"
  );
}

/** Документът стигнал ли е фискално до получателя (пряко или през кутията в AdE). */
export function documentoEmesso(stato: StatoSdi): boolean {
  return (
    stato === "CONSEGNATA" ||
    stato === "MANCATA_CONSEGNA" ||
    stato === "ACCETTATA" ||
    stato === "DECORSI_TERMINI"
  );
}

/** Иска ли статусът действие от оператора днес — и какво, на италиански. */
export function azioneRichiesta(
  stato: StatoSdi,
  scadenza: Date | null,
  oggi: Date,
): string | null {
  if (stato === "SCARTATA") {
    if (!scadenza)
      return "Fattura scartata: correggere e ritrasmettere entro 5 giorni.";
    const giorni = Math.ceil(
      (scadenza.getTime() - oggi.getTime()) / 86_400_000,
    );
    if (giorni < 0)
      return "Fattura scartata: termine di 5 giorni superato. La fattura risulta non emessa — verificare con il commercialista.";
    return `Fattura scartata: correggere e ritrasmettere entro ${giorni} giorn${giorni === 1 ? "o" : "i"}.`;
  }
  if (stato === "MANCATA_CONSEGNA")
    return "Recapito non riuscito: la fattura è nel cassetto fiscale del destinatario. Comunicarglielo con altro mezzo.";
  if (stato === "RIFIUTATA")
    return "Rifiutata dalla PA: correggere e ritrasmettere.";
  if (stato === "GENERATA") return "XML pronto: resta da trasmettere.";
  return null;
}
