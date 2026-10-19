// Документ от документ — частта с базата (номер, фирма, одит, тотали).
// Преводът на редовете е чист и тестван в `genera-documenti.ts`.

import { prisma } from "@/lib/prisma";
import { ErroreHttp, type Sessione } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { conNumero, PREFISSI } from "@/lib/numerazione";
import { ricalcolaFattura } from "@/lib/totali-db";
import type { MaterialeUsato, VoceNuova } from "@/lib/genera-documenti";

/** Материалите, вложени в ордина през рапортините му — само на тази фирма. */
export async function materialiDellOrdine(
  s: Sessione,
  ordineId: string,
): Promise<MaterialeUsato[]> {
  const righe = await prisma.materialeRapportino.findMany({
    where: { ...filtroTenant(s), rapportino: { ordineLavoroId: ordineId } },
    select: {
      articoloId: true,
      articolo: {
        select: {
          codice: true,
          nome: true,
          prezzoVendita: true,
          aliquotaIva: true,
        },
      },
      movimento: { select: { quantita: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return righe.map((r) => ({
    articoloId: r.articoloId,
    codice: r.articolo.codice,
    nome: r.articolo.nome,
    quantita: r.movimento.quantita,
    prezzoVendita: r.articolo.prezzoVendita?.toString() ?? null,
    aliquotaIva: r.articolo.aliquotaIva.toString(),
  }));
}

/**
 * Нова фактура в ЧЕРНОВА с готови редове. Черновата е нарочна: тя няма
 * фискално действие, редовете се преглеждат и се издава с „Emessa" — същият
 * път като ръчно създадената, със същите проверки за SdI.
 */
export async function nuovaFatturaBozza(
  s: Sessione,
  dati: {
    oggetto: string;
    condominioId: string | null;
    amministratoreId: string | null;
    ordineLavoroId: string | null;
    preventivoId: string | null;
    contrattoId?: string | null;
  },
  voci: readonly VoceNuova[],
  origine: string,
) {
  // Удържането по чл. 25-ter — по подразбиране, когато кондоминиумът е
  // заместник по данъка (същото правило като при ръчното създаване).
  let ritenuta = false;
  if (dati.condominioId) {
    const cond = await prisma.condominio.findFirst({
      where: { id: dati.condominioId, ...filtroTenant(s) },
      select: { sostitutoImposta: true },
    });
    if (!cond) throw new ErroreHttp(404, "Condominio non trovato");
    ritenuta = cond.sostitutoImposta;
  }
  const creata = await conNumero(
    "fattura",
    PREFISSI.fatturaEmessa,
    s.tenantId,
    (numero) =>
      prisma.$transaction(async (tx) => {
        const f = await tx.fattura.create({
          data: {
            tipo: "EMESSA",
            oggetto: dati.oggetto,
            condominioId: dati.condominioId ?? undefined,
            amministratoreId: dati.amministratoreId ?? undefined,
            ordineLavoroId: dati.ordineLavoroId ?? undefined,
            preventivoId: dati.preventivoId ?? undefined,
            contrattoId: dati.contrattoId ?? undefined,
            ritenuta,
            numero,
            utenteId: s.sub,
            ...tenantDiCreazione(s),
          },
          select: { id: true, numero: true },
        });
        if (voci.length)
          await tx.voceFattura.createMany({
            data: voci.map((v) => ({ ...v, fatturaId: f.id })),
          });
        await ricalcolaFattura(f.id, tx);
        return f;
      }),
  );
  await scriviAudit({
    azione: "CREATE",
    entita: "fatture",
    entitaId: creata.id,
    dettagli: { campi: ["origine"], valori: { origine } },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return creata;
}
