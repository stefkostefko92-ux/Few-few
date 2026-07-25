// Редове на preventivo — промяна/изтриване + преизчисление.
import { rottaVoceElemento } from "@/lib/voci";
import { voceSchema } from "@/lib/entities";
import { ricalcolaPreventivo } from "@/lib/totali-db";

export const { PUT, DELETE } = rottaVoceElemento({
  entita: "voci_preventivo",
  model: "vocePreventivo",
  parentModel: "preventivo",
  parentField: "preventivoId",
  schema: voceSchema.partial(),
  ricalcola: ricalcolaPreventivo,
});
