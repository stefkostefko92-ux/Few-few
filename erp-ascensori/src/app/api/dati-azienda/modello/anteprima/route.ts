// Преглед на шаблона: PDF с ИЗМИСЛЕН получател и редове върху истинските
// данни на фирмата и шаблона от тялото (още НЕзаписан). Нищо не се записва,
// нищо не се номерира. ADMIN+ — същото ниво като записа на шаблона.

import { z } from "zod";
import { errore, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { consenti } from "@/lib/rate-limit";
import { datiStampa } from "@/lib/pdf/carica";
import { generaPdf } from "@/lib/pdf/documento";
import { generaLibretto } from "@/lib/pdf/libretto";
import { documentoEsempio, librettoEsempio } from "@/lib/pdf/esempio";
import {
  TIPI_DOCUMENTO,
  leggiModello,
  schemaModelloIngresso,
} from "@/lib/pdf/modello";
import { rispostaPdf } from "@/lib/pdf/risposta";

export const runtime = "nodejs";

const schema = z.object({
  tipo: z.enum(TIPI_DOCUMENTO),
  modello: schemaModelloIngresso,
});

export const POST = gestito(async (req) => {
  const s = await richiedeRuolo("ADMIN");
  // Всяко натискане е цял PDF — таванът пази процесора, не данните.
  if (!consenti(`anteprima-modello:${s.sub}`, 30, 60_000))
    return errore(
      429,
      "Troppe anteprime in poco tempo: riprovare tra un minuto.",
    );
  const { tipo, modello: ingresso } = await corpoValidato(req, schema);
  const { azienda } = await datiStampa(s.tenantId ?? null);
  const modello = leggiModello(ingresso);
  const pdf =
    tipo === "libretto"
      ? await generaLibretto(librettoEsempio(azienda, modello))
      : await generaPdf(documentoEsempio(tipo, azienda, modello));
  return rispostaPdf(pdf, `anteprima-${tipo}.pdf`);
});
