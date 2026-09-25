// Текущата сесия — за интерфейса (име, роля, втори фактор). 401 при липса.
//
// Нарочно с `richiedeSessione`, не с `richiedeRuolo`: потребител, който дължи
// втори фактор, трябва да може да прочете точно това — че го дължи.
import { ok, gestito } from "@/lib/api";
import { richiedeSessione } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  mfaObbligatorio,
  accessoBloccatoSenzaMfa,
} from "@/lib/password-policy";

export const GET = gestito(async () => {
  const s = await richiedeSessione();
  const u = await prisma.user.findUnique({
    where: { id: s.sub },
    select: { ruolo: true, totpAttivo: true },
  });
  // Фирмата, в която MASTER работи — за лентата отгоре на всяка страница.
  const azienda =
    s.tenantIdProprio !== undefined && s.tenantId
      ? await prisma.tenant.findUnique({
          where: { id: s.tenantId },
          select: { id: true, ragioneSociale: true },
        })
      : null;
  const ruolo = u?.ruolo ?? s.ruolo;
  const totpAttivo = Boolean(u?.totpAttivo);
  return ok({
    id: s.sub,
    nome: s.nome,
    ruolo,
    totpAttivo,
    mfaObbligatoria: mfaObbligatorio(ruolo),
    /** Дължи ли го СЕГА: интерфейсът води към „Sicurezza", докато е вярно. */
    mfaRichiesto: accessoBloccatoSenzaMfa(ruolo, totpAttivo),
    aziendaContesto: azienda,
  });
});
