// Смяна на СОБСТВЕНАТА парола — всеки влязъл потребител.
//
// Дотогава само ADMIN+ можеше да сменя пароли (чуждите, през „Utenti"), а
// входът връщаше `passwordScaduta` без място, където човек да я смени сам.
// Иска текущата парола: откраднатата сесия не бива да сменя паролата и да
// заключи собственика навън.

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeSessione, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { validaPassword, mfaObbligatorio } from "@/lib/password-policy";
import { revocaTutte } from "@/lib/sessioni";
import { consenti, LIMITI } from "@/lib/rate-limit";

const schema = z.object({
  attuale: z.string().min(1).max(200),
  nuova: z.string().min(1).max(200),
});

export const POST = gestito(async (req) => {
  const s = await richiedeSessione();
  const { attuale, nuova } = await corpoValidato(req, schema);
  // Същият таван като при изключването на втория фактор: без него сесията
  // налучква текущата парола без край.
  if (!consenti(`password-me:${s.sub}`, 5, LIMITI.finestraMs))
    throw new ErroreHttp(429, "Troppi tentativi: riprovare più tardi.");

  const u = await prisma.user.findUniqueOrThrow({
    where: { id: s.sub },
    select: {
      password: true,
      ruolo: true,
      email: true,
      nome: true,
      cognome: true,
    },
  });
  // 403, не 401: 401 значи „сесията я няма" и интерфейсът води към входа.
  if (!(await bcrypt.compare(attuale, u.password)))
    throw new ErroreHttp(403, "Password attuale non corretta");
  if (attuale === nuova)
    throw new ErroreHttp(400, "La nuova password deve essere diversa");

  const esito = validaPassword(nuova, {
    privilegiata: mfaObbligatorio(u.ruolo),
    email: u.email,
    nome: u.nome,
    cognome: u.cognome,
  });
  if (!esito.valida)
    throw new ErroreHttp(400, esito.errore ?? "Password non valida");

  await prisma.user.update({
    where: { id: s.sub },
    data: {
      password: await bcrypt.hash(nuova, 10),
      passwordCambiataAt: new Date(),
    },
  });
  // Другите устройства падат; това, от което се сменя, остава влязло.
  await revocaTutte(s.sub, s.sid);
  await scriviAudit({
    azione: "UPDATE",
    entita: "users",
    entitaId: s.sub,
    dettagli: { dopo: "password cambiata dall'utente" },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok({ ok: true });
});
