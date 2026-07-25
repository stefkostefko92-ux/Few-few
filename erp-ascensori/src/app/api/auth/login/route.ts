// Вход: bcrypt проверка, брояч на неуспехите (5 → 15 мин блокада),
// rate limit по IP, JWT access + refresh token (хеш в базата), audit LOGIN.

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, errore, corpoValidato, gestito } from "@/lib/api";
import { consenti, puliziaSeNecessaria } from "@/lib/rate-limit";
import { eBloccato, registraFallimento, registraSuccesso, BLOCCO_MINUTI } from "@/lib/lockout";
import {
  creaAccessToken,
  generaRefreshToken,
  scriviCookieSessione,
  type Sessione,
} from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import type { Ruolo } from "@/lib/roles";

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export const POST = gestito(async (req) => {
  puliziaSeNecessaria();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "sconosciuto";
  if (!consenti(`login:${ip}`, 20, 15 * 60_000))
    return errore(429, "Troppe richieste: riprovare più tardi");

  const { email, password } = await corpoValidato(req, schema);
  const utente = await prisma.user.findUnique({ where: { email } });

  // еднакъв отговор при непознат имейл и грешна парола — без изброяване на акаунти
  const rifiuto = () => errore(401, "Credenziali non valide");
  if (!utente || !utente.attivo) {
    // изгаряме bcrypt време и при непознат имейл (timing еднаквост)
    await bcrypt.compare(password, "$2a$10$C6UzMDM.H6dfI/f/IKcEeO7ZBpM1H1v6XG1L6c1J1a1a1a1a1a1a2");
    return rifiuto();
  }

  const ora = new Date();
  if (eBloccato({ tentativi: utente.tentativi, bloccatoFino: utente.bloccatoFino }, ora))
    return errore(423, `Account bloccato per ${BLOCCO_MINUTI} minuti dopo troppi tentativi`);

  const valida = await bcrypt.compare(password, utente.password);
  if (!valida) {
    const esito = registraFallimento(
      { tentativi: utente.tentativi, bloccatoFino: utente.bloccatoFino },
      ora
    );
    await prisma.user.update({
      where: { id: utente.id },
      data: { tentativi: esito.tentativi, bloccatoFino: esito.bloccatoFino },
    });
    if (esito.bloccato)
      return errore(423, `Account bloccato per ${BLOCCO_MINUTI} minuti dopo troppi tentativi`);
    return errore(401, `Credenziali non valide. Tentativi rimasti: ${esito.tentativiRimasti}`);
  }

  // мулти-фирма: неактивна фирма/изтекъл абонамент спират входа
  if (utente.tenantId) {
    const t = await prisma.tenant.findUnique({ where: { id: utente.tenantId } });
    if (!t || !t.attivo) return errore(403, "Azienda disattivata");
    if (t.scadenzaAbbonamento && t.scadenzaAbbonamento < ora)
      return errore(402, "Abbonamento scaduto: contattare l'amministrazione");
  }

  const azzeramento = registraSuccesso();
  const { token: refresh, hash } = generaRefreshToken();
  await prisma.user.update({
    where: { id: utente.id },
    data: { ...azzeramento, ultimoAccesso: ora, refreshToken: hash },
  });

  const sessione: Sessione = {
    sub: utente.id,
    ruolo: utente.ruolo as Ruolo,
    nome: `${utente.nome} ${utente.cognome}`,
    tenantId: utente.tenantId,
  };
  await scriviCookieSessione(await creaAccessToken(sessione), refresh);
  await scriviAudit({ azione: "LOGIN", entita: "users", entitaId: utente.id, utenteId: utente.id });

  return ok({
    id: utente.id,
    nome: utente.nome,
    cognome: utente.cognome,
    ruolo: utente.ruolo,
  });
});
