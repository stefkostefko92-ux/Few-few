// Външните ключове от клиента — принадлежат ли на СЪЩАТА фирма.
//
// Защо не стига FK ограничението в базата: то проверява само, че редът
// СЪЩЕСТВУВА, и в Postgres минава покрай RLS. Прегледът намери точно това:
// TECNICO на фирма А праща `PUT /api/ordini/<свой>` с `tecnicoId` на служител
// на фирма Б и отговорът (с `include: { tecnico }`) връща данъчния номер,
// телефона и часовата ставка на чужд служител. С `impiantoId` на чужда уредба
// отчетите на А влизат в официалния libretto на Б.
//
// Затова всеки ключ, който идва от клиента, се проверява по фирмата на сесията
// ПРЕДИ записа. Отговорът е един и същ за „няма го" и „на друга фирма е" —
// иначе самата проверка издава чужди идентификатори.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { Sessione } from "@/lib/auth";
import { ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";

type Db = Prisma.TransactionClient | typeof prisma;

/** Поле от входа → модел, към който сочи. Нов външен ключ = ред тук. */
export const MODELLI_RIFERIMENTO = {
  amministratoreId: "amministratore",
  articoloId: "articoloMagazzino",
  condominioId: "condominio",
  conducenteId: "dipendente",
  cottimistiId: "cottimista",
  ddtId: "ddt",
  ddtIds: "ddt",
  dipendenteId: "dipendente",
  documentoId: "documento",
  impiantiIds: "impianto",
  impiantoId: "impianto",
  ordineLavoroId: "ordineLavoro",
  preventivoId: "preventivo",
  squadraId: "squadra",
  tecnicoId: "dipendente",
} as const;

type Contatore = {
  count(args: { where: Record<string, unknown> }): Promise<number>;
};

/**
 * Отказва (422), ако някой външен ключ във `dati` сочи запис извън фирмата на
 * сесията или несъществуващ запис. Празните стойности (null/undefined/[]) не
 * се проверяват — те махат връзката, не я сочат.
 */
export async function verificaRiferimenti(
  s: Sessione,
  dati: unknown,
  db: Db = prisma,
): Promise<void> {
  if (!dati || typeof dati !== "object") return;
  const campi = dati as Record<string, unknown>;
  for (const [campo, modello] of Object.entries(MODELLI_RIFERIMENTO)) {
    const v = campi[campo];
    const ids = [
      ...new Set(
        (Array.isArray(v) ? v : [v]).filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        ),
      ),
    ];
    if (!ids.length) continue;
    const d = (db as unknown as Record<string, Contatore>)[modello];
    const trovati = await d.count({
      where: { id: { in: ids }, ...filtroTenant(s) },
    });
    if (trovati !== ids.length)
      throw new ErroreHttp(422, `Riferimento non valido: ${campo}`);
  }
}
