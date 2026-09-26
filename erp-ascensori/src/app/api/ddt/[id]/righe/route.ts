// Редове на DDT — добавяне (без тотали: транспортен документ).
import { rottaVociCollezione } from "@/lib/voci";
import { rigaDdtSchema } from "@/lib/entities";
import { DDT_MODIFICABILE, DDT_BLOCCATO } from "@/lib/regole-fiscali";

export const { POST } = rottaVociCollezione({
  entita: "righe_ddt",
  model: "rigaDdt",
  parentModel: "ddt",
  parentField: "ddtId",
  schema: rigaDdtSchema,
  // DDT, качен на фактура, е замразен — включително по редовете.
  filtroModificabile: DDT_MODIFICABILE,
  messaggioBloccato: DDT_BLOCCATO,
});
