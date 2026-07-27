// Източник на данни за персонализируемото табло. Икономическите секции
// (fatturato, insoluti) се връщат само от DIREZIONE нагоре — сървърна проверка.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { haPermesso } from "@/lib/roles";
import { filtroTenant } from "@/lib/tenant";
import { toCents, fromCents } from "@/lib/totals";

function mesiIndietro(n: number): { chiave: string; label: string }[] {
  const out: { chiave: string; label: string }[] = [];
  const ora = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ora.getFullYear(), ora.getMonth() - i, 1);
    out.push({
      chiave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("it-IT", { month: "short", year: "2-digit" }),
    });
  }
  return out;
}

export const GET = gestito(async () => {
  // минимум OPERATORE: CLIENTE (ниво 7) не вижда оперативните данни на фирмата
  const s = await richiedeRuolo("OPERATORE");
  // Таблото четеше БЕЗ обхват по фирма: KPI-тата брояха чужди импианти и ордини,
  // списъкът със срокове издаваше адресите на чужди сгради, а от DIREZIONE нагоре
  // „оборот" и „просрочия" бяха сумата на ВСИЧКИ фирми в инсталацията.
  const t = filtroTenant(s);
  const oggi = new Date();
  const fra30 = new Date(oggi.getTime() + 30 * 86_400_000);
  const inizio12Mesi = new Date(oggi.getFullYear(), oggi.getMonth() - 11, 1);

  const [
    impiantiTotali,
    impiantiPerStato,
    ordiniAperti,
    ordiniPerStato,
    ordiniPerPriorita,
    preventiviPerStato,
    preventiviInAttesa,
    scadenzeProssime,
    scadenze30gg,
    sottoScorta,
    automezzi,
    dipendentiAttivi,
  ] = await Promise.all([
    prisma.impianto.count({ where: { attivo: true, ...t } }),
    prisma.impianto.groupBy({
      by: ["stato"],
      _count: true,
      where: { attivo: true, ...t },
    }),
    prisma.ordineLavoro.count({
      where: { stato: { notIn: ["CHIUSO", "ANNULLATO"] }, ...t },
    }),
    prisma.ordineLavoro.groupBy({ by: ["stato"], _count: true, where: t }),
    prisma.ordineLavoro.groupBy({
      by: ["priorita"],
      _count: true,
      where: { stato: { notIn: ["CHIUSO", "ANNULLATO"] }, ...t },
    }),
    prisma.preventivo.groupBy({ by: ["stato"], _count: true, where: t }),
    prisma.preventivo.count({ where: { stato: "INVIATO", ...t } }),
    prisma.scadenzaImpianto.findMany({
      where: {
        completata: false,
        dataScadenza: { lte: fra30 },
        impianto: { is: t },
      },
      include: { impianto: { select: { matricola: true, indirizzo: true } } },
      orderBy: { dataScadenza: "asc" },
      take: 10,
    }),
    prisma.scadenzaImpianto.count({
      where: {
        completata: false,
        dataScadenza: { lte: fra30 },
        impianto: { is: t },
      },
    }),
    // Беше суров SQL без обхват по фирма. През Prisma правилото за изолация
    // стои на едно място и не може да се пропусне при следваща промяна.
    prisma.articoloMagazzino.findMany({
      where: {
        attivo: true,
        quantita: { lt: prisma.articoloMagazzino.fields.sogliaMinima },
        ...t,
      },
      select: {
        id: true,
        codice: true,
        nome: true,
        quantita: true,
        sogliaMinima: true,
      },
      orderBy: { quantita: "asc" },
      take: 20,
    }),
    prisma.automezzo.findMany({
      where: { attivo: true, ...t },
      select: { stato: true },
    }),
    prisma.dipendente.count({ where: { attivo: true, ...t } }),
  ]);

  const automezziPerStato = { verde: 0, giallo: 0, rosso: 0 } as Record<
    string,
    number
  >;
  for (const a of automezzi)
    automezziPerStato[a.stato] = (automezziPerStato[a.stato] ?? 0) + 1;

  const base = {
    kpi: {
      impiantiTotali,
      ordiniAperti,
      preventiviInAttesa,
      scadenze30gg,
      sottoScorta: sottoScorta.length,
      dipendentiAttivi,
      automezziRosso: automezziPerStato.rosso,
    },
    impiantiPerStato: impiantiPerStato.map((r) => ({
      nome: r.stato,
      valore: r._count,
    })),
    ordiniPerStato: ordiniPerStato.map((r) => ({
      nome: r.stato,
      valore: r._count,
    })),
    ordiniPerPriorita: ordiniPerPriorita.map((r) => ({
      nome: r.priorita,
      valore: r._count,
    })),
    preventiviPerStato: preventiviPerStato.map((r) => ({
      nome: r.stato,
      valore: r._count,
    })),
    automezziPerStato: Object.entries(automezziPerStato).map(
      ([nome, valore]) => ({
        nome,
        valore,
      }),
    ),
    scadenzeProssime,
    sottoScorta,
  };

  // Икономика — само за DIREZIONE и нагоре
  if (!haPermesso(s.ruolo, "DIREZIONE")) return ok(base);

  const [fatture, insolute] = await Promise.all([
    prisma.fattura.findMany({
      where: {
        tipo: "EMESSA",
        stato: { not: "STORNATA" },
        data: { gte: inizio12Mesi },
        ...t,
      },
      select: { data: true, totaleLordo: true, stato: true },
    }),
    prisma.fattura.findMany({
      where: { tipo: "EMESSA", stato: "SCADUTA", ...t },
      select: { totaleLordo: true },
    }),
  ]);

  const mesi = mesiIndietro(12);
  const perMese = new Map(
    mesi.map((m) => [m.chiave, { emesso: 0, incassato: 0 }]),
  );
  for (const f of fatture) {
    const chiave = `${f.data.getFullYear()}-${String(f.data.getMonth() + 1).padStart(2, "0")}`;
    const riga = perMese.get(chiave);
    if (!riga) continue;
    const cents = toCents(f.totaleLordo.toString());
    riga.emesso += cents;
    if (f.stato === "PAGATA") riga.incassato += cents;
  }
  const fatturatoMensile = mesi.map((m) => ({
    nome: m.label,
    emesso: Number(fromCents(perMese.get(m.chiave)!.emesso)),
    incassato: Number(fromCents(perMese.get(m.chiave)!.incassato)),
  }));

  const totaleInsoluto = insolute.reduce(
    (acc, f) => acc + toCents(f.totaleLordo.toString()),
    0,
  );

  return ok({
    ...base,
    fatturatoMensile,
    insoluti: {
      numero: insolute.length,
      totale: Number(fromCents(totaleInsoluto)),
    },
  });
});
