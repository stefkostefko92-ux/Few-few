// FatturaPA 1.2.2 — XML-ът, който Sistema di Interscambio приема.
//
// Защо това не е „още един експорт": от 2024 г. електронната фактура през SDI е
// задължителна за всички титуляри на P.IVA, а фактура ИЗВЪН SDI се третира като
// НЕИЗДАДЕНА (чл. 6 D.Lgs. 471/1997 — санкцията е върху неиздадената фактура,
// не върху формата). Дотук продуктът правеше PDF; PDF не е фактура.
//
// Модулът е ЧИСТ: вход — обикновени данни, изход — низ. Така реквизитите носят
// тестове, а не коментари, и правилата се четат на едно място.

import {
  riepilogoIva,
  totaleVoce,
  toCents,
  fromCents,
  type VoceInput,
} from "@/lib/totals";
import { calcolaRitenuta, problemiRitenuta } from "@/lib/fiscale/ritenuta";
import { modalitaValida, condizioneValida } from "@/lib/fiscale/pagamenti";

export interface AziendaSdi {
  ragioneSociale: string;
  partitaIva: string | null;
  codiceFiscale: string | null;
  regimeFiscale: string;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  iban: string | null;
}

export interface ClienteSdi {
  denominazione: string;
  /** Физическо лице: име и фамилия отделно (SDI ги иска така). */
  nome?: string | null;
  cognome?: string | null;
  persona: boolean;
  partitaIva: string | null;
  codiceFiscale: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  codiceSdi: string | null;
  pec: string | null;
  /**
   * Получателят кондоминиум ли е.
   *
   * Не е козметика: кондоминиумът няма данъчен номер по ДДС, а само данъчен
   * номер (единайсет цифри, които ЛИЧАТ като P.IVA). Ако тази стойност влезе в
   * `IdFiscaleIVA`, SDI приема документа, но получателят е обявен като
   * данъчнозадължено лице — което не е. Оттук идва и удържането по чл. 25-ter.
   */
  condominio?: boolean;
}

export interface RigaSdi extends VoceInput {
  descrizione: string;
  naturaIva?: string | null;
  /** Влиза ли редът в базата за удържането по чл. 25-ter. */
  ritenuta?: boolean | null;
}

/** Един падеж от плана за плащане. При `TP01` са няколко. */
export interface ScadenzaSdi {
  data?: Date | null;
  /** Сумата в центесими. */
  importo: number;
  /** MP01…MP23; празно значи модалността на документа. */
  modalita?: string | null;
}

export interface RitenutaSdi {
  /** RT01 физическо лице · RT02 юридическо лице. */
  tipo: string;
  /** Причина по модел 770; „W" е чл. 25-ter. */
  causale: string;
  /** Годишният процент в стотни (4,00 % → 400). */
  aliquota: number;
}

/** Едно съпровождащо DDT: номер и дата на доставката. */
export interface DdtSdi {
  numero: string;
  data: Date;
  /** Кои редове на фактурата идват от това DDT. Празно = всички. */
  righeRiferite?: number[];
}

export interface FatturaSdi {
  numero: string;
  data: Date;
  dataScadenza?: Date | null;
  /**
   * TD01 = обикновена фактура · TD04 = кредитно известие (сторно) ·
   * TD24 = ОТЛОЖЕНА фактура.
   *
   * TD24 не е удобство, а РЕЖИМ по чл. 21, ал. 4, б. „а" D.P.R. 633/1972:
   * доставките, придружени с DDT, се фактурират до 15-о число на месеца СЛЕД
   * доставката. Точно така работи асансьорна фирма — вози части през целия
   * месец и издава една фактура. Подадена като TD01, тя носи дата след
   * доставката без обяснение, а това е реквизит, не форматност.
   */
  tipoDocumento: "TD01" | "TD04" | "TD24";
  /**
   * Съпровождащите документи (DDT) — задължителни при TD24.
   *
   * Те са ВРЪЗКАТА между датата на доставката и датата на фактурата. Без тях
   * отложената фактура не доказва защо е издадена по-късно.
   */
  ddt?: DdtSdi[] | null;
  causale?: string | null;
  azienda: AziendaSdi;
  cliente: ClienteSdi;
  righe: RigaSdi[];
  /** Пореден номер на подаването — влиза и в името на файла. */
  progressivoInvio: string;

  /** Удържане по чл. 25-ter D.P.R. 600/1973; `null` = няма. */
  ritenuta?: RitenutaSdi | null;
  /** Чл. 17-ter D.P.R. 633/1972 — ДДС-то се внася от публичния получател. */
  splitPayment?: boolean;
  /** Обществена поръчка (закон 136/2010) — задължителни към PA. */
  cig?: string | null;
  cup?: string | null;
  /** TP01 на вноски · TP02 наведнъж · TP03 авансово. */
  condizioniPagamento?: string | null;
  /** MP01…MP23. */
  modalitaPagamento?: string | null;
  /** Планът за плащане. Празен = един падеж за цялата сума. */
  scadenze?: ScadenzaSdi[];
}

/** Кодът по подразбиране: документът отива в кутията на получателя в AdE. */
export const CODICE_SDI_GENERICO = "0000000";

const RE_CAP = /^\d{5}$/;
const RE_PROVINCIA = /^[A-Z]{2}$/;
const RE_PIVA = /^\d{11}$/;
const RE_CODICE_SDI = /^[A-Z0-9]{6,7}$/;
/** N1…N7 с подкодове (N2.1, N6.9 и т.н.) — кодировката след 2021 г. */
const RE_NATURA = /^N[1-7](\.[0-9])?$/;

function testo(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Екранира текста за XML.
 *
 * Не е дребна хигиена: описанието на реда идва от потребителя, а „Ricambi A&B"
 * или „<vedi allegato>" правят документа неразбираем за парсера — тоест
 * отхвърлен от SDI, не „грозен".
 */
export function esc(v: unknown): string {
  return (
    testo(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
      // Контролните знаци са невалидни в XML 1.0 ДОРИ екранирани — един залепен
      // при копи-пейст знак прави целия документ неразбираем за парсера.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  );
}

/** Дата във формата, който SDI иска (`AAAA-MM-GG`, без час и без часова зона). */
export function dataSdi(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** Число с точно две десетични, точка за десетичен знак. */
function num(v: string | number): string {
  return fromCents(toCents(v));
}

/** Количество: SDI допуска до 8 десетични, но иска поне 2. */
function quantita(v: unknown): string {
  return num(String(v ?? "1"));
}

export interface TotaliSdi {
  /** Облагаема основа, сборувана ПО СТАВКА. */
  imponibile: number;
  imposta: number;
  /** Удържаното по чл. 25-ter; нула, когато няма. */
  ritenuta: number;
  /**
   * `ImportoTotaleDocumento` — БРУТО, включително ДДС и БЕЗ приспадане на
   * удържаното.
   *
   * Това е практиката, която SDI приема и която ползва по-голямата част от
   * италианския софтуер: удържаното не намалява документа, а само плащането.
   * Техническите указания на Agenzia delle Entrate допускат и двете четения,
   * затова стойността е изведена на едно място — ако счетоводителят на клиента
   * иска другото, се сменя ТУК, а не на пет места.
   */
  importoTotaleDocumento: number;
  /** `ImportoPagamento` — това, което получателят реално превежда. */
  importoPagamento: number;
}

/**
 * Тоталите на документа — едно място за истината.
 *
 * Валидаторът и генераторът смятат от ТУК. Досега генераторът си правеше
 * сметките наум, а валидаторът гледаше други полета: разминаването между двете
 * е точно грешката, която SDI хваща като „ImportoTotaleDocumento non coerente".
 */
export function totaliSdi(f: FatturaSdi): TotaliSdi {
  const riepilogo = riepilogoIva(f.righe);
  const imponibile = riepilogo.reduce((s, r) => s + toCents(r.imponibile), 0);
  const imposta = riepilogo.reduce((s, r) => s + toCents(r.imposta), 0);

  // Базата за удържането са само редовете, които го носят. По подразбиране —
  // всички: удържането по чл. 25-ter е върху цялото възнаграждение по договора.
  const marcati = f.righe.filter((r) => r.ritenuta);
  const baseRitenuta = f.ritenuta
    ? marcati.length
      ? riepilogoIva(marcati).reduce((s, r) => s + toCents(r.imponibile), 0)
      : imponibile
    : 0;
  const ritenuta = f.ritenuta
    ? calcolaRitenuta(baseRitenuta, imposta, f.ritenuta.aliquota).importo
    : 0;

  // Split payment: ДДС-то се внася от публичния получател — той не ни го плаща.
  const ivaIncassata = f.splitPayment ? 0 : imposta;
  return {
    imponibile,
    imposta,
    ritenuta,
    importoTotaleDocumento: imponibile + imposta,
    importoPagamento: imponibile + ivaIncassata - ritenuta,
  };
}

export interface EsitoValidazione {
  /** Блокиращи: с тях документът не бива да тръгва. */
  problemi: string[];
  /** Приема се, но операторът трябва да знае. */
  avvisi: string[];
}

/**
 * Реквизитите, които липсват. Празен списък = документът може да тръгне.
 *
 * Съобщенията са на ИТАЛИАНСКИ и сочат КЪДЕ се поправя: администраторът, който
 * ги чете, не е този, който е писал кода. Проверката е предварителна — SDI
 * връща отказ чак след дни, а до тогава фактурата се счита за неиздадена.
 *
 * Разделянето на блокиращи и предупреждения не е козметика: липсваща PEC при
 * получател без codice destinatario беше третирана като грешка и спираше
 * съвършено валидни фактури към кондоминиуми. `0000000` е ЗАКОНЕН адрес —
 * документът отива в кутията на получателя в Agenzia delle Entrate.
 */
export function controllaPerSdi(f: FatturaSdi): EsitoValidazione {
  const problemi: string[] = [];
  const avvisi: string[] = [];
  const a = f.azienda;
  const c = f.cliente;

  if (!testo(a.ragioneSociale))
    problemi.push("Impostazioni: manca la ragione sociale.");
  if (!RE_PIVA.test(testo(a.partitaIva)))
    problemi.push("Impostazioni: la partita IVA deve essere di 11 cifre.");
  if (!testo(a.indirizzo) || !testo(a.citta))
    problemi.push(
      "Impostazioni: manca l'indirizzo della sede (indirizzo e comune).",
    );
  if (!RE_CAP.test(testo(a.cap)))
    problemi.push("Impostazioni: il CAP deve essere di 5 cifre.");
  if (!RE_PROVINCIA.test(testo(a.provincia).toUpperCase()))
    problemi.push(
      "Impostazioni: la provincia deve essere la sigla di 2 lettere (es. MI).",
    );
  if (!/^RF\d{2}$/.test(testo(a.regimeFiscale)))
    problemi.push("Impostazioni: regime fiscale non valido (es. RF01).");

  if (!testo(c.denominazione) && !(testo(c.nome) && testo(c.cognome)))
    problemi.push("Cliente: manca la denominazione (o nome e cognome).");
  if (!RE_PIVA.test(testo(c.partitaIva)) && !testo(c.codiceFiscale))
    problemi.push("Cliente: serve la partita IVA o il codice fiscale.");
  if (c.condominio && RE_PIVA.test(testo(c.partitaIva)))
    problemi.push(
      "Condominio con partita IVA: il condominio non è soggetto IVA. Il codice di 11 cifre va indicato come codice fiscale, non come partita IVA.",
    );
  if (!testo(c.indirizzo) || !testo(c.citta))
    problemi.push("Cliente: manca l'indirizzo (indirizzo e comune).");
  if (!RE_CAP.test(testo(c.cap)))
    problemi.push("Cliente: il CAP deve essere di 5 cifre.");
  if (!RE_PROVINCIA.test(testo(c.provincia).toUpperCase()))
    problemi.push(
      "Cliente: la provincia deve essere la sigla di 2 lettere (es. RM).",
    );
  const codice = testo(c.codiceSdi) || CODICE_SDI_GENERICO;
  if (!RE_CODICE_SDI.test(codice.toUpperCase()))
    problemi.push("Cliente: codice destinatario non valido (6 o 7 caratteri).");
  // `0000000` е ЗАКОНЕН адрес: документът се приема и стои в кутията на
  // получателя в Agenzia delle Entrate. Не стига обаче до пощата му — затова
  // предупреждение, не отказ.
  if (codice === CODICE_SDI_GENERICO && !testo(c.pec))
    avvisi.push(
      "Cliente senza codice destinatario né PEC: la fattura sarà valida ma resterà nel cassetto fiscale. Va comunicata al destinatario con altro mezzo (copia di cortesia).",
    );

  if (!testo(f.numero)) problemi.push("Fattura: manca il numero.");
  if (testo(f.numero).length > 20)
    problemi.push("Fattura: il numero supera i 20 caratteri.");
  if (f.righe.length === 0)
    problemi.push("Fattura: nessuna riga da fatturare.");

  // TD24 БЕЗ съпровождащ документ е невалиден по същество, не по форма:
  // отложената фактура се държи на чл. 21, ал. 4, б. „а" D.P.R. 633/1972, а
  // основанието ѝ е самото DDT. Без него документът твърди отложен режим,
  // който не може да докаже.
  const ddt = f.ddt ?? [];
  if (f.tipoDocumento === "TD24" && ddt.length === 0)
    problemi.push(
      "Fattura differita (TD24): serve almeno un DDT di riferimento (art. 21, comma 4, lett. a, D.P.R. 633/1972).",
    );
  ddt.forEach((d, i) => {
    if (!testo(d.numero)) problemi.push(`DDT ${i + 1}: manca il numero.`);
    if (!(d.data instanceof Date) || Number.isNaN(d.data.getTime()))
      problemi.push(`DDT ${i + 1}: data non valida.`);
    // Доставка СЛЕД фактурата обръща причината и следствието: отложената
    // фактура покрива вече извършени доставки.
    else if (d.data > f.data)
      problemi.push(
        `DDT ${i + 1}: la data del DDT è successiva alla data della fattura.`,
      );
  });
  // Обратното също е дефект, но само предупреждение: срокът се брои по месеца
  // на доставката, а „кой месец" зависи от датата — оставяме преценката на
  // човека, вместо да отказваме документ, който може да е законен.
  if (f.tipoDocumento === "TD24" && ddt.length > 0) {
    const piuVecchio = ddt.reduce(
      (m, d) => (d.data < m ? d.data : m),
      ddt[0].data,
    );
    const limite = new Date(
      Date.UTC(piuVecchio.getUTCFullYear(), piuVecchio.getUTCMonth() + 1, 15),
    );
    if (f.data > limite)
      avvisi.push(
        "Fattura differita emessa oltre il 15 del mese successivo alla consegna più vecchia: verificare i termini (art. 21, comma 4, lett. a, D.P.R. 633/1972).",
      );
  }
  if (f.tipoDocumento !== "TD24" && ddt.length > 0)
    avvisi.push(
      "Sono indicati dei DDT ma il documento non è di tipo TD24 (fattura differita): verificare il tipo documento.",
    );

  f.righe.forEach((r, i) => {
    if (!testo(r.descrizione))
      problemi.push(`Riga ${i + 1}: manca la descrizione.`);
    const aliquota = toCents(r.aliquotaIva);
    const natura = testo(r.naturaIva).toUpperCase();
    if (aliquota === 0 && !natura)
      problemi.push(
        `Riga ${i + 1}: con aliquota 0 % è obbligatoria la natura (N1…N7): senza, l'esenzione non è dichiarata.`,
      );
    if (aliquota > 0 && natura)
      problemi.push(
        `Riga ${i + 1}: la natura si indica solo con aliquota 0 %.`,
      );
    if (natura && !RE_NATURA.test(natura))
      problemi.push(`Riga ${i + 1}: natura «${natura}» non valida.`);
  });

  // ── Удържане ─────────────────────────────────────────────────────────────
  if (f.ritenuta)
    problemi.push(
      ...problemiRitenuta({
        ritenuta: true,
        ritenutaTipo: f.ritenuta.tipo,
        ritenutaCausale: f.ritenuta.causale,
        aliquota: f.ritenuta.aliquota,
        destinatarioCondominio: c.condominio === true,
      }),
    );
  else if (c.condominio)
    // Не блокира: има кондоминиуми без данъчен номер, а има и доставки, които
    // не са договор за изработка. Но мълчаливото пропускане е по-скъпо.
    avvisi.push(
      "Destinatario condominio senza ritenuta d'acconto: verificare l'art. 25-ter D.P.R. 600/1973 — il condominio è sostituto d'imposta e trattiene il 4 % sui corrispettivi d'appalto.",
    );

  // ── Плащане ──────────────────────────────────────────────────────────────
  const modalita = testo(f.modalitaPagamento) || "MP05";
  if (!modalitaValida(modalita))
    problemi.push(
      `Pagamento: modalità «${modalita}» non prevista dal tracciato (MP01…MP23).`,
    );
  const condizione = testo(f.condizioniPagamento) || "TP02";
  if (!condizioneValida(condizione))
    problemi.push(
      `Pagamento: condizione «${condizione}» non valida (TP01, TP02, TP03).`,
    );

  const t = totaliSdi(f);
  if (f.scadenze?.length) {
    const somma = f.scadenze.reduce((s, r) => s + Math.round(r.importo), 0);
    if (somma !== t.importoPagamento)
      problemi.push(
        `Piano di pagamento: la somma delle rate (${fromCents(somma)} €) non corrisponde all'importo da pagare (${fromCents(t.importoPagamento)} €).`,
      );
    if (f.scadenze.length > 1 && condizione !== "TP01")
      problemi.push(
        "Più rate indicate: la condizione di pagamento deve essere TP01.",
      );
  }

  // ── Split payment и обществени поръчки ───────────────────────────────────
  if (f.splitPayment && t.imposta === 0)
    avvisi.push(
      "Scissione dei pagamenti indicata su una fattura senza IVA: verificare.",
    );
  if (testo(f.cig) && !/^[A-Z0-9]{10}$/i.test(testo(f.cig)))
    problemi.push("CIG non valido: sono 10 caratteri alfanumerici.");
  if (testo(f.cup) && !/^[A-Z0-9]{15}$/i.test(testo(f.cup)))
    problemi.push("CUP non valido: sono 15 caratteri alfanumerici.");

  if (
    !testo(a.iban) &&
    (modalita === "MP05" || modalita === "MP19" || modalita === "MP21")
  )
    avvisi.push(
      "Modalità di pagamento bancaria senza IBAN in Impostazioni: il destinatario non saprà dove pagare.",
    );

  return { problemi, avvisi };
}

/**
 * Само блокиращите проблеми.
 *
 * Запазено за извикващите, които се интересуват единствено от „може ли да
 * тръгне"; предупрежденията се четат през `controllaPerSdi`.
 */
export function validaPerSdi(f: FatturaSdi): string[] {
  return controllaPerSdi(f).problemi;
}

/**
 * Името на файла по правилата на SDI: `IT<identificativo><progressivo>.xml`.
 *
 * Прогресивният код е уникален за подателя — SDI отхвърля повторно име като
 * дубликат, независимо от съдържанието.
 */
export function nomeFileSdi(partitaIva: string, progressivo: string): string {
  return `IT${testo(partitaIva)}_${testo(progressivo).toUpperCase()}.xml`;
}

/** Пореден код от 5 знака в base36 — стига за 60 милиона подавания. */
export function progressivoDaNumero(n: number): string {
  return Math.max(0, Math.floor(n))
    .toString(36)
    .toUpperCase()
    .padStart(5, "0")
    .slice(-5);
}

function bloccoSede(x: {
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
}): string {
  return `      <Sede>
        <Indirizzo>${esc(x.indirizzo)}</Indirizzo>
        <CAP>${esc(x.cap)}</CAP>
        <Comune>${esc(x.citta)}</Comune>
        <Provincia>${esc(testo(x.provincia).toUpperCase())}</Provincia>
        <Nazione>IT</Nazione>
      </Sede>`;
}

/**
 * Сглобява XML-а.
 *
 * Извиква се СЛЕД `validaPerSdi`: тук няма проверки, за да не се раздвои
 * истината за реквизитите между валидатор и генератор.
 */
export function xmlFatturaPa(f: FatturaSdi): string {
  const a = f.azienda;
  const c = f.cliente;
  // 6 знака = публична администрация, 7 = частен получател.
  const codice = (testo(c.codiceSdi) || CODICE_SDI_GENERICO).toUpperCase();
  const formato = codice.length === 6 ? "FPA12" : "FPR12";

  // Обобщението по аликвота, не сумиране по редове: SDI сверява
  // `ImportoTotaleDocumento` с `DatiRiepilogo` и отхвърля разлика от един цент.
  const riepilogo = riepilogoIva(f.righe);
  const t = totaliSdi(f);

  // Чл. 17-ter D.P.R. 633/1972: при разцепено плащане ДДС-то е дължимо от
  // публичния получател. `S` вместо `I` — без него PA не може да го внесе.
  const esigibilita = f.splitPayment ? "S" : "I";
  // Редовете, които влизат в базата за удържането. Празно значи „всички".
  const ritenutaSuTutte = f.ritenuta && !f.righe.some((r) => r.ritenuta);

  // Natura-та важи за цялата ставка: групираме я по аликвота от редовете.
  const naturaPerAliquota = new Map<string, string>();
  for (const r of f.righe) {
    const al = fromCents(toCents(r.aliquotaIva));
    const nat = testo(r.naturaIva).toUpperCase();
    if (nat) naturaPerAliquota.set(al, nat);
  }

  const linee = f.righe
    .map((r, i) => {
      const nat = testo(r.naturaIva).toUpperCase();
      return `        <DettaglioLinee>
          <NumeroLinea>${i + 1}</NumeroLinea>
          <Descrizione>${esc(r.descrizione)}</Descrizione>
          <Quantita>${quantita(r.quantita)}</Quantita>
          <PrezzoUnitario>${num(String(r.prezzoUnitario))}</PrezzoUnitario>
          <PrezzoTotale>${fromCents(totaleVoce(r))}</PrezzoTotale>
          <AliquotaIVA>${num(String(r.aliquotaIva))}</AliquotaIVA>${
            // Редът, върху който тече удържането. Редът в XML-а е по схемата:
            // `Ritenuta` идва СЛЕД `AliquotaIVA` и ПРЕДИ `Natura`.
            f.ritenuta && (ritenutaSuTutte || r.ritenuta)
              ? "\n          <Ritenuta>SI</Ritenuta>"
              : ""
          }${nat ? `\n          <Natura>${esc(nat)}</Natura>` : ""}
        </DettaglioLinee>`;
    })
    .join("\n");

  const riepiloghi = riepilogo
    .map((r) => {
      const nat = naturaPerAliquota.get(r.aliquota);
      return `        <DatiRiepilogo>
          <AliquotaIVA>${r.aliquota}</AliquotaIVA>${nat ? `\n          <Natura>${esc(nat)}</Natura>` : ""}
          <ImponibileImporto>${r.imponibile}</ImponibileImporto>
          <Imposta>${r.imposta}</Imposta>
          <EsigibilitaIVA>${esigibilita}</EsigibilitaIVA>
        </DatiRiepilogo>`;
    })
    .join("\n");

  // Удържането е в заглавието на документа, не по редовете: там стоят само
  // отметките кои редове го носят.
  const datiRitenuta = f.ritenuta
    ? `        <DatiRitenuta>
          <TipoRitenuta>${esc(f.ritenuta.tipo)}</TipoRitenuta>
          <ImportoRitenuta>${fromCents(t.ritenuta)}</ImportoRitenuta>
          <AliquotaRitenuta>${fromCents(f.ritenuta.aliquota)}</AliquotaRitenuta>
          <CausalePagamento>${esc(f.ritenuta.causale)}</CausalePagamento>
        </DatiRitenuta>\n`
    : "";

  // CIG/CUP влизат в `DatiOrdineAcquisto`: без тях PA не може да плати, а
  // проследимостта на паричния поток по закон 136/2010 е нарушена.
  const datiOrdine =
    testo(f.cig) || testo(f.cup)
      ? `      <DatiOrdineAcquisto>
        <RiferimentoNumeroLinea>1</RiferimentoNumeroLinea>
        <IdDocumento>${esc(f.numero)}</IdDocumento>${
          testo(f.cup)
            ? `\n        <CodiceCUP>${esc(testo(f.cup).toUpperCase())}</CodiceCUP>`
            : ""
        }${testo(f.cig) ? `\n        <CodiceCIG>${esc(testo(f.cig).toUpperCase())}</CodiceCIG>` : ""}
      </DatiOrdineAcquisto>\n`
      : "";

  // `DatiDDT` — блокът, който прави отложената фактура законна. Редът е фиксиран
  // от схемата на SDI: `NumeroDDT`, `DataDDT`, после (по избор) кои линии.
  //
  // `RiferimentoNumeroLinea` се подава САМО когато е ясно кои редове идват от
  // кое DDT. Измислена връзка е по-лоша от липсваща: тя твърди нещо конкретно
  // за произхода на реда пред данъчната администрация.
  const datiDdt = (f.ddt ?? [])
    .map(
      (d) => `      <DatiDDT>
        <NumeroDDT>${esc(d.numero)}</NumeroDDT>
        <DataDDT>${dataSdi(d.data)}</DataDDT>${(d.righeRiferite ?? [])
          .map(
            (n) =>
              `\n        <RiferimentoNumeroLinea>${n}</RiferimentoNumeroLinea>`,
          )
          .join("")}
      </DatiDDT>`,
    )
    .join("\n");

  const anagraficaCliente =
    c.persona && testo(c.nome) && testo(c.cognome)
      ? `          <Nome>${esc(c.nome)}</Nome>
          <Cognome>${esc(c.cognome)}</Cognome>`
      : `          <Denominazione>${esc(c.denominazione)}</Denominazione>`;

  // Втора линия срещу най-скъпата грешка: единайсетцифреният код на един
  // кондоминиум е ДАНЪЧЕН НОМЕР, не номер по ДДС. Влезе ли в `IdFiscaleIVA`,
  // документът обявява получателя за данъчнозадължено лице — а той не е.
  // Валидацията вече го спира; тук се спира и когато някой я е заобиколил.
  const idFiscaleCliente =
    !c.condominio && RE_PIVA.test(testo(c.partitaIva))
      ? `        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${esc(c.partitaIva)}</IdCodice>
        </IdFiscaleIVA>\n`
      : "";
  const cfCliente = testo(c.codiceFiscale)
    ? `        <CodiceFiscale>${esc(testo(c.codiceFiscale).toUpperCase())}</CodiceFiscale>\n`
    : "";

  // Планът за плащане. Досега имаше един твърдо зашит падеж за брутото и
  // блокът изобщо не се появяваше без IBAN — тоест фактура в брой оставаше без
  // указание как се плаща.
  const modalitaDoc = testo(f.modalitaPagamento) || "MP05";
  const condizione = testo(f.condizioniPagamento) || "TP02";
  const iban = testo(a.iban).toUpperCase().replace(/\s+/g, "");
  /** IBAN се посочва само при банковите начини; в брой е безсмислен. */
  const MODALITA_BANCARIE = ["MP05", "MP19", "MP21", "MP12", "MP09"];

  const rate: ScadenzaSdi[] = f.scadenze?.length
    ? f.scadenze
    : [
        {
          data: f.dataScadenza ?? null,
          importo: t.importoPagamento,
          modalita: modalitaDoc,
        },
      ];

  const dettagliPagamento = rate
    .map((r) => {
      const mod = testo(r.modalita) || modalitaDoc;
      const ibanRata = iban && MODALITA_BANCARIE.includes(mod) ? iban : "";
      return `        <DettaglioPagamento>
          <ModalitaPagamento>${esc(mod)}</ModalitaPagamento>${
            r.data
              ? `\n          <DataScadenzaPagamento>${dataSdi(r.data)}</DataScadenzaPagamento>`
              : ""
          }
          <ImportoPagamento>${fromCents(r.importo)}</ImportoPagamento>${
            ibanRata ? `\n          <IBAN>${esc(ibanRata)}</IBAN>` : ""
          }
        </DettaglioPagamento>`;
    })
    .join("\n");

  const pagamento = `      <DatiPagamento>
        <CondizioniPagamento>${esc(condizione)}</CondizioniPagamento>
${dettagliPagamento}
      </DatiPagamento>\n`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="${formato}" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2.2/Schema_del_file_xml_FatturaPA_v1.2.2.xsd">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>IT</IdPaese>
        <IdCodice>${esc(a.partitaIva)}</IdCodice>
      </IdTrasmittente>
      <ProgressivoInvio>${esc(f.progressivoInvio)}</ProgressivoInvio>
      <FormatoTrasmissione>${formato}</FormatoTrasmissione>
      <CodiceDestinatario>${esc(codice)}</CodiceDestinatario>${
        codice === CODICE_SDI_GENERICO && testo(c.pec)
          ? `\n      <PECDestinatario>${esc(c.pec)}</PECDestinatario>`
          : ""
      }
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${esc(a.partitaIva)}</IdCodice>
        </IdFiscaleIVA>${
          testo(a.codiceFiscale)
            ? `\n        <CodiceFiscale>${esc(testo(a.codiceFiscale).toUpperCase())}</CodiceFiscale>`
            : ""
        }
        <Anagrafica>
          <Denominazione>${esc(a.ragioneSociale)}</Denominazione>
        </Anagrafica>
        <RegimeFiscale>${esc(a.regimeFiscale)}</RegimeFiscale>
      </DatiAnagrafici>
${bloccoSede(a)}
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
${idFiscaleCliente}${cfCliente}        <Anagrafica>
${anagraficaCliente}
        </Anagrafica>
      </DatiAnagrafici>
${bloccoSede(c)}
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${f.tipoDocumento}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${dataSdi(f.data)}</Data>
        <Numero>${esc(f.numero)}</Numero>
${datiRitenuta}        <ImportoTotaleDocumento>${fromCents(t.importoTotaleDocumento)}</ImportoTotaleDocumento>${
    testo(f.causale) ? `\n        <Causale>${esc(f.causale)}</Causale>` : ""
  }
      </DatiGeneraliDocumento>
${datiOrdine}${datiDdt ? `${datiDdt}\n` : ""}    </DatiGenerali>
    <DatiBeniServizi>
${linee}
${riepiloghi}
    </DatiBeniServizi>
${pagamento}  </FatturaElettronicaBody>
</p:FatturaElettronica>
`;
}
