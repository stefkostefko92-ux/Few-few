// Търсене на субект на лични данни.
//
// Отделен маршрут, а не филтър върху списъците: правата по чл. 15–17 се
// упражняват върху ЛИЦЕ, което може да е потребител, служител ИЛИ клиент, и
// служителят, който отговаря на искането, не бива да обхожда три модула, за да
// разбере къде е записано.

import { gestito, ok } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { testoParam } from "@/lib/query";
import { cercaSoggetti } from "@/lib/gdpr/dati";

export const GET = gestito(async (req) => {
  const s = await richiedeRuolo("ADMIN");
  const q = testoParam(new URL(req.url));
  if (!q || q.length < 2) return ok({ righe: [] });
  return ok({
    righe: await cercaSoggetti(q, s.tenantId ?? null, s.ruolo === "MASTER"),
  });
});
