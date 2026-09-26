// Кой колко дължи и от колко време.
//
// Отделен поглед, а не филтър върху списъка с фактури: „кои са неплатени" и
// „колко пари чакам и откога" са различни въпроси. Вторият се отговаря с
// възрастови кофи, защото просрочие от седмица и просрочие от година не са
// едно и също — първото е разсеяност, второто е загуба, която още не е
// призната.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { fromCents } from "@/lib/totals";
import { residuoFattura } from "@/lib/fiscale/pagamenti";
import {
  componiScadenzario,
  totaliPerFascia,
  perDebitore,
  livelloSuggerito,
  type Credito,
} from "@/lib/fiscale/scadenzario";

export const dynamic = "force-dynamic";

export const GET = gestito(async () => {
  // Кой колко дължи е икономическа информация — от ниво „ръководство" нагоре,
  // както и останалите пари в продукта.
  const s = await richiedeRuolo("DIREZIONE");

  const fatture = await prisma.fattura.findMany({
    where: {
      ...filtroTenant(s),
      tipo: "EMESSA",
      // Черновата не е вземане; сторнираната е отменена. Включването им би
      // напълнило отчета с пари, които никой не дължи.
      stato: { notIn: ["BOZZA", "STORNATA"] },
      statoPagamento: { not: "PAGATA" },
    },
    select: {
      id: true,
      numero: true,
      data: true,
      dataScadenza: true,
      totaleNetto: true,
      totaleIva: true,
      ritenutaImporto: true,
      splitPayment: true,
      condominioId: true,
      amministratoreId: true,
      condominio: { select: { nome: true } },
      amministratore: {
        select: { ragioneSociale: true, nome: true, cognome: true },
      },
      pagamenti: { select: { importo: true } },
      solleciti: { select: { livello: true }, orderBy: { livello: "desc" } },
    },
    take: 2_000,
  });

  const crediti: Credito[] = [];
  const sollecitiPerFattura = new Map<string, number>();

  for (const f of fatture) {
    // Дължимото НЕ е брутото: удържането по чл. 25-ter плаща получателят на
    // данъчната администрация, а при split payment ДДС-то също не минава през
    // нас. Търсенето на брутото е искане на пари, които никой не ни дължи.
    const res = residuoFattura(f);
    if (res <= 0) continue;

    const debitoreId = f.condominioId ?? f.amministratoreId ?? "senza";
    const debitore =
      f.condominio?.nome ??
      f.amministratore?.ragioneSociale ??
      [f.amministratore?.nome, f.amministratore?.cognome]
        .filter(Boolean)
        .join(" ") ??
      "—";

    sollecitiPerFattura.set(f.id, f.solleciti[0]?.livello ?? 0);
    crediti.push({
      fatturaId: f.id,
      numero: f.numero,
      data: f.data,
      dataScadenza: f.dataScadenza,
      residuoCentesimi: res,
      debitoreId,
      debitore: debitore || "—",
    });
  }

  const oggi = new Date();
  const righe = componiScadenzario(crediti, oggi);

  return ok({
    righe: righe.map((r) => {
      const giaInviati = sollecitiPerFattura.get(r.fatturaId) ?? 0;
      return {
        ...r,
        residuo: fromCents(r.residuoCentesimi),
        data: r.data,
        dataScadenza: r.dataScadenza,
        sollecitiInviati: giaInviati,
        // Предложение за ДЕЙСТВИЕ. `null` значи „сега не прави нищо" — и това е
        // по-полезно от бутон, който винаги свети.
        prossimoSollecito: livelloSuggerito(r.giorniRitardo, giaInviati),
      };
    }),
    fasce: totaliPerFascia(righe).map((f) => ({
      ...f,
      totale: fromCents(f.centesimi),
    })),
    debitori: perDebitore(righe).map((d) => ({
      ...d,
      totale: fromCents(d.centesimi),
    })),
    totale: fromCents(righe.reduce((s2, r) => s2 + r.residuoCentesimi, 0)),
  });
});
