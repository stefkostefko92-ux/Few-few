// Календарът на работата за един месец.
//
// Събира ТРИ вида ангажимент, защото за диспечера те са едно и също: ордини,
// периодични посещения по договор и нормативни проверки. Показани поотделно,
// те карат човека да отваря три екрана и да прави сглобката наум — а точно там
// се раждат двойните насрочвания.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import {
  grigliaMese,
  distribuisci,
  caricoDelGiorno,
  type Impegno,
} from "@/lib/calendario";

export const dynamic = "force-dynamic";

/**
 * Колко посещения на ден е разумно за един техник; `0` изключва проверката.
 *
 * В ПОСЕЩЕНИЯ, НЕ В ЧАСОВЕ: часовете на един ордин се научават от рапортино-то
 * СЛЕД намесата, тоест сутринта не съществуват. Мярка върху несъществуващо
 * число прави ръчката безмълвна, а инсталаторът я открива при клиента.
 */
const CAPACITA = Number(process.env.CAPACITA_INTERVENTI_TECNICO ?? 6);

function intero(v: string | null, predefinito: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : predefinito;
}

export const GET = gestito(async (req) => {
  const s = await richiedeRuolo("TECNICO");
  const url = new URL(req.url);
  const oggi = new Date();
  const anno = intero(url.searchParams.get("anno"), oggi.getFullYear());
  const mese = intero(url.searchParams.get("mese"), oggi.getMonth() + 1);
  // Сгрешен параметър дава 400 с обяснение, не празен календар, който изглежда
  // като „няма работа този месец".
  if (mese < 1 || mese > 12 || anno < 2000 || anno > 2100)
    throw new ErroreHttp(400, "Periodo non valido");

  const giorni = grigliaMese(anno, mese);
  const dal = giorni[0];
  const al = new Date(giorni[giorni.length - 1].getTime() + 86_400_000 - 1);
  const periodo = { gte: dal, lte: al };

  const [ordini, contratti, verifiche] = await Promise.all([
    prisma.ordineLavoro.findMany({
      where: {
        ...filtroTenant(s),
        // Приключените и анулираните не са ангажимент: те само биха запълнили
        // мрежата и биха скрили това, което предстои.
        stato: { notIn: ["CHIUSO", "ANNULLATO"] },
        dataInizio: periodo,
      },
      select: {
        id: true,
        numero: true,
        oggetto: true,
        priorita: true,
        dataInizio: true,
        tecnicoId: true,
        tecnico: { select: { nome: true, cognome: true } },
        impianto: { select: { matricola: true } },
      },
      take: 1_000,
    }),
    prisma.contratto.findMany({
      where: {
        ...filtroTenant(s),
        stato: "ATTIVO",
        prossimaVisita: periodo,
      },
      select: {
        id: true,
        numero: true,
        oggetto: true,
        prossimaVisita: true,
        condominio: { select: { nome: true } },
      },
      take: 1_000,
    }),
    prisma.scadenzaImpianto.findMany({
      where: {
        ...filtroTenant(s),
        completata: false,
        dataScadenza: periodo,
      },
      select: {
        id: true,
        tipo: true,
        dataScadenza: true,
        impianto: { select: { matricola: true } },
      },
      take: 1_000,
    }),
  ]);

  const impegni: Impegno[] = [
    ...ordini.map((o) => ({
      id: o.id,
      data: o.dataInizio!,
      titolo: `${o.numero} · ${o.oggetto}`,
      tecnicoId: o.tecnicoId,
      tecnico: o.tecnico ? `${o.tecnico.nome} ${o.tecnico.cognome}` : null,
      tipo: "ordine" as const,
      priorita: o.priorita,
      impianto: o.impianto?.matricola ?? null,
    })),
    ...contratti.map((c) => ({
      id: c.id,
      data: c.prossimaVisita!,
      titolo: `Visita · ${c.condominio?.nome ?? c.oggetto}`,
      tecnicoId: null,
      tecnico: null,
      tipo: "visita" as const,
      priorita: "ORDINARIA",
      impianto: null,
    })),
    ...verifiche.map((v) => ({
      id: v.id,
      data: v.dataScadenza,
      titolo: `Scadenza · ${v.tipo}`,
      tecnicoId: null,
      tecnico: null,
      tipo: "verifica" as const,
      // Изтичащ нормативен срок не е „обикновено": пропуснат, той спира уредбата.
      priorita: "URGENTE",
      impianto: v.impianto?.matricola ?? null,
    })),
  ];

  const distribuiti = distribuisci(giorni, impegni, mese);

  return ok({
    anno,
    mese,
    giorni: distribuiti.map((g) => ({
      ...g,
      carico: caricoDelGiorno(g, CAPACITA),
    })),
    capacita: CAPACITA,
    totale: impegni.length,
  });
});
