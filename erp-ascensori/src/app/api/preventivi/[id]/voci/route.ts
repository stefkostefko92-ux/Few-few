// Редове на preventivo — добавяне + автоматично преизчисление на тоталите.
// Променими докато офертата не е финализирана (BOZZA/INVIATO).
import { rottaVociCollezione } from "@/lib/voci";
import { voceSchema } from "@/lib/entities";
import { ricalcolaPreventivo } from "@/lib/totali-db";

export const { POST } = rottaVociCollezione({
  entita: "voci_preventivo",
  model: "vocePreventivo",
  parentModel: "preventivo",
  parentField: "preventivoId",
  schema: voceSchema,
  ricalcola: ricalcolaPreventivo,
  statiModificabili: ["BOZZA", "INVIATO"],
});
