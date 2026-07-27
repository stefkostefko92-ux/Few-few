// Законовият режим на асансьора — D.P.R. 162/1999.
//
// Тук стоят правилата, които решават кога уредбата може да работи и докога.
// Живеят отделно от маршрутите по същата причина като фискалните: носят правна
// тежест и трябва да носят тестове, а не коментари.
//
// Кой какво прави (постоянен източник на объркване):
//
//   • ПРОВЕРКАТА по чл. 13 е на ТРЕТА страна — нотифициран орган, ASL или
//     ARPA — на всеки две години. Поръчва я СОБСТВЕНИКЪТ. Ние само вписваме
//     резултата.
//   • ПОДДРЪЖКАТА по чл. 15 е наша. Тя включва изброени проверки, които се
//     правят периодично и се вписват в рапортичка.
//
// Смесването им е скъпо: фирма, която мисли, че двугодишната проверка е нейна,
// не я поръчва — и уредбата остава без валидна проверка, докато не дойде
// контрола.

/** Периодичността на проверката по чл. 13, ал. 1 — две години. */
export const MESI_VERIFICA_PERIODICA = 24;

/** Шестмесечните проверки на поддържащата фирма по чл. 15, ал. 4. */
export const MESI_VERIFICA_SEMESTRALE = 6;

export const ESITI_VERIFICA = [
  "POSITIVO",
  "CON_PRESCRIZIONI",
  "NEGATIVO",
] as const;
export type EsitoVerifica = (typeof ESITI_VERIFICA)[number];

export const TIPI_VERIFICA = [
  "PERIODICA",
  "STRAORDINARIA",
  "MESSA_IN_SERVIZIO",
] as const;
export type TipoVerifica = (typeof TIPI_VERIFICA)[number];

/** Добавя месеци, като пази края на месеца (31 март + 1 месец = 30 април). */
export function aggiungiMesi(d: Date, mesi: number): Date {
  const giorno = d.getUTCDate();
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + mesi, 1));
  const ultimo = new Date(
    Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0),
  ).getUTCDate();
  r.setUTCDate(Math.min(giorno, ultimo));
  return r;
}

/**
 * Следващата проверка след дадена.
 *
 * Отрицателният изход НЕ дава следваща дата: уредбата е спряна и се пуска само
 * с нова проверка, чиято дата зависи от това кога собственикът я поръча. Да
 * сложим „след две години“ би значело следващото напомняне да дойде, когато
 * уредбата вече две години е незаконно спряна.
 */
export function prossimaVerifica(
  data: Date,
  esito: EsitoVerifica,
  tipo: TipoVerifica = "PERIODICA",
): Date | null {
  if (esito === "NEGATIVO") return null;
  // Извънредната проверка (чл. 14) не смъква часовника на периодичната: тя се
  // прави по повод, а двугодишният срок тече от последната ПЕРИОДИЧНА.
  if (tipo === "STRAORDINARIA") return null;
  return aggiungiMesi(data, MESI_VERIFICA_PERIODICA);
}

/**
 * Състоянието, което изходът налага.
 *
 * Три случая, и третият е този, който лесно се пропуска:
 *
 *   • ОТРИЦАТЕЛЕН → административно спиране. Чл. 14, ал. 2: проверяващият
 *     уведомява Общината, а собственикът извежда уредбата от служба НЕЗАБАВНО.
 *     Не е наше решение и не се отменя от нас — затова е отделно състояние.
 *   • ПОЛОЖИТЕЛЕН върху административно спряна уредба → пускане. Точно тази
 *     проверка е правното събитие, което вдига забраната. Без този случай
 *     уредбата остава спряна ЗАВИНАГИ: спирането се налага само от отрицателна
 *     проверка, а вдигането му е отказано на обикновената промяна.
 *   • Всичко останало → `null`, тоест „не пипай“. Положителна проверка НЕ
 *     пуска уредба, спряна по ДРУГА причина (повреда, ремонт, изведена от
 *     служба): проверката не казва нищо за нея.
 */
export function statoDopoVerifica(
  esito: EsitoVerifica,
  statoAttuale?: string,
): "FERMO_AMMINISTRATIVO" | "ATTIVO" | null {
  if (esito === "NEGATIVO") return "FERMO_AMMINISTRATIVO";
  return statoAttuale === "FERMO_AMMINISTRATIVO" ? "ATTIVO" : null;
}

/**
 * Може ли уредбата да бъде пусната от това състояние.
 *
 * Административното спиране се вдига САМО с нова положителна проверка. Ако
 * поддържащата фирма може да го махне с падащо меню, състоянието не значи
 * нищо — а именно това то трябва да значи.
 */
export function riavviabileDaOperatore(stato: string): boolean {
  return stato !== "FERMO_AMMINISTRATIVO";
}

// ── Проверките по чл. 15, ал. 4 ────────────────────────────────────────────

/**
 * Какво поддържащата фирма е длъжна да проверява периодично.
 *
 * Списъкът е от самия текст на закона. Полетата са ТРИСТОЙНОСТНИ (`true` /
 * `false` / липсва): „не е гледано“ и „гледано, не е наред“ са различни неща, а
 * при злополука разликата е между небрежност и открита неизправност.
 *
 * `critico` маркира онези, чиято неизправност значи спиране, а не забележка.
 */
export const CONTROLLI_ART15 = [
  { campo: "vFuni", etichetta: "Integrità delle funi o catene", critico: true },
  { campo: "vParacadute", etichetta: "Prova del paracadute", critico: true },
  {
    campo: "vLimitatoreVelocita",
    etichetta: "Prova del limitatore di velocità",
    critico: true,
  },
  {
    campo: "vIsolamentoElettrico",
    etichetta: "Isolamento dell'impianto elettrico",
    critico: true,
  },
  {
    campo: "vMessaTerra",
    etichetta: "Continuità del collegamento a terra",
    critico: true,
  },
  {
    campo: "vPorteSerrature",
    etichetta: "Porte di piano e serrature",
    critico: true,
  },
  {
    campo: "vIlluminazioneEmergenza",
    etichetta: "Illuminazione di emergenza in cabina",
    critico: false,
  },
  {
    campo: "vCitofonoAllarme",
    // UNI EN 81-28: без работеща двупосочна връзка блокиран човек не може да
    // повика помощ. Затова е критична, макар да не е „механична“.
    etichetta: "Allarme e comunicazione bidirezionale (UNI EN 81-28)",
    critico: true,
  },
] as const;

export type CampoControllo = (typeof CONTROLLI_ART15)[number]["campo"];

export type Controlli = Partial<
  Record<CampoControllo, boolean | null | undefined>
>;

export interface EsitoControlli {
  /** Проверени и наред. */
  conformi: string[];
  /** Проверени и НЕ наред. */
  difformi: string[];
  /** Критични, които не са наред — те спират уредбата. */
  difformiCritici: string[];
  /** Изобщо непроверени. */
  nonVerificati: string[];
  /** Пълен ли е списъкът за шестмесечната проверка. */
  completo: boolean;
}

export function valutaControlli(c: Controlli): EsitoControlli {
  const conformi: string[] = [];
  const difformi: string[] = [];
  const difformiCritici: string[] = [];
  const nonVerificati: string[] = [];
  for (const x of CONTROLLI_ART15) {
    const v = c[x.campo];
    if (v === true) conformi.push(x.etichetta);
    else if (v === false) {
      difformi.push(x.etichetta);
      if (x.critico) difformiCritici.push(x.etichetta);
    } else nonVerificati.push(x.etichetta);
  }
  return {
    conformi,
    difformi,
    difformiCritici,
    nonVerificati,
    completo: nonVerificati.length === 0,
  };
}

/**
 * Какво не е наред с рапортичката — на италиански, за техника на място.
 *
 * Не блокира вписването: техникът трябва да може да запише каквото е заварил,
 * включително непълна проверка. Блокира само противоречията.
 */
export function problemiRapportino(r: {
  tipoIntervento: string;
  esito: string;
  controlli: Controlli;
}): string[] {
  const problemi: string[] = [];
  const v = valutaControlli(r.controlli);

  if (r.tipoIntervento === "VERIFICA_SEMESTRALE" && !v.completo)
    problemi.push(
      `Verifica semestrale incompleta: mancano ${v.nonVerificati.length} controlli previsti dall'art. 15 c.4 D.P.R. 162/1999 (${v.nonVerificati.join(", ")}).`,
    );

  // Открита критична неизправност + „решено“ е противоречие, което после се
  // чете като че уредбата е била изправна.
  if (v.difformiCritici.length && r.esito === "RISOLTO")
    problemi.push(
      `Esito «risolto» ma risultano non conformi controlli critici: ${v.difformiCritici.join(", ")}. Se il difetto è stato riparato, segnare il controllo come conforme; altrimenti l'impianto va fermato.`,
    );

  return problemi;
}

/** Открива ли рапортичката неизправност, която налага спиране на уредбата. */
export function richiedeFermo(c: Controlli): boolean {
  return valutaControlli(c).difformiCritici.length > 0;
}

// ── Съобщението до Общината по чл. 12 ──────────────────────────────────────

/** Срокът за съобщението: 10 дни от декларацията за съответствие. */
export const GIORNI_COMUNICAZIONE_COMUNE = 10;

/**
 * Какво липсва на уредбата, за да е правно изрядна.
 *
 * Проверката е за нашите записи, не за самата уредба — но липсващият номер от
 * Общината обикновено значи, че съобщението изобщо не е подадено.
 */
export function problemiConformita(i: {
  matricolaComune?: string | null;
  comune?: string | null;
  dataComunicazione?: Date | null;
  dataInstallazione?: Date | null;
  regime: string;
  organismoNotificato?: string | null;
}): string[] {
  const problemi: string[] = [];
  // Заварените уредби (отпреди D.P.R. 162/1999) нямат съобщение по чл. 12 в
  // този вид — искането му от тях би било шум.
  if (i.regime !== "PREESISTENTE") {
    if (!i.matricolaComune)
      problemi.push(
        "Manca il numero di matricola assegnato dal Comune (art. 12 D.P.R. 162/1999): senza, l'impianto non risulta messo in esercizio.",
      );
    if (!i.comune)
      problemi.push("Manca il Comune che ha assegnato la matricola.");
    if (!i.dataComunicazione)
      problemi.push(
        "Manca la data della comunicazione al Comune (entro 10 giorni dalla dichiarazione di conformità).",
      );
  }
  if (!i.organismoNotificato)
    problemi.push(
      "Non è indicato il soggetto incaricato delle verifiche periodiche biennali (art. 13): va scelto dal proprietario.",
    );
  return problemi;
}
