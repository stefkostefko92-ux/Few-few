// Fatture: активен (EMESSA/FT) и пасивен (RICEVUTA/FR) цикъл в една таблица.
// Икономическите данни са видими от DIREZIONE нагоре (гл. Controlli).

import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { dettagliCreazione } from "@/lib/audit-dettagli";
import { conNumero, PREFISSI } from "@/lib/numerazione";
import { fatturaSchema } from "@/lib/entities";

const include = {
  // Кондоминиумът е ПОЛУЧАТЕЛЯТ; администраторът е представител. В списъка се
  // показва получателят — иначе всички фактури изглеждат издадени на две-три
  // студиа и колоната не различава клиентите.
  condominio: { select: { nome: true, codiceFiscale: true } },
  amministratore: {
    select: { nome: true, cognome: true, ragioneSociale: true },
  },
  ordineLavoro: { select: { numero: true } },
  utente: { select: { nome: true, cognome: true } },
  _count: { select: { voci: true } },
};

export const GET = gestito(async (req) => {
  const s = await richiedeRuolo("DIREZIONE");
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const tipo = url.searchParams.get("tipo");
  const stato = url.searchParams.get("stato");
  const statoSdi = url.searchParams.get("statoSdi");
  const statoPagamento = url.searchParams.get("statoPagamento");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const size = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("size") ?? 50) || 50),
  );
  const where = {
    ...filtroTenant(s),
    ...(q
      ? {
          OR: [
            { numero: { contains: q, mode: "insensitive" as const } },
            { oggetto: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(tipo ? { tipo: tipo as never } : {}),
    ...(stato ? { stato: stato as never } : {}),
    ...(statoSdi ? { statoSdi: statoSdi as never } : {}),
    ...(statoPagamento ? { statoPagamento: statoPagamento as never } : {}),
  };
  const [righe, totale] = await Promise.all([
    prisma.fattura.findMany({
      where,
      include,
      orderBy: { data: "desc" },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.fattura.count({ where }),
  ]);
  return ok({ righe, totale, page, size });
});

export const POST = gestito(async (req) => {
  const s = await richiedeRuolo("DIREZIONE");
  const data = await corpoValidato(req, fatturaSchema);
  const prefisso =
    data.tipo === "RICEVUTA"
      ? PREFISSI.fatturaRicevuta
      : PREFISSI.fatturaEmessa;

  // Удържането по чл. 25-ter не е избор на фирмата — то се дължи по закон,
  // когато получателят е кондоминиум и той е заместник по данъка. Затова се
  // включва САМО ПО ПОДРАЗБИРАНЕ (изричното подаване го надделява): има редки
  // кондоминиуми без данъчен номер и доставки, които не са договор за
  // изработка. Проверката е сървърна и с филтъра по фирма — чужд UUID не бива
  // да определя фискалния режим на нашата фактура.
  let ritenutaPredefinita = false;
  if (data.condominioId) {
    const cond = await prisma.condominio.findFirst({
      where: { id: data.condominioId, ...filtroTenant(s) },
      select: { sostitutoImposta: true },
    });
    if (!cond) throw new ErroreHttp(404, "Condominio non trovato");
    ritenutaPredefinita = cond.sostitutoImposta;
  }

  const creato = await conNumero("fattura", prefisso, s.tenantId, (numero) =>
    prisma.fattura.create({
      data: {
        tipo: data.tipo,
        data: data.data,
        dataScadenza: data.dataScadenza ?? undefined,
        oggetto: data.oggetto ?? undefined,
        condominioId: data.condominioId ?? undefined,
        amministratoreId: data.amministratoreId ?? undefined,
        ordineLavoroId: data.ordineLavoroId ?? undefined,
        note: data.note ?? undefined,
        ritenuta: data.ritenuta ?? ritenutaPredefinita,
        ...(data.ritenutaAliquota
          ? { ritenutaAliquota: data.ritenutaAliquota }
          : {}),
        ...(data.ritenutaTipo ? { ritenutaTipo: data.ritenutaTipo } : {}),
        ...(data.ritenutaCausale
          ? { ritenutaCausale: data.ritenutaCausale }
          : {}),
        ...(data.splitPayment != null
          ? { splitPayment: data.splitPayment }
          : {}),
        ...(data.modalitaPagamento
          ? { modalitaPagamento: data.modalitaPagamento }
          : {}),
        ...(data.condizioniPagamento
          ? { condizioniPagamento: data.condizioniPagamento }
          : {}),
        ...(data.cig ? { cig: data.cig } : {}),
        ...(data.cup ? { cup: data.cup } : {}),
        numero,
        utenteId: s.sub,
        ...tenantDiCreazione(s),
      },
      include,
    }),
  );
  await scriviAudit({
    azione: "CREATE",
    entita: "fatture",
    entitaId: creato.id,
    dettagli: dettagliCreazione(data),
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(creato, 201);
});
