// Сглобяването на документа от данните (спецификация D5–D6): чисти функции, едни и същи в браузъра
// (прегледът офлайн) и на сървъра (PDF). Резултатът са секции от прости блокове, които PDF-ът и прегледът рисуват.
import type { DocumentoCompleto } from "./tipi.js";
import type { CatalogoDocumenti, Composto } from "./composto.js";
import { componiSopralluogo } from "./componi-sopralluogo.js";
import { componiControllo, componiEsame, componiVerbale } from "./componi-altri.js";

export type { Blocco, CatalogoDocumenti, Composto, Sezione } from "./composto.js";

export function componi(doc: DocumentoCompleto, cat: CatalogoDocumenti): Composto {
  switch (doc.tipo) {
    case "SOPRALLUOGO":
      return componiSopralluogo(doc as DocumentoCompleto<"SOPRALLUOGO">, cat);
    case "CONTROLLO_QUALITA":
      return componiControllo(doc as DocumentoCompleto<"CONTROLLO_QUALITA">);
    case "ESAME_DOCUMENTALE":
      return componiEsame(doc as DocumentoCompleto<"ESAME_DOCUMENTALE">);
    case "VERBALE":
      return componiVerbale(doc as DocumentoCompleto<"VERBALE">);
  }
}
