// Store върху Prisma (PostgreSQL) — продукция.
import { PrismaClient, Prisma } from "@prisma/client";
import { STATI_RICHIESTA, type Store, type Evento, type Pubblicazione } from "./types.js";

export function prismaStore(db: PrismaClient = new PrismaClient()): Store & { close(): Promise<void> } {
  const json = (v: unknown) => v as Prisma.InputJsonValue;
  return {
    async close() {
      await db.$disconnect();
    },
    utenti: {
      conta: () => db.utente.count(),
      tutti: () => db.utente.findMany({ orderBy: { creatoIl: "asc" } }),
      perId: (id) => db.utente.findUnique({ where: { id } }),
      perEmail: (email) => db.utente.findUnique({ where: { email: email.toLowerCase() } }),
      crea: (u) => db.utente.create({ data: { ...u, email: u.email.toLowerCase() } }),
      aggiorna: (id, patch) => db.utente.update({ where: { id }, data: patch }),
      async registraFallimento(id, max, fino) {
        const u = await db.utente.update({ where: { id }, data: { tentativiFalliti: { increment: 1 } }, select: { tentativiFalliti: true } });
        if (u.tentativiFalliti < max) return false;
        await db.utente.update({ where: { id }, data: { tentativiFalliti: 0, bloccatoFino: fino } });
        return true;
      },
      async consumaPassoTotp(id, passo) {
        const r = await db.utente.updateMany({ where: { id, OR: [{ totpUltimoPasso: null }, { totpUltimoPasso: { lt: passo } }] }, data: { totpUltimoPasso: passo } });
        return r.count === 1;
      },
      async consumaCodice(id, h) {
        // array_remove в един UPDATE: два паралелни входа с различни кодове не връщат изтрит код.
        const n = await db.$executeRaw`UPDATE "Utente" SET "codiciRecupero" = array_remove("codiciRecupero", ${h}) WHERE "id" = ${id} AND ${h} = ANY("codiciRecupero")`;
        return n === 1;
      },
    },
    sessioni: {
      crea: (s) => db.sessione.create({ data: s }),
      perId: (id) => db.sessione.findUnique({ where: { id } }),
      async aggiorna(id, patch) {
        await db.sessione.updateMany({ where: { id }, data: patch });
      },
      async elimina(id) {
        await db.sessione.deleteMany({ where: { id } });
      },
      async eliminaDiUtente(utenteId) {
        await db.sessione.deleteMany({ where: { utenteId } });
      },
      async eliminaScadute(ora) {
        return (await db.sessione.deleteMany({ where: { scadeIl: { lte: ora } } })).count;
      },
    },
    richieste: {
      crea: (r) => db.richiesta.create({ data: r }),
      perId: (id) => db.richiesta.findUnique({ where: { id } }),
      async cerca(f) {
        const where: Prisma.RichiestaWhereInput = {
          ...(f.stato ? { stato: f.stato } : {}),
          ...(f.testo
            ? {
                OR: (["nome", "email", "comune", "messaggio"] as const).map((k) => ({ [k]: { contains: f.testo, mode: "insensitive" as const } })),
              }
            : {}),
        };
        const [righe, totale] = await db.$transaction([
          db.richiesta.findMany({ where, orderBy: { creataIl: "desc" }, take: f.limite, skip: f.offset }),
          db.richiesta.count({ where }),
        ]);
        return { righe, totale };
      },
      async contaPerStato() {
        const g = await db.richiesta.groupBy({ by: ["stato"], _count: { _all: true } });
        const out = Object.fromEntries(STATI_RICHIESTA.map((s) => [s, 0])) as Record<(typeof STATI_RICHIESTA)[number], number>;
        for (const r of g) out[r.stato] = r._count._all;
        return out;
      },
      aggiorna: (id, patch) => db.richiesta.update({ where: { id }, data: patch }),
      async elimina(id) {
        await db.richiesta.deleteMany({ where: { id } });
      },
      async eliminaScadute(ora) {
        return (await db.richiesta.deleteMany({ where: { eliminareDopo: { lte: ora } } })).count;
      },
    },
    contenuti: {
      tutti: () => db.contenuto.findMany(),
      perId: (id) => db.contenuto.findUnique({ where: { id } }),
      salva: (id, tipo, dati, autoreId) =>
        db.$transaction(async (tx) => {
          const c = await tx.contenuto.upsert({ where: { id }, create: { id, tipo, dati: json(dati), autoreId }, update: { dati: json(dati), autoreId } });
          await tx.revisioneContenuto.create({ data: { contenutoId: id, dati: json(dati), autoreId } });
          const vecchie = await tx.revisioneContenuto.findMany({ where: { contenutoId: id }, orderBy: { creataIl: "desc" }, skip: 20, select: { id: true } });
          if (vecchie.length) await tx.revisioneContenuto.deleteMany({ where: { id: { in: vecchie.map((v) => v.id) } } });
          return c;
        }),
      async elimina(id) {
        await db.contenuto.deleteMany({ where: { id } });
      },
      revisioni: (id, limite) =>
        db.revisioneContenuto.findMany({ where: { contenutoId: id }, orderBy: { creataIl: "desc" }, take: limite, select: { id: true, creataIl: true, autoreId: true } }),
    },
    pubblicazioni: {
      crea: async (autoreId) => (await db.pubblicazione.create({ data: { esito: "IN_CORSO", autoreId } })) as Pubblicazione,
      async chiudi(id, esito, dati) {
        await db.pubblicazione.update({ where: { id }, data: { esito, finitaIl: new Date(), errore: dati.errore ?? null, versione: dati.versione ?? null } });
      },
      ultime: async (limite) => (await db.pubblicazione.findMany({ orderBy: { iniziataIl: "desc" }, take: limite })) as Pubblicazione[],
    },
    impostazioni: {
      leggi: (chiave) => db.impostazione.findUnique({ where: { chiave }, select: { valore: true, aggiornatoIl: true } }),
      async salva(chiave, valore, autoreId) {
        await db.impostazione.upsert({ where: { chiave }, create: { chiave, valore: json(valore), autoreId }, update: { valore: json(valore), autoreId } });
      },
    },
    eventi: {
      async registra(e) {
        await db.evento.create({ data: { ...e, dettagli: e.dettagli ? json(e.dettagli) : Prisma.JsonNull } });
      },
      ultimi: async (limite, offset) => (await db.evento.findMany({ orderBy: { creatoIl: "desc" }, take: limite, skip: offset })) as Evento[],
      async eliminaPrimaDi(data) {
        return (await db.evento.deleteMany({ where: { creatoIl: { lt: data } } })).count;
      },
    },
  };
}
