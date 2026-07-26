// Потребители: списък + създаване — само ADMIN+ (гл. Operazioni riservate).
// Паролата никога не напуска сървъра; hash bcrypt 10 rounds.

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { RUOLI } from "@/lib/roles";
import { filtroUtenti } from "@/lib/tenant";
import { validaPassword, mfaObbligatorio } from "@/lib/password-policy";

const SELEZIONE_SICURA = {
  id: true,
  email: true,
  nome: true,
  cognome: true,
  ruolo: true,
  attivo: true,
  tentativi: true,
  bloccatoFino: true,
  ultimoAccesso: true,
  tenantId: true,
  createdAt: true,
} as const;

const schemaCreate = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
  nome: z.string().trim().min(1).max(100),
  cognome: z.string().trim().min(1).max(100),
  ruolo: z.enum(RUOLI).optional(),
  tenantId: z.string().uuid().nullish(),
});

export const GET = gestito(async (req) => {
  const s = await richiedeRuolo("ADMIN");
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const righe = await prisma.user.findMany({
    where: {
      ...filtroUtenti(s),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { nome: { contains: q, mode: "insensitive" } },
              { cognome: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: SELEZIONE_SICURA,
    orderBy: { cognome: "asc" },
  });
  return ok({ righe, totale: righe.length });
});

export const POST = gestito(async (req) => {
  const s = await richiedeRuolo("ADMIN");
  const data = await corpoValidato(req, schemaCreate);
  // Същата защита както при PUT: иначе ADMIN си създава MASTER акаунт с парола
  // по свой избор и влиза с него — пълна ескалация, която заобикаля и
  // „изтриване на потребител = само MASTER".
  if (data.ruolo === "MASTER" && s.ruolo !== "MASTER")
    throw new ErroreHttp(
      403,
      "Solo il livello MASTER può gestire utenti MASTER",
    );
  // Само MASTER присвоява фирма свободно. ADMIN създава ЕДИНСТВЕНО в своята —
  // иначе си слага потребител в чужда фирма и оттам чете всичките ѝ данни.
  const tenantId =
    s.ruolo === "MASTER"
      ? (data.tenantId ?? undefined)
      : (s.tenantId ?? undefined);
  if (
    s.ruolo !== "MASTER" &&
    data.tenantId !== undefined &&
    data.tenantId !== s.tenantId
  )
    throw new ErroreHttp(
      403,
      "Impossibile assegnare l'utente a un'altra azienda",
    );
  // Политиката е тук, а не в Zod: зависи от РОЛЯТА и от собствените данни на
  // потребителя, които схемата не вижда.
  const esitoPwd = validaPassword(data.password, {
    privilegiata: mfaObbligatorio(data.ruolo ?? "OPERATORE"),
    email: data.email,
    nome: data.nome,
    cognome: data.cognome,
  });
  if (!esitoPwd.valida)
    throw new ErroreHttp(400, esitoPwd.errore ?? "Password non valida");

  const creato = await prisma.user.create({
    data: {
      email: data.email,
      password: await bcrypt.hash(data.password, 10),
      nome: data.nome,
      cognome: data.cognome,
      ruolo: data.ruolo ?? "OPERATORE",
      tenantId,
      passwordCambiataAt: new Date(),
    },
    select: SELEZIONE_SICURA,
  });
  await scriviAudit({
    azione: "CREATE",
    entita: "users",
    entitaId: creato.id,
    dettagli: { dopo: { email: data.email, ruolo: data.ruolo ?? "OPERATORE" } },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(creato, 201);
});
