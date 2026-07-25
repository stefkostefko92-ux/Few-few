// Преизчисляване на тоталите на preventivo/fattura от редовете — в транзакция.
// Тоталите никога не се пишат на ръка (документация, гл. „Automatismi").

import { prisma } from "@/lib/prisma";
import { calcolaTotali, type VoceInput } from "@/lib/totals";

export async function ricalcolaPreventivo(preventivoId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const voci = await tx.vocePreventivo.findMany({
      where: { preventivoId },
      orderBy: { ordine: "asc" },
    });
    const input: VoceInput[] = voci.map((v) => ({
      quantita: v.quantita.toString(),
      prezzoUnitario: v.prezzoUnitario.toString(),
      aliquotaIva: v.aliquotaIva.toString(),
    }));
    const t = calcolaTotali(input);
    await Promise.all(
      voci.map((v, i) =>
        tx.vocePreventivo.update({ where: { id: v.id }, data: { totale: t.totaliVoci[i] } })
      )
    );
    await tx.preventivo.update({
      where: { id: preventivoId },
      data: { totaleNetto: t.totaleNetto, totaleIva: t.totaleIva, totaleLordo: t.totaleLordo },
    });
  });
}

export async function ricalcolaFattura(fatturaId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const voci = await tx.voceFattura.findMany({
      where: { fatturaId },
      orderBy: { ordine: "asc" },
    });
    const input: VoceInput[] = voci.map((v) => ({
      quantita: v.quantita.toString(),
      prezzoUnitario: v.prezzoUnitario.toString(),
      aliquotaIva: v.aliquotaIva.toString(),
    }));
    const t = calcolaTotali(input);
    await Promise.all(
      voci.map((v, i) =>
        tx.voceFattura.update({ where: { id: v.id }, data: { totale: t.totaliVoci[i] } })
      )
    );
    await tx.fattura.update({
      where: { id: fatturaId },
      data: { totaleNetto: t.totaleNetto, totaleIva: t.totaleIva, totaleLordo: t.totaleLordo },
    });
  });
}
