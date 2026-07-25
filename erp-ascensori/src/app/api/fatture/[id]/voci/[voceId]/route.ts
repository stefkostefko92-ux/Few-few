// Редове на fattura — промяна/изтриване + преизчисление (DIREZIONE+, само BOZZA).
import { rottaVoceElemento } from "@/lib/voci";
import { voceSchema } from "@/lib/entities";
import { ricalcolaFattura } from "@/lib/totali-db";

export const { PUT, DELETE } = rottaVoceElemento({
  entita: "voci_fattura",
  model: "voceFattura",
  parentModel: "fattura",
  parentField: "fatturaId",
  schema: voceSchema.omit({ articoloId: true }).partial(),
  ricalcola: ricalcolaFattura,
  ruolo: "DIREZIONE",
  statiModificabili: ["BOZZA"],
});
