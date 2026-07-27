// Какво пише в известието и на кого се праща — ЧИСТО, без база и без мрежа.
//
// Тук е и правилото за минимизацията, защото то е свойство на ТЕКСТА, не на
// транспорта. Известието напуска сървъра, минава през чуждо реле и остава в
// нечия кутия завинаги. Затова в него влизат само:
//
//   • матриколата на уредбата (тя е върху табелката, публична е на място);
//   • видът на срока и датата му;
//   • номерът на документа, ако става дума за документ;
//   • връзка към записа в гестионала — истинските данни се четат СЛЕД вход.
//
// НЕ влизат: имена на живи хора, адреси на кондомини, суми, телефони.
// Основанието е чл. 5(1)(в) ОРЗД, а практическата проверка е проста — известие,
// препратено по грешка, не бива да казва нищо на този, който го получи.

// Праговете (90/60/30) НЕ се обявяват тук: те живеят веднъж, в
// `scadenze-logic.ts` (`sogliePendenti`). Второ копие изглежда безобидно точно
// докато някой не смени едното — и известието тръгне на праг, на който
// автоматизмът не вдига флаг.

export type TipoNotifica =
  | "SCADENZA_IMPIANTO"
  | "SCADENZA_AUTOMEZZO"
  | "FATTURA_SCADUTA"
  | "PREVENTIVO_SCADUTO";

export interface Modello {
  tipo: TipoNotifica;
  /** Идемпотентният ключ. Едно събитие = един ключ, завинаги. */
  chiave: string;
  oggetto: string;
  corpo: string;
}

function dataIt(d: Date): string {
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function piede(url: string, percorso: string): string {
  return `\n\nApri la scheda: ${url}${percorso}\n\n—\nMessaggio automatico del gestionale ERP Ascensori. Non rispondere a questo indirizzo.`;
}

/**
 * Срок по закон на уредба (чл. 13 D.P.R. 162/1999 и подобни).
 *
 * Обектът на писмото носи ДНИТЕ, защото това е, което се чете в списъка с
 * непрочетена поща: „fra 30 giorni" се различава от „fra 90" с един поглед.
 */
export function modelloScadenzaImpianto(v: {
  scadenzaId: string;
  matricola: string;
  tipo: string;
  scadenza: Date;
  soglia: number;
  impiantoId: string;
  appUrl: string;
}): Modello {
  return {
    tipo: "SCADENZA_IMPIANTO",
    chiave: `scadenza-impianto:${v.scadenzaId}:${v.soglia}`,
    oggetto: `Scadenza fra ${v.soglia} giorni — impianto ${v.matricola}`,
    corpo:
      `Impianto ${v.matricola}\n` +
      `Adempimento: ${v.tipo}\n` +
      `Scadenza: ${dataIt(v.scadenza)} (fra ${v.soglia} giorni)\n\n` +
      "Se l'adempimento è già stato eseguito, registrarlo nel gestionale: " +
      "l'avviso si ripete alle soglie successive finché la scadenza risulta aperta." +
      piede(v.appUrl, `/impianti/${v.impiantoId}`),
  };
}

/**
 * Срок на превозно средство: застраховка, преглед, обслужване.
 *
 * КЛЮЧЪТ НОСИ ДАТАТА, не състоянието. С „…:rosso" вторият път, когато същият
 * автомобил влезе в червено — след като документите са били подновени и после
 * пак са изтекли — уникалният индекс би сметнал известието за дубликат и то
 * НЯМАШЕ ДА ТРЪГНЕ. Подновяването сменя датата, значи сменя и ключа.
 */
export function modelloScadenzaAutomezzo(v: {
  automezzoId: string;
  targa: string;
  stato: string;
  scadenza: Date;
  appUrl: string;
}): Modello {
  return {
    tipo: "SCADENZA_AUTOMEZZO",
    chiave: `scadenza-automezzo:${v.automezzoId}:${v.scadenza.toISOString().slice(0, 10)}`,
    oggetto: `Automezzo ${v.targa} — scadenza il ${dataIt(v.scadenza)}`,
    corpo:
      `Automezzo ${v.targa}\n` +
      `Prima scadenza utile: ${dataIt(v.scadenza)}\n` +
      `Stato del mezzo: ${v.stato}\n\n` +
      "Un mezzo con revisione o assicurazione scaduta non può circolare." +
      piede(v.appUrl, `/automezzi`),
  };
}

/**
 * Просрочена фактура.
 *
 * БЕЗ СУМАТА. Тя не е нужна, за да се разбере, че трябва да се погледне, и е
 * точно данните, които не искаме в чужда пощенска кутия.
 */
export function modelloFatturaScaduta(v: {
  fatturaId: string;
  numero: string;
  scadenza: Date;
  appUrl: string;
}): Modello {
  return {
    tipo: "FATTURA_SCADUTA",
    chiave: `fattura-scaduta:${v.fatturaId}`,
    oggetto: `Fattura ${v.numero} scaduta`,
    corpo:
      `Fattura ${v.numero}\n` +
      `Termine di pagamento: ${dataIt(v.scadenza)} — superato\n\n` +
      "Valutare l'invio di un sollecito. Gli interessi di mora decorrono " +
      "dal giorno successivo alla scadenza (D.Lgs. 231/2002)." +
      piede(v.appUrl, `/fatture/${v.fatturaId}`),
  };
}

/** Изтекла оферта — търговско, не нормативно, но се губи по същия начин. */
export function modelloPreventivoScaduto(v: {
  preventivoId: string;
  numero: string;
  appUrl: string;
}): Modello {
  return {
    tipo: "PREVENTIVO_SCADUTO",
    chiave: `preventivo-scaduto:${v.preventivoId}`,
    oggetto: `Preventivo ${v.numero} scaduto`,
    corpo:
      `Preventivo ${v.numero}\n` +
      "Il termine di validità è trascorso senza accettazione.\n\n" +
      "Se la trattativa è ancora aperta, emettere un nuovo preventivo." +
      piede(v.appUrl, `/preventivi/${v.preventivoId}`),
  };
}

/**
 * Разбира списъка с получатели.
 *
 * Празният вход НЕ е грешка — той значи „никой не е посочен", тоест функцията е
 * изключена за тази фирма. Дублираните адреси се махат: две еднакви известия в
 * една кутия учат човека да ги трие, без да ги чете.
 */
export function destinatari(v: string | null | undefined): string[] {
  return [
    ...new Set(
      String(v ?? "")
        .split(/[,;]/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

/** Колко пъти опитваме, преди да обявим известието за неизпратено. */
export const MAX_TENTATIVI = 5;

/**
 * След колко време е следващият опит.
 *
 * Експоненциално, с таван от шест часа: пощенските релета отказват временно при
 * пик (греylisting е точно това) и връщането след минута не помага на никого.
 */
export function prossimoTentativo(tentativi: number, ora: Date): Date {
  const minuti = Math.min(360, 5 * Math.pow(3, Math.max(0, tentativi - 1)));
  return new Date(ora.getTime() + minuti * 60_000);
}
