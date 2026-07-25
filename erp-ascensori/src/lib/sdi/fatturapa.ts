// FatturaPA 1.2.2 — XML-ът, който Sistema di Interscambio приема.
//
// Защо това не е „още един експорт": от 2024 г. електронната фактура през SDI е
// задължителна за всички титуляри на P.IVA, а фактура ИЗВЪН SDI се третира като
// НЕИЗДАДЕНА (чл. 6 D.Lgs. 471/1997 — санкцията е върху неиздадената фактура,
// не върху формата). Дотук продуктът правеше PDF; PDF не е фактура.
//
// Модулът е ЧИСТ: вход — обикновени данни, изход — низ. Така реквизитите носят
// тестове, а не коментари, и правилата се четат на едно място.

import { riepilogoIva, totaleVoce, toCents, fromCents, type VoceInput } from "@/lib/totals";

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
}

export interface RigaSdi extends VoceInput {
  descrizione: string;
  naturaIva?: string | null;
}

export interface FatturaSdi {
  numero: string;
  data: Date;
  dataScadenza?: Date | null;
  /** TD01 = fattura · TD04 = nota di credito (сторно). */
  tipoDocumento: "TD01" | "TD04";
  causale?: string | null;
  azienda: AziendaSdi;
  cliente: ClienteSdi;
  righe: RigaSdi[];
  /** Пореден номер на подаването — влиза и в името на файла. */
  progressivoInvio: string;
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
  return testo(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Контролните знаци са невалидни в XML 1.0 ДОРИ екранирани — един залепен
    // при копи-пейст знак прави целия документ неразбираем за парсера.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
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

/**
 * Реквизитите, които липсват. Празен списък = документът може да тръгне.
 *
 * Съобщенията са на ИТАЛИАНСКИ и сочат КЪДЕ се поправя: администраторът, който
 * ги чете, не е този, който е писал кода. Проверката е предварителна — SDI
 * връща отказ чак след дни, а до тогава фактурата се счита за неиздадена.
 */
export function validaPerSdi(f: FatturaSdi): string[] {
  const problemi: string[] = [];
  const a = f.azienda;
  const c = f.cliente;

  if (!testo(a.ragioneSociale)) problemi.push("Impostazioni: manca la ragione sociale.");
  if (!RE_PIVA.test(testo(a.partitaIva)))
    problemi.push("Impostazioni: la partita IVA deve essere di 11 cifre.");
  if (!testo(a.indirizzo) || !testo(a.citta))
    problemi.push("Impostazioni: manca l'indirizzo della sede (indirizzo e comune).");
  if (!RE_CAP.test(testo(a.cap))) problemi.push("Impostazioni: il CAP deve essere di 5 cifre.");
  if (!RE_PROVINCIA.test(testo(a.provincia).toUpperCase()))
    problemi.push("Impostazioni: la provincia deve essere la sigla di 2 lettere (es. MI).");
  if (!/^RF\d{2}$/.test(testo(a.regimeFiscale)))
    problemi.push("Impostazioni: regime fiscale non valido (es. RF01).");

  if (!testo(c.denominazione) && !(testo(c.nome) && testo(c.cognome)))
    problemi.push("Cliente: manca la denominazione (o nome e cognome).");
  if (!RE_PIVA.test(testo(c.partitaIva)) && !testo(c.codiceFiscale))
    problemi.push("Cliente: serve la partita IVA o il codice fiscale.");
  if (!testo(c.indirizzo) || !testo(c.citta))
    problemi.push("Cliente: manca l'indirizzo (indirizzo e comune).");
  if (!RE_CAP.test(testo(c.cap))) problemi.push("Cliente: il CAP deve essere di 5 cifre.");
  if (!RE_PROVINCIA.test(testo(c.provincia).toUpperCase()))
    problemi.push("Cliente: la provincia deve essere la sigla di 2 lettere (es. RM).");
  // Без адрес за доставка документът се приема, но не стига до клиента.
  const codice = testo(c.codiceSdi) || CODICE_SDI_GENERICO;
  if (!RE_CODICE_SDI.test(codice.toUpperCase()))
    problemi.push("Cliente: codice destinatario non valido (6 o 7 caratteri).");
  if (codice === CODICE_SDI_GENERICO && !testo(c.pec))
    problemi.push(
      "Cliente: senza codice destinatario serve la PEC, altrimenti la fattura resta nel cassetto fiscale.",
    );

  if (!testo(f.numero)) problemi.push("Fattura: manca il numero.");
  if (testo(f.numero).length > 20) problemi.push("Fattura: il numero supera i 20 caratteri.");
  if (f.righe.length === 0) problemi.push("Fattura: nessuna riga da fatturare.");

  f.righe.forEach((r, i) => {
    if (!testo(r.descrizione)) problemi.push(`Riga ${i + 1}: manca la descrizione.`);
    const aliquota = toCents(r.aliquotaIva);
    const natura = testo(r.naturaIva).toUpperCase();
    if (aliquota === 0 && !natura)
      problemi.push(
        `Riga ${i + 1}: con aliquota 0 % è obbligatoria la natura (N1…N7): senza, l'esenzione non è dichiarata.`,
      );
    if (aliquota > 0 && natura)
      problemi.push(`Riga ${i + 1}: la natura si indica solo con aliquota 0 %.`);
    if (natura && !RE_NATURA.test(natura)) problemi.push(`Riga ${i + 1}: natura «${natura}» non valida.`);
  });

  return problemi;
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
  return Math.max(0, Math.floor(n)).toString(36).toUpperCase().padStart(5, "0").slice(-5);
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
  const imponibile = riepilogo.reduce((s, r) => s + toCents(r.imponibile), 0);
  const imposta = riepilogo.reduce((s, r) => s + toCents(r.imposta), 0);

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
            nat ? `\n          <Natura>${esc(nat)}</Natura>` : ""
          }
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
          <EsigibilitaIVA>I</EsigibilitaIVA>
        </DatiRiepilogo>`;
    })
    .join("\n");

  const anagraficaCliente =
    c.persona && testo(c.nome) && testo(c.cognome)
      ? `          <Nome>${esc(c.nome)}</Nome>
          <Cognome>${esc(c.cognome)}</Cognome>`
      : `          <Denominazione>${esc(c.denominazione)}</Denominazione>`;

  const idFiscaleCliente = RE_PIVA.test(testo(c.partitaIva))
    ? `        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${esc(c.partitaIva)}</IdCodice>
        </IdFiscaleIVA>\n`
    : "";
  const cfCliente = testo(c.codiceFiscale)
    ? `        <CodiceFiscale>${esc(testo(c.codiceFiscale).toUpperCase())}</CodiceFiscale>\n`
    : "";

  const pagamento = testo(a.iban)
    ? `      <DatiPagamento>
        <CondizioniPagamento>TP02</CondizioniPagamento>
        <DettaglioPagamento>
          <ModalitaPagamento>MP05</ModalitaPagamento>${
            f.dataScadenza
              ? `\n          <DataScadenzaPagamento>${dataSdi(f.dataScadenza)}</DataScadenzaPagamento>`
              : ""
          }
          <ImportoPagamento>${fromCents(imponibile + imposta)}</ImportoPagamento>
          <IBAN>${esc(testo(a.iban).toUpperCase().replace(/\s+/g, ""))}</IBAN>
        </DettaglioPagamento>
      </DatiPagamento>\n`
    : "";

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
        <ImportoTotaleDocumento>${fromCents(imponibile + imposta)}</ImportoTotaleDocumento>${
          testo(f.causale) ? `\n        <Causale>${esc(f.causale)}</Causale>` : ""
        }
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
${linee}
${riepiloghi}
    </DatiBeniServizi>
${pagamento}  </FatturaElettronicaBody>
</p:FatturaElettronica>
`;
}
