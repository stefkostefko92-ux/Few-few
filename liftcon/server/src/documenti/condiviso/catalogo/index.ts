// Целият каталог: секциите на огледа (по реда на обхождане на място), документите и категориите работи.
import type { CategoriaLavori, SezioneChecklist, VoceDocumentale } from "../tipi.js";
import { SEZIONI_1 } from "./sopralluogo-1.js";
import { SEZIONI_2 } from "./sopralluogo-2.js";
import { SEZIONI_3 } from "./sopralluogo-3.js";
import { VOCI_DOCUMENTALI } from "./documenti.js";
import { CATEGORIE_LAVORI } from "./lavori.js";

export interface Catalogo {
  sezioni: SezioneChecklist[];
  documenti: VoceDocumentale[];
  lavori: CategoriaLavori[];
}

export const CATALOGO: Catalogo = {
  sezioni: [...SEZIONI_1, ...SEZIONI_2, ...SEZIONI_3],
  documenti: VOCI_DOCUMENTALI,
  lavori: CATEGORIE_LAVORI,
};
