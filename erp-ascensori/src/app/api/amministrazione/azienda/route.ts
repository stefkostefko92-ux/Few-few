// В коя фирма работи MASTER — избор и изход. Само MASTER.
//
// Изборът е бисквитка, подписана за потребителя и сесията
// (`contesto-firma.ts`); прилага се в `richiedeSessione`, тоест важи за всеки
// маршрут без той да знае за режима. Всяко влизане и излизане оставя следа В
// ОДИТА НА САМАТА ФИРМА: клиентът вижда, че доставчикът е бил в данните му.

import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { CONTESTO_COOKIE, valoreContesto } from "@/lib/contesto-firma";

const schema = z.object({ tenantId: z.string().uuid().nullable() });

/** Колкото трае работният ден; режимът е и без това вързан за сесията. */
const DURATA_S = 12 * 3600;

export const GET = gestito(async () => {
  const s = await richiedeRuolo("MASTER");
  const aziende = await prisma.tenant.findMany({
    select: { id: true, ragioneSociale: true, slug: true, attivo: true },
    orderBy: { ragioneSociale: "asc" },
  });
  const corrente =
    s.tenantIdProprio !== undefined
      ? (aziende.find((a) => a.id === s.tenantId) ?? null)
      : null;
  return ok({ corrente, aziende });
});

export const POST = gestito(async (req) => {
  const s = await richiedeRuolo("MASTER");
  const { tenantId } = await corpoValidato(req, schema);
  const jar = await cookies();
  const precedente = s.tenantIdProprio !== undefined ? s.tenantId : null;

  if (tenantId === null) {
    jar.delete(CONTESTO_COOKIE);
    if (precedente)
      await scriviAudit({
        azione: "STATE_CHANGE",
        entita: "contesto_azienda",
        entitaId: precedente,
        dettagli: { valori: { contesto: { a: "uscita" } } },
        utenteId: s.sub,
        tenantId: precedente,
      });
    return ok({ corrente: null });
  }

  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, ragioneSociale: true, slug: true, attivo: true },
  });
  if (!t) throw new ErroreHttp(404, "Azienda non trovata");
  if (!s.sid) throw new ErroreHttp(401, "Sessione terminata");
  jar.set(
    CONTESTO_COOKIE,
    valoreContesto(process.env.SESSION_SECRET ?? "", s.sub, s.sid, t.id),
    {
      httpOnly: true,
      // strict: изборът не пътува със заявка, започнала на чужд сайт
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: DURATA_S,
    },
  );
  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "contesto_azienda",
    entitaId: t.id,
    dettagli: { valori: { contesto: { a: "ingresso" } } },
    utenteId: s.sub,
    tenantId: t.id,
  });
  return ok({ corrente: t });
});
