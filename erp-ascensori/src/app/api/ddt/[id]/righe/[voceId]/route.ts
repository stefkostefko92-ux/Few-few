// Редове на DDT — промяна/изтриване. Промяна/изтриване на редица.
import { rottaVoceElemento } from "@/lib/voci";
import { rigaDdtSchema } from "@/lib/entities";
import { DDT_MODIFICABILE, DDT_BLOCCATO } from "@/lib/regole-fiscali";

export const { PUT, DELETE } = rottaVoceElemento({
  entita: "righe_ddt",
  model: "rigaDdt",
  parentModel: "ddt",
  parentField: "ddtId",
  schema: rigaDdtSchema.partial(),
  // DDT, качен на фактура, е замразен — включително по редовете.
  filtroModificabile: DDT_MODIFICABILE,
  messaggioBloccato: DDT_BLOCCATO,
});
