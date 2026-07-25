// Управление на ключовете за публичното API. ADMIN+ — ключът дава достъп до
// данните на цялата фирма и раздаването му е решение на администратора.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, gestito, corpoValidato } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { generaChiave, ambitiValidi, AMBITI } from "@/lib/api-pubblica/chiavi";

const schema = z.object({
  etichetta: z.string().trim().min(1).max(100),
  ambiti: z.array(z.enum(AMBITI)).min(1, "Selezionare almeno un ambito"),
  /** Срок в дни; без него ключът е безсрочен и това е съзнателен избор. */
  giorniValidita: z.number().int().min(1).max(3650).optional(),
});

export const GET = gestito(async () => {
  const s = await richiedeRuolo("ADMIN");
  const righe = await prisma.apiKey.findMany({
    where: { ...filtroTenant(s), revocataAt: null },
    // `chiaveHash` НЕ излиза: с него не се влиза, но не е и за пред очите.
    select: {
      id: true,
      prefisso: true,
      etichetta: true,
      ambiti: true,
      ultimoUso: true,
      scadenza: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return ok({ righe, ambitiDisponibili: AMBITI });
});

export const POST = gestito(async (req) => {
  const s = await richiedeRuolo("ADMIN");
  const dati = await corpoValidato(req, schema);
  if (!ambitiValidi(dati.ambiti)) throw new ErroreHttp(400, "Ambiti non validi");

  const k = generaChiave();
  const creata = await prisma.apiKey.create({
    data: {
      prefisso: k.prefisso,
      chiaveHash: k.chiaveHash,
      etichetta: dati.etichetta,
      ambiti: dati.ambiti,
      scadenza: dati.giorniValidita
        ? new Date(Date.now() + dati.giorniValidita * 86_400_000)
        : null,
      creataDaId: s.sub,
      ...tenantDiCreazione(s),
    },
    select: { id: true, prefisso: true, etichetta: true, ambiti: true, scadenza: true },
  });

  await scriviAudit({
    azione: "CREATE",
    entita: "api_keys",
    entitaId: creata.id,
    // Самият ключ НИКОГА не влиза в одита: регистърът се чете от повече хора,
    // отколкото ключът трябва да достигне.
    dettagli: { etichetta: dati.etichetta, ambiti: dati.ambiti },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });

  // Единственият момент, в който ключът съществува в четим вид.
  return ok({ ...creata, chiave: k.chiave, avviso: "Copiare ora: non sarà più visibile." }, 201);
});
