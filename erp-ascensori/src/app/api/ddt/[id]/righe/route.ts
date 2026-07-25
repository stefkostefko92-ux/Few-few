// Редове на DDT — добавяне (без тотали: транспортен документ).
import { rottaVociCollezione } from "@/lib/voci";
import { rigaDdtSchema } from "@/lib/entities";

export const { POST } = rottaVociCollezione({
  entita: "righe_ddt",
  model: "rigaDdt",
  parentModel: "ddt",
  parentField: "ddtId",
  schema: rigaDdtSchema,
});
