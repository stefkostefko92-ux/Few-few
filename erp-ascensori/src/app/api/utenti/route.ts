// Потребители: списък + създаване — само ADMIN+ (гл. Operazioni riservate).
// Паролата никога не напуска сървъра; hash bcrypt 10 rounds.

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { RUOLI } from "@/lib/roles";

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
  password: z.string().min(10).max(200),
  nome: z.string().trim().min(1).max(100),
  cognome: z.string().trim().min(1).max(100),
  ruolo: z.enum(RUOLI).optional(),
  tenantId: z.string().uuid().nullish(),
});

export const GET = gestito(async (req) => {
  await richiedeRuolo("ADMIN");
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const righe = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { nome: { contains: q, mode: "insensitive" } },
            { cognome: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: SELEZIONE_SICURA,
    orderBy: { cognome: "asc" },
  });
  return ok({ righe, totale: righe.length });
});

export const POST = gestito(async (req) => {
  const s = await richiedeRuolo("ADMIN");
  const data = await corpoValidato(req, schemaCreate);
  const creato = await prisma.user.create({
    data: {
      email: data.email,
      password: await bcrypt.hash(data.password, 10),
      nome: data.nome,
      cognome: data.cognome,
      ruolo: data.ruolo ?? "OPERATORE",
      tenantId: data.tenantId ?? undefined,
    },
    select: SELEZIONE_SICURA,
  });
  await scriviAudit({
    azione: "CREATE",
    entita: "users",
    entitaId: creato.id,
    dettagli: { dopo: { email: data.email, ruolo: data.ruolo ?? "OPERATORE" } },
    utenteId: s.sub,
  });
  return ok(creato, 201);
});
