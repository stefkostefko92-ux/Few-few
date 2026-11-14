import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFStream,
  type PDFDocument,
  type PDFObject,
} from 'pdf-lib';
import { rotto, senzaLivelliSpenti, type StatoLivello } from './pdf-livelli-contenuto.js';

/**
 * Слоевете на формуляра (optional content). Формулярите на DMG държат трите езика като слоеве на една и съща
 * страница и само казват „италианският е включен, другите — не“. Четец или принтер, който не чете тази
 * настройка, рисува всичките един върху друг (собственикът, 13 ноември 2026 — „Controlla la modalità di
 * stampa Dmg“: на хартия и на екрана му италианските, френските и английските надписи се застъпваха).
 * Затова от портала излиза лист с ЕДИН език за всички: съдържанието на изключените слоеве се маха от
 * страницата, а самите слоеве — от документа. За четец, който ги е познавал, листът е същият до пиксел
 * (тестът го сверява).
 */

const RIF = (obj: PDFObject | undefined): string | null => (obj instanceof PDFRef ? obj.tag : null);

/** Слоевете, изключени в настройката по подразбиране на документа (`/OCProperties /D`). */
function livelliSpenti(doc: PDFDocument, proprieta: PDFDict): Set<string> {
  const d = proprieta.lookupMaybe(PDFName.of('D'), PDFDict);
  const lista = (dict: PDFDict | undefined, key: string): string[] =>
    (dict?.lookupMaybe(PDFName.of(key), PDFArray)?.asArray() ?? [])
      .map(RIF)
      .filter((tag): tag is string => tag !== null);
  // Състояние, което се сменя само при печат или износ (`/AS`, `/Usage`), не го четем — не се гадае.
  if (d?.has(PDFName.of('AS'))) throw rotto('слоеве с автоматично състояние (/AS)');
  for (const item of proprieta.lookupMaybe(PDFName.of('OCGs'), PDFArray)?.asArray() ?? []) {
    const livello = doc.context.lookup(item);
    if (livello instanceof PDFDict && livello.has(PDFName.of('Usage')))
      throw rotto('слой със свое правило за печат (/Usage)');
  }
  const base = d?.lookupMaybe(PDFName.of('BaseState'), PDFName)?.decodeText() ?? 'ON';
  if (base !== 'OFF') return new Set(lista(d, 'OFF'));
  const accesi = new Set(lista(d, 'ON'));
  return new Set(lista(proprieta, 'OCGs').filter((tag) => !accesi.has(tag)));
}

/** Кои имена от `/Properties` са слоеве и в какво състояние (по страница — преди да се пипне каквото и да е). */
function livelliDi(
  doc: PDFDocument,
  risorse: PDFDict | undefined,
  spenti: Set<string>,
): Map<string, StatoLivello> {
  const livelli = new Map<string, StatoLivello>();
  const props = risorse?.lookupMaybe(PDFName.of('Properties'), PDFDict);
  for (const [name, value] of props?.entries() ?? []) {
    const dict = value instanceof PDFRef ? doc.context.lookup(value) : value;
    const type = dict instanceof PDFDict ? dict.get(PDFName.of('Type')) : undefined;
    if (type === PDFName.of('OCMD')) throw rotto('слой с условие (OCMD)');
    if (type !== PDFName.of('OCG')) continue;
    livelli.set(name.decodeText(), spenti.has(RIF(value) ?? '') ? 'spento' : 'acceso');
  }
  return livelli;
}

function contenutoDi(doc: PDFDocument, contents: PDFStream | PDFArray | undefined): string {
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((item) => doc.context.lookup(item))
      : contents
        ? [contents]
        : [];
  return streams
    .map((stream) => {
      if (!(stream instanceof PDFRawStream)) throw rotto('съдържание, което не е записан поток');
      return Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
    })
    .join('\n');
}

/**
 * Изключен слой извън съдържанието на страниците не знаем как да махнем — спира се, вместо да излезе лист с
 * два езика: `/OC` върху XObject или анотация, изключен слой в ресурсите на друг поток, XObject без свои
 * ресурси (взима тези на страницата). Проверява се, преди да се пише каквото и да е.
 */
function nessunAltroSpento(doc: PDFDocument, spenti: Set<string>): void {
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    if (!dict) continue;
    const oc = dict.get(PDFName.of('OC'));
    const livello = oc ? doc.context.lookup(oc) : undefined;
    const condizione =
      livello instanceof PDFDict && livello.get(PDFName.of('Type')) === PDFName.of('OCMD');
    if (spenti.has(RIF(oc) ?? '') || condizione) throw rotto('изключен слой върху обект (/OC)');
    // Нататък — само потоците със свое съдържание (страниците са речници: тяхното се чисти).
    if (!(obj instanceof PDFStream) || dict.get(PDFName.of('Subtype')) !== PDFName.of('Form'))
      continue;
    const risorse = dict.lookupMaybe(PDFName.of('Resources'), PDFDict);
    if (!risorse) throw rotto('XObject без свои ресурси');
    for (const stato of livelliDi(doc, risorse, spenti).values())
      if (stato === 'spento') throw rotto('изключен слой извън съдържанието на страниците');
  }
}

/**
 * Маха от документа изключените слоеве заедно със съдържанието им и самото деление на слоеве. Връща дали
 * е имало какво да се маха (старите потоци на страниците остават без връзка — `togliOrfani` ги изчиства).
 */
export function togliLivelliSpenti(doc: PDFDocument): boolean {
  const proprieta = doc.catalog.lookupMaybe(PDFName.of('OCProperties'), PDFDict);
  if (!proprieta) return false;
  const spenti = livelliSpenti(doc, proprieta);
  const pagine = doc.getPages().map((page) => {
    const risorse = page.node.Resources();
    return { page, risorse, livelli: livelliDi(doc, risorse, spenti) };
  });
  nessunAltroSpento(doc, spenti);
  // Първо всички страници се четат (ресурсите може да са общи), после се пише.
  for (const { page, livelli } of pagine) {
    if (livelli.size === 0) continue;
    const prima = contenutoDi(doc, page.node.Contents());
    const dopo = senzaLivelliSpenti(prima, (nome) => livelli.get(nome) ?? null);
    if (dopo === prima) continue;
    const stream = doc.context.flateStream(Buffer.from(dopo, 'latin1'));
    page.node.set(PDFName.of('Contents'), doc.context.register(stream));
  }
  for (const { risorse, livelli } of pagine) {
    const props = risorse?.lookupMaybe(PDFName.of('Properties'), PDFDict);
    if (!risorse || !props) continue;
    for (const nome of livelli.keys()) props.delete(PDFName.of(nome));
    if (props.keys().length === 0) risorse.delete(PDFName.of('Properties'));
  }
  doc.catalog.delete(PDFName.of('OCProperties'));
  if (doc.catalog.get(PDFName.of('PageMode')) === PDFName.of('UseOC'))
    doc.catalog.delete(PDFName.of('PageMode'));
  return true;
}
