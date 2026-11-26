// StoreDocumenti с Prisma/PostgreSQL. Версиите и издаването — с условен updateMany (атомарно); номерът —
// с INSERT … ON CONFLICT … RETURNING (един ред на префикс и година, без състезание).
import type { Prisma, PrismaClient } from "@prisma/client";
import type { DocumentoRiga, FraseRiga, StoreDocumenti } from "./documenti-types.js";

const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;
const SINTESI = {
  id: true, tipo: true, stato: true, numero: true, revisione: true, revisioneDi: true, versione: true, titolo: true, richiestaId: true,
  autoreId: true, autoreNome: true, autoreQualifica: true, creatoIl: true, aggiornatoIl: true, emessoIl: true, pdfSha256: true,
} as const;

export function documentiPrisma(db: PrismaClient): StoreDocumenti {
  return {
    documenti: {
      async elenco({ testo, limite, offset }) {
        const where: Prisma.DocumentoWhereInput = testo
          ? { OR: [{ titolo: { contains: testo, mode: "insensitive" } }, { numero: { contains: testo, mode: "insensitive" } }] }
          : {};
        const [righe, totale] = await Promise.all([
          db.documento.findMany({ where, select: SINTESI, orderBy: { aggiornatoIl: "desc" }, take: limite, skip: offset }),
          db.documento.count({ where }),
        ]);
        return { righe, totale };
      },
      perId: (id) => db.documento.findUnique({ where: { id } }) as Promise<DocumentoRiga | null>,
      crea: (r) => db.documento.create({ data: { ...r, intestazione: json(r.intestazione), dati: json(r.dati) } }) as Promise<DocumentoRiga>,
      async aggiorna(id, attesa, patch) {
        const n = await db.documento.updateMany({
          where: { id, versione: attesa, stato: "BOZZA" },
          data: { titolo: patch.titolo, intestazione: json(patch.intestazione), dati: json(patch.dati), versione: { increment: 1 } },
        });
        return n.count === 1 ? ((await db.documento.findUnique({ where: { id } })) as DocumentoRiga | null) : null;
      },
      async emetti(id, attesa, e) {
        try {
          const n = await db.documento.updateMany({ where: { id, versione: attesa, stato: "BOZZA" }, data: { ...e, stato: "EMESSO", versione: { increment: 1 } } });
          return n.count === 1 ? ((await db.documento.findUnique({ where: { id } })) as DocumentoRiga | null) : null;
        } catch (err) {
          // Същият номер и ревизия вече издадени (@@unique) → конфликт, не 500.
          if ((err as { code?: string }).code === "P2002") return null;
          throw err;
        }
      },
      async elimina(id) {
        await db.$transaction([db.documento.deleteMany({ where: { id } }), db.documentoEliminato.upsert({ where: { id }, create: { id }, update: {} })]);
      },
      eliminato: async (id) => (await db.documentoEliminato.count({ where: { id } })) > 0,
      contaEliminati: () => db.documentoEliminato.count(),
      figli: (id) => db.documento.findMany({ where: { revisioneDi: id }, select: SINTESI }),
      tutti: () => db.documento.findMany({ select: SINTESI, orderBy: { aggiornatoIl: "desc" }, take: 10_000 }),
      async prossimoNumero(prefisso, anno) {
        const r = await db.$queryRaw<Array<{ ultimo: number }>>`
          INSERT INTO "NumeratoreDocumenti" ("prefisso", "anno", "ultimo") VALUES (${prefisso}, ${anno}, 1)
          ON CONFLICT ("prefisso", "anno") DO UPDATE SET "ultimo" = "NumeratoreDocumenti"."ultimo" + 1
          RETURNING "ultimo"`;
        return Number(r[0]?.ultimo);
      },
    },
    foto: {
      perDocumento: (documentoId) => db.fotoDocumento.findMany({ where: { documentoId }, orderBy: { ordine: "asc" } }),
      perId: (id) => db.fotoDocumento.findUnique({ where: { id } }),
      crea: (r) => db.fotoDocumento.create({ data: r }),
      async aggiorna(id, patch) {
        await db.fotoDocumento.updateMany({ where: { id }, data: patch });
      },
      async elimina(id) {
        await db.fotoDocumento.deleteMany({ where: { id } });
      },
    },
    frasi: {
      tutte: () => db.frase.findMany({ orderBy: { creataIl: "asc" } }) as Promise<FraseRiga[]>,
      perId: (id) => db.frase.findUnique({ where: { id } }) as Promise<FraseRiga | null>,
      crea: (r) => db.frase.create({ data: r }) as Promise<FraseRiga>,
      async aggiorna(id, patch) {
        await db.frase.updateMany({ where: { id }, data: patch });
      },
    },
  };
}
