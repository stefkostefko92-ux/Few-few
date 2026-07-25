// Reimpostazione password altrui — ADMIN+ (никой не може да ПРОЧЕТЕ парола).
// Нулира и refresh token-а: старите сесии на потребителя падат.

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { filtroUtenti } from "@/lib/tenant";

const schema = z.object({ password: z.string().min(10).max(200) });

export const POST = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("ADMIN");
  const { id } = await ctx.params;
  const { password } = await corpoValidato(req, schema);
  const utente = await prisma.user.findFirst({
    where: { id, ...filtroUtenti(s) },
  });
  if (!utente) throw new ErroreHttp(404, "Utente non trovato");
  if (utente.ruolo === "MASTER" && s.ruolo !== "MASTER")
    throw new ErroreHttp(
      403,
      "Solo il livello MASTER può gestire utenti MASTER",
    );
  await prisma.user.update({
    where: { id },
    data: {
      password: await bcrypt.hash(password, 10),
      refreshToken: null,
      tentativi: 0,
      bloccatoFino: null,
    },
  });
  await scriviAudit({
    azione: "UPDATE",
    entita: "users",
    entitaId: id,
    dettagli: { dopo: "password reimpostata" },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok({ ok: true });
});
