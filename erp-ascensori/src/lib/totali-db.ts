// Преизчисляване на тоталите на preventivo/fattura от редовете.
// Тоталите никога не се пишат на ръка (документация, гл. „Automatismi").
//
// Функциите приемат опционален транзакционен клиент, за да могат да се
// изпълнят В СЪЩАТА транзакция като промяната по реда — иначе редът може да
// се запише, преизчислението да се провали и документът да остане с тотали,
// които не отговарят на редовете си.

import { prisma } from "@/lib/prisma";
import {
  calcolaTotali,
  totaliDaRiepilogo,
  toCents,
  fromCents,
  type VoceInput,
} from "@/lib/totals";
import { calcolaRitenuta } from "@/lib/fiscale/ritenuta";
import { importoDaIncassare, statoDaIncassi } from "@/lib/fiscale/pagamenti";
import type { Prisma } from "@prisma/client";

export type ClientePrisma = Prisma.TransactionClient | typeof prisma;

async function ricalcola(
  db: ClientePrisma,
  tipo: "preventivo" | "fattura",
  documentoId: string,
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
  // Редовият тотал си остава на реда; тоталите на ДОКУМЕНТА идват от
  // обобщението по ставка. Разликата е няколко цента, но е точно тази, заради
  // която SDI отказва: `ImportoTotaleDocumento` се сверява с `DatiRiepilogo`,
  // а печатният документ трябва да показва същото число като XML-а.
  const perRiga = calcolaTotali(input);
  const t = totaliDaRiepilogo(input);
  const totali = {
    totaleNetto: t.totaleNetto,
    totaleIva: t.totaleIva,
    totaleLordo: t.totaleLordo,
  };

  if (tipo === "preventivo") {
    await Promise.all(
      voci.map((v, i) =>
        db.vocePreventivo.update({
          where: { id: v.id },
          data: { totale: perRiga.totaliVoci[i] },
        }),
      ),
    );
    await db.preventivo.update({ where: { id: documentoId }, data: totali });
    return;
  }

  await Promise.all(
    voci.map((v, i) =>
      db.voceFattura.update({
        where: { id: v.id },
        data: { totale: perRiga.totaliVoci[i] },
      }),
    ),
  );
  await db.fattura.update({ where: { id: documentoId }, data: totali });
  // Удържането и статусът на плащането зависят от тоталите — затова се смятат
  // веднага след тях, в същата транзакция.
  await ricalcolaPagamenti(documentoId, db);
}

/**
 * Удържаното и статусът на плащането.
 *
 * Изнесено отделно, защото се вика и когато редовете НЕ са се променили — при
 * всяко получено плащане и при всяка смяна на фискалния режим.
 *
 * Сравнението е с очакваното, не с брутото: при удържане и при разцепено
 * плащане фирмата получава по-малко от сумата на фактурата, и това не е
 * недоплащане.
 */
export async function ricalcolaPagamenti(
  fatturaId: string,
  db: ClientePrisma = prisma,
): Promise<void> {
  const f = await db.fattura.findUnique({
    where: { id: fatturaId },
    select: {
      totaleNetto: true,
      totaleIva: true,
      ritenuta: true,
      ritenutaAliquota: true,
      splitPayment: true,
    },
  });
  if (!f) return;

  const imponibile = toCents(f.totaleNetto);
  const imposta = toCents(f.totaleIva);
  const ritenuta = f.ritenuta
    ? calcolaRitenuta(imponibile, imposta, toCents(f.ritenutaAliquota)).importo
    : 0;

  const incassi = await db.pagamento.aggregate({
    where: { fatturaId },
    _sum: { importo: true },
  });
  const incassato = incassi._sum.importo ? toCents(incassi._sum.importo) : 0;
  const atteso = importoDaIncassare({
    imponibile,
    imposta,
    ritenuta,
    splitPayment: f.splitPayment,
  });

  await db.fattura.update({
    where: { id: fatturaId },
    data: {
      ritenutaImporto: fromCents(ritenuta),
      totalePagato: fromCents(incassato),
      statoPagamento: statoDaIncassi(atteso, incassato),
    },
  });
}

export async function ricalcolaPreventivo(
  preventivoId: string,
  db?: ClientePrisma,
): Promise<void> {
  if (db) return ricalcola(db, "preventivo", preventivoId);
  await prisma.$transaction((tx) => ricalcola(tx, "preventivo", preventivoId));
}

export async function ricalcolaFattura(
  fatturaId: string,
  db?: ClientePrisma,
): Promise<void> {
  if (db) return ricalcola(db, "fattura", fatturaId);
  await prisma.$transaction((tx) => ricalcola(tx, "fattura", fatturaId));
}
