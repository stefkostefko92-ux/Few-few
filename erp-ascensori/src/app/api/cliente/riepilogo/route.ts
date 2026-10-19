// „Area cliente": всичко, което клиентът вижда, в една заявка.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { filtroTenant } from "@/lib/tenant";
import {
  sessioneCliente,
  filtroImpiantiCliente,
  filtroFattureCliente,
} from "@/lib/area-cliente";

export const GET = gestito(async () => {
  const { s, amministratoreId } = await sessioneCliente();
  if (!amministratoreId) return ok({ collegato: false });

  const amministratore = await prisma.amministratore.findFirst({
    where: { id: amministratoreId, ...filtroTenant(s) },
    select: { nome: true, cognome: true, ragioneSociale: true },
  });
  if (!amministratore) return ok({ collegato: false });

  const impianti = await prisma.impianto.findMany({
    where: filtroImpiantiCliente(s, amministratoreId),
    select: {
      id: true,
      matricola: true,
      indirizzo: true,
      stato: true,
      tipo: true,
      ultimaRevisione: true,
      prossimaRevisione: true,
      condominio: { select: { nome: true } },
    },
    orderBy: { matricola: "asc" },
  });
  const ids = impianti.map((i) => i.id);

  const [condomini, scadenze, ordini, fatture] = await Promise.all([
    prisma.condominio.findMany({
      where: { ...filtroTenant(s), amministratoreId },
      select: { id: true, nome: true, indirizzo: true, citta: true },
      orderBy: { nome: "asc" },
    }),
    prisma.scadenzaImpianto.findMany({
      where: { ...filtroTenant(s), impiantoId: { in: ids }, completata: false },
      select: {
        id: true,
        tipo: true,
        dataScadenza: true,
        impianto: { select: { matricola: true } },
      },
      orderBy: { dataScadenza: "asc" },
      take: 30,
    }),
    // Отворените интервенции; черновата е вътрешна работа на офиса.
    prisma.ordineLavoro.findMany({
      where: {
        ...filtroTenant(s),
        impiantoId: { in: ids },
        stato: { notIn: ["BOZZA", "CHIUSO", "ANNULLATO"] },
      },
      select: {
        id: true,
        numero: true,
        oggetto: true,
        stato: true,
        priorita: true,
        createdAt: true,
        impianto: { select: { matricola: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.fattura.findMany({
      where: filtroFattureCliente(s, amministratoreId),
      select: {
        id: true,
        numero: true,
        data: true,
        dataScadenza: true,
        totaleLordo: true,
        stato: true,
        statoPagamento: true,
        condominio: { select: { nome: true } },
      },
      orderBy: { data: "desc" },
      take: 50,
    }),
  ]);

  return ok({
    collegato: true,
    amministratore,
    condomini,
    impianti,
    scadenze,
    ordini,
    fatture,
  });
});
