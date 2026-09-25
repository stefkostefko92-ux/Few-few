// Потребител: промяна (ADMIN), окончателно изтриване — САМО MASTER (документация).
// Спиране/пускане = PUT { attivo }: блокира достъпа без загуба на историята.

import { dettagliModifica } from "@/lib/audit-dettagli";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { RUOLI } from "@/lib/roles";
import { filtroUtenti } from "@/lib/tenant";
import { revocaTutte } from "@/lib/sessioni";
import { mfaObbligatorio } from "@/lib/password-policy";

const SELEZIONE_SICURA = {
  id: true,
  email: true,
  nome: true,
  cognome: true,
  ruolo: true,
  attivo: true,
  tentativi: true,
  bloccatoFino: true,
  totpAttivo: true,
  aiConsentita: true,
  ultimoAccesso: true,
  tenantId: true,
  createdAt: true,
} as const;

const schemaUpdate = z.object({
  // Минуски — както при създаването: входът търси без оглед на регистъра.
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  nome: z.string().trim().min(1).max(100).optional(),
  cognome: z.string().trim().min(1).max(100).optional(),
  ruolo: z.enum(RUOLI).optional(),
  attivo: z.boolean().optional(),
  /** ИИ асистентът за ТОЗИ акаунт (`politica.ts`, ключ 5). */
  aiConsentita: z.boolean().optional(),
  tenantId: z.string().uuid().nullish(),
});

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("ADMIN");
  const { id } = await ctx.params;
  // `findFirst` с обхват по фирма — `findUnique` не приема допълнително условие
  const r = await prisma.user.findFirst({
    where: { id, ...filtroUtenti(s) },
    select: SELEZIONE_SICURA,
  });
  if (!r) throw new ErroreHttp(404, "Utente non trovato");
  return ok(r);
});

export const PUT = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("ADMIN");
  const { id } = await ctx.params;
  const data = await corpoValidato(req, schemaUpdate);
  const prima = await prisma.user.findFirst({
    where: { id, ...filtroUtenti(s) },
  });
  if (!prima) throw new ErroreHttp(404, "Utente non trovato");
  // само MASTER може да пипа друг MASTER или да дава ролята MASTER
  if (
    (prima.ruolo === "MASTER" || data.ruolo === "MASTER") &&
    s.ruolo !== "MASTER"
  )
    throw new ErroreHttp(
      403,
      "Solo il livello MASTER può gestire utenti MASTER",
    );
  // и само MASTER мести потребител между фирми
  if (
    s.ruolo !== "MASTER" &&
    data.tenantId !== undefined &&
    data.tenantId !== s.tenantId
  )
    throw new ErroreHttp(
      403,
      "Impossibile assegnare l'utente a un'altra azienda",
    );
  // Имейлът е входът: сменен на друг администратор, той е превземане на
  // акаунта — затова, както паролата и вторият фактор, само от MASTER.
  if (
    data.email !== undefined &&
    data.email !== prima.email &&
    id !== s.sub &&
    mfaObbligatorio(prima.ruolo) &&
    s.ruolo !== "MASTER"
  )
    throw new ErroreHttp(
      403,
      "Solo il livello MASTER può intervenire sulla sicurezza di un amministratore",
    );
  // Собственият акаунт не се спира и не се понижава оттук: последният
  // администратор на фирмата би се заключил навън без път обратно.
  if (
    id === s.sub &&
    (data.attivo === false || (data.ruolo && data.ruolo !== prima.ruolo))
  )
    throw new ErroreHttp(
      409,
      "Impossibile disattivare o cambiare il livello del proprio account",
    );
  const dopo = await prisma.user.update({
    where: { id },
    data: {
      ...data,
      tenantId: data.tenantId === undefined ? undefined : data.tenantId,
      // деактивиране → сесиите падат веднага
      ...(data.attivo === false ? { refreshToken: null } : {}),
    },
    select: SELEZIONE_SICURA,
  });
  // Спрян акаунт → живите сесии падат (и refresh-ът с тях). Сменено ниво не
  // иска това: ролята се чете от базата на всяка заявка.
  if (data.attivo === false) await revocaTutte(id);
  await scriviAudit({
    azione: "UPDATE",
    entita: "users",
    entitaId: id,
    // Имената на сменените полета + стойностите от белия списък (роля,
    // активност) — не и имената и имейлите: неизменимият регистър живее години.
    dettagli: dettagliModifica(prima, { ...prima, ...data }),
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(dopo);
});

export const DELETE = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("MASTER");
  const { id } = await ctx.params;
  if (id === s.sub)
    throw new ErroreHttp(409, "Impossibile eliminare il proprio account");
  const prima = await prisma.user.findFirst({
    where: { id, ...filtroUtenti(s) },
  });
  if (!prima) throw new ErroreHttp(404, "Utente non trovato");
  await prisma.user.delete({ where: { id } });
  await scriviAudit({
    azione: "DELETE",
    entita: "users",
    entitaId: id,
    // Без имейла — виж създаването: регистърът не бива да пази лични стойности.
    dettagli: { prima: { ruolo: prima.ruolo } },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok({ ok: true });
});
