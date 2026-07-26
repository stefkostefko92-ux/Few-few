// Отчет за рентабилност по договор или по импиант.
//
// Икономически данни → DIREZIONE+, както и целият фискален модул. Техникът
// вижда своите часове; колко изкарва фирмата от тях е друг въпрос.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import {
  calcolaRedditivita,
  ordinaPerMargine,
  type IngressiRedditivita,
} from "@/lib/redditivita";
import { riepilogoIva } from "@/lib/totals";

export const dynamic = "force-dynamic";

/** Фактурите в тези състояния НЕ са приход: черновата не е издадена, а
 *  сторнираната е отменена. Броенето им прави отчета оптимистичен. */
const STATI_RICAVO = ["EMESSA", "INVIATA", "PAGATA", "SCADUTA"] as const;

export const GET = gestito(async (req) => {
  const s = await richiedeRuolo("DIREZIONE");
  const url = new URL(req.url);
  const per =
    url.searchParams.get("per") === "impianto" ? "impianto" : "contratto";
  const da = url.searchParams.get("da");
  const a = url.searchParams.get("a");

  const periodo =
    da || a
      ? {
          ...(da ? { gte: new Date(da) } : {}),
          ...(a ? { lte: new Date(`${a}T23:59:59.999Z`) } : {}),
        }
      : undefined;
  if (periodo && [da, a].some((v) => v && Number.isNaN(new Date(v).getTime())))
    throw new ErroreHttp(400, "Periodo non valido");

  const dove = filtroTenant(s);

  // Ордините са мостът: през тях и часовете, и материалите, и външният разход
  // стигат до договор/импиант.
  const ordini = await prisma.ordineLavoro.findMany({
    where: { ...dove, ...(periodo ? { createdAt: periodo } : {}) },
    select: {
      id: true,
      numero: true,
      costoEsterno: true,
      contrattoId: true,
      impiantoId: true,
      contratto: { select: { numero: true, oggetto: true } },
      impianto: {
        select: { matricola: true, condominio: { select: { nome: true } } },
      },
      rapportini: {
        select: {
          oreLavoro: true,
          tecnico: { select: { costoOrario: true } },
        },
      },
      movimenti: {
        // Само изходите: входът е зареждане на склада, не разход по работата.
        where: { tipo: "USCITA" },
        select: {
          quantita: true,
          articolo: { select: { prezzoAcquisto: true } },
        },
      },
      fatture: {
        where: { stato: { in: [...STATI_RICAVO] }, tipo: "EMESSA" },
        select: {
          voci: {
            select: { quantita: true, prezzoUnitario: true, aliquotaIva: true },
          },
        },
      },
    },
  });

  // Фактурите за canone висят на ДОГОВОРА, не на ордин — иначе абонаментният
  // приход, който е основният за асансьорна фирма, изобщо не влиза в отчета.
  const fattureContratto = await prisma.fattura.findMany({
    where: {
      ...dove,
      tipo: "EMESSA",
      stato: { in: [...STATI_RICAVO] },
      contrattoId: { not: null },
      ordineLavoroId: null,
      ...(periodo ? { data: periodo } : {}),
    },
    select: {
      contrattoId: true,
      voci: {
        select: { quantita: true, prezzoUnitario: true, aliquotaIva: true },
      },
    },
  });

  /** Нето от редовете, не `totaleNetto`: така ДДС никога не влиза за приход, а
   *  обобщението по аликвота е същото, което сверява и SDI. */
  const netto = (
    voci: {
      quantita: unknown;
      prezzoUnitario: unknown;
      aliquotaIva: unknown;
    }[],
  ) =>
    riepilogoIva(
      voci.map((v) => ({
        quantita: String(v.quantita),
        prezzoUnitario: String(v.prezzoUnitario),
        aliquotaIva: String(v.aliquotaIva),
      })),
    ).map((r) => r.imponibile);

  const gruppi = new Map<
    string,
    { etichetta: string; ingressi: IngressiRedditivita }
  >();
  const prendi = (chiave: string, etichetta: string) => {
    let g = gruppi.get(chiave);
    if (!g) {
      g = {
        etichetta,
        ingressi: { ricaviNetti: [], ore: [], materiali: [], costiEsterni: [] },
      };
      gruppi.set(chiave, g);
    }
    return g;
  };

  for (const o of ordini) {
    const chiave = per === "impianto" ? o.impiantoId : o.contrattoId;
    if (!chiave) continue; // без връзка разходът не може да се отнесе никъде
    const etichetta =
      per === "impianto"
        ? `${o.impianto?.matricola ?? "?"} · ${o.impianto?.condominio?.nome ?? "—"}`
        : `${o.contratto?.numero ?? "?"} · ${o.contratto?.oggetto ?? "—"}`;
    const g = prendi(chiave, etichetta);

    for (const r of o.rapportini)
      g.ingressi.ore.push({
        ore: String(r.oreLavoro),
        costoOrario: r.tecnico?.costoOrario
          ? String(r.tecnico.costoOrario)
          : null,
      });
    for (const m of o.movimenti)
      g.ingressi.materiali.push({
        quantita: m.quantita,
        prezzoAcquisto: m.articolo.prezzoAcquisto
          ? String(m.articolo.prezzoAcquisto)
          : null,
      });
    if (o.costoEsterno) g.ingressi.costiEsterni.push(String(o.costoEsterno));
    for (const f of o.fatture) g.ingressi.ricaviNetti.push(...netto(f.voci));
  }

  if (per === "contratto")
    for (const f of fattureContratto) {
      if (!f.contrattoId) continue;
      prendi(f.contrattoId, "—").ingressi.ricaviNetti.push(...netto(f.voci));
    }

  const righe = ordinaPerMargine(
    [...gruppi.entries()].map(([id, g]) => ({
      id,
      etichetta: g.etichetta,
      redditivita: calcolaRedditivita(g.ingressi),
    })),
  );

  return ok({
    per,
    righe,
    // Числото служи за СРАВНЕНИЕ, не за деклариране. Отговорът си го носи, за да
    // не се загуби, когато някой дърпа отчета през API-то.
    nota:
      "Margine di contribuzione: non comprende i costi indiretti (sede, assicurazioni, " +
      "parco mezzi, amministrazione). Serve a confrontare contratti e impianti, non a " +
      "determinare l'utile d'esercizio.",
  });
});
