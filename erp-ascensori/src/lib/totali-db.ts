// Преизчисляване на тоталите на preventivo/fattura от редовете.
// Тоталите никога не се пишат на ръка (документация, гл. „Automatismi").
//
// Функциите приемат опционален транзакционен клиент, за да могат да се
// изпълнят В СЪЩАТА транзакция като промяната по реда — иначе редът може да
// се запише, преизчислението да се провали и документът да остане с тотали,
// които не отговарят на редовете си.

import { prisma } from "@/lib/prisma";
import { calcolaTotali, type VoceInput } from "@/lib/totals";
import type { Prisma } from "@prisma/client";

export type ClientePrisma = Prisma.TransactionClient | typeof prisma;

async function ricalcola(
  db: ClientePrisma,
  tipo: "preventivo" | "fattura",
  documentoId: string
): Promise<void> {
  const voci =
    tipo === "preventivo"
      ? await db.vocePreventivo.findMany({
          where: { preventivoId: documentoId },
          orderBy: { ordine: "asc" },
        })
      : await db.voceFattura.findMany({
          where: { fatturaId: documentoId },
          orderBy: { ordine: "asc" },
        });

  const input: VoceInput[] = voci.map((v) => ({
    quantita: v.quantita.toString(),
    prezzoUnitario: v.prezzoUnitario.toString(),
    aliquotaIva: v.aliquotaIva.toString(),
  }));
  const t = calcolaTotali(input);
  const totali = {
    totaleNetto: t.totaleNetto,
    totaleIva: t.totaleIva,
    totaleLordo: t.totaleLordo,
  };

  if (tipo === "preventivo") {
    await Promise.all(
      voci.map((v, i) =>
        db.vocePreventivo.update({ where: { id: v.id }, data: { totale: t.totaliVoci[i] } })
      )
    );
    await db.preventivo.update({ where: { id: documentoId }, data: totali });
  } else {
    await Promise.all(
      voci.map((v, i) =>
        db.voceFattura.update({ where: { id: v.id }, data: { totale: t.totaliVoci[i] } })
      )
    );
    await db.fattura.update({ where: { id: documentoId }, data: totali });
  }
}

export async function ricalcolaPreventivo(
  preventivoId: string,
  db?: ClientePrisma
): Promise<void> {
  if (db) return ricalcola(db, "preventivo", preventivoId);
  await prisma.$transaction((tx) => ricalcola(tx, "preventivo", preventivoId));
}

export async function ricalcolaFattura(fatturaId: string, db?: ClientePrisma): Promise<void> {
  if (db) return ricalcola(db, "fattura", fatturaId);
  await prisma.$transaction((tx) => ricalcola(tx, "fattura", fatturaId));
}
