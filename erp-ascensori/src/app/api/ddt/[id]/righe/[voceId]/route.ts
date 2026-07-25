// Редове на DDT — промяна/изтриване. Промяна/изтриване на редица.
import { rottaVoceElemento } from "@/lib/voci";
import { rigaDdtSchema } from "@/lib/entities";

export const { PUT, DELETE } = rottaVoceElemento({
  entita: "righe_ddt",
  model: "rigaDdt",
  parentModel: "ddt",
  parentField: "ddtId",
  schema: rigaDdtSchema.partial(),
});
