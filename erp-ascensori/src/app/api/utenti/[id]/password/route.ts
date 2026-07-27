// Reimpostazione password altrui — ADMIN+ (никой не може да ПРОЧЕТЕ парола).
// Нулира и refresh token-а: старите сесии на потребителя падат.

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { filtroUtenti } from "@/lib/tenant";
import { validaPassword, mfaObbligatorio } from "@/lib/password-policy";
import { revocaTutte } from "@/lib/sessioni";

const schema = z.object({ password: z.string().min(1).max(200) });

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

  // Политиката е ТУК, а не в Zod: зависи от ролята и от собствените данни на
  // потребителя, които схемата не вижда.
  const esito = validaPassword(password, {
    privilegiata: mfaObbligatorio(utente.ruolo),
    email: utente.email,
    nome: utente.nome,
    cognome: utente.cognome,
  });
  if (!esito.valida)
    throw new ErroreHttp(400, esito.errore ?? "Password non valida");

  await prisma.user.update({
    where: { id },
    data: {
      password: await bcrypt.hash(password, 10),
      refreshToken: null,
      tentativi: 0,
      bloccatoFino: null,
      passwordCambiataAt: new Date(),
    },
  });
  // Смяната на парола сваля всички устройства: това е смисълът ѝ, когато е
  // направена, защото старата е компрометирана.
  await revocaTutte(id);
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
