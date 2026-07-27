// Заличаване (чл. 17 GDPR) — на практика АНОНИМИЗАЦИЯ.
//
// GET показва плана, POST го прилага. Разделението не е удобство: операцията е
// необратима, а човекът насреща трябва да види какво точно изчезва и какво
// остава по закон, ПРЕДИ да натисне.

import { z } from "zod";
import { gestito, ok, errore, corpoValidato } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { anonimizza } from "@/lib/gdpr/dati";
import {
  pianoAnonimizzazione,
  TIPI_SOGGETTO,
  type TipoSoggetto,
} from "@/lib/gdpr/piano";

function tipoValido(tipo: string): TipoSoggetto {
  if (!(TIPI_SOGGETTO as readonly string[]).includes(tipo))
    throw new ErroreHttp(400, "Tipo di soggetto non valido");
  return tipo as TipoSoggetto;
}

export const GET = gestito(async (_req, ctx) => {
  await richiedeRuolo("ADMIN");
  const { tipo, id } = (await ctx.params) as { tipo: string; id: string };
  return ok({ piano: pianoAnonimizzazione(tipoValido(tipo), id) });
});

const schema = z.object({
  // Изричното потвърждение е втората брава: една сгрешена заявка иначе трие
  // лице безвъзвратно.
  conferma: z.literal(true),
});

export const POST = gestito(async (req, ctx) => {
  // MASTER-only не става: анонимизацията е задължение на администратора на
  // ДАННИТЕ (клиента), не на доставчика. ADMIN на фирмата отговаря за нея.
  const s = await richiedeRuolo("ADMIN");
  const { tipo, id } = (await ctx.params) as { tipo: string; id: string };
  const t = tipoValido(tipo);
  await corpoValidato(req, schema);

  const esito = await anonimizza(
    t,
    id,
    s.tenantId ?? null,
    s.ruolo === "MASTER",
    {
      sub: s.sub,
      tenantId: s.tenantId ?? null,
    },
  );
  if (!esito) return errore(404, "Soggetto non trovato");
  // Остатъчно поле значи, че някой е добавил лични данни без да обнови плана —
  // а ние вече сме казали на лицето „заличено". Това не бива да мине тихо.
  if (esito.residui.length)
    return errore(
      500,
      `Anonimizzazione incompleta: ${esito.residui.join(", ")}. Contattare l'assistenza.`,
    );
  return ok(esito);
});
