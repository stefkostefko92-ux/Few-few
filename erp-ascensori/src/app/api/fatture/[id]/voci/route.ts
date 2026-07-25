// Редове на fattura — добавяне + автоматично преизчисление на тоталите.
// Икономически документ: писане само от DIREZIONE+, само при BOZZA (фискален архив).
import { rottaVociCollezione } from "@/lib/voci";
import { voceSchema } from "@/lib/entities";
import { ricalcolaFattura } from "@/lib/totali-db";

export const { POST } = rottaVociCollezione({
  entita: "voci_fattura",
  model: "voceFattura",
  parentModel: "fattura",
  parentField: "fatturaId",
  schema: voceSchema.omit({ articoloId: true }),
  ricalcola: ricalcolaFattura,
  ruolo: "DIREZIONE",
  statiModificabili: ["BOZZA"],
});
