import { prisma } from '../db.js';
import { clienteDaPreventivo, searchTextCliente } from './form.js';
import { auditCliente, bloccaAzienda, registroPieno } from './service.js';

/**
 * Клиентът, написан на ръка в оферта, към регистъра на клиентите (`POST /preventivi/:id/cliente`): веднъж, без
 * да се сливат двама клиенти по догадка и без да мърда версията на офертата.
 */

/** P. IVA без „IT“ отпред — „IT01234567890“ и „01234567890“ са един номер. */
const numeroPiva = (piva: string | null): string | null =>
  piva === null ? null : piva.replace(/^IT(?=\d{11}$)/, '');

/** Колко съименници се гледат при търсенето на вече записания клиент. */
const OMONIMI = 20;

export type EsitoDalPreventivo =
  { esito: 'ok'; id: string; nuovo: boolean } | { esito: 'missing' } | { esito: 'pieno' };

/** Клиентът на офертата, прочетен със заключен ред: записът на формата ѝ чака края на свързването. */
interface ClienteNelPreventivo {
  cliente: string;
  clienteIndirizzo: string | null;
  clientePiva: string | null;
  clienteEmail: string | null;
  clienteId: string | null;
}

/**
 * Кой от съименниците е „същият клиент“ — или null, когато името само не казва кой: първо този със същия
 * данъчен номер; без номер от едната страна — единственият възможен (при номер в офертата: единственият
 * съименник без номер; без номер в офертата: единственият съименник изобщо). Двама клиенти никога не се
 * сливат по догадка — при няколко възможни се пише нов профил (ревюто на Кодаджията, 13 ноември 2026).
 */
function stessoCliente(
  omonimi: Array<{ id: string; piva: string | null }>,
  piva: string | null,
): string | null {
  const numero = numeroPiva(piva);
  if (numero === null) return omonimi.length === 1 ? omonimi[0]!.id : null;
  const esatto = omonimi.find((c) => c.piva !== null && numeroPiva(c.piva) === numero);
  if (esatto) return esatto.id;
  const senzaNumero = omonimi.filter((c) => c.piva === null);
  return senzaNumero.length === 1 ? senzaNumero[0]!.id : null;
}

/**
 * Клиентът, написан в офертата, влиза в регистъра и офертата се свързва с него. Веднъж: свързаната оферта
 * остава каквато е; клиентът вече е в регистъра (`stessoCliente`) — офертата се свързва с него, втори профил
 * не се пише. Връзката е директен UPDATE: версията на офертата (`updatedAt`) не мърда — който я има
 * отворена, записва (формата ѝ казва с какъв профил е отворена и не сваля връзката — routes/preventivi.ts).
 */
export function clienteDalPreventivo(
  actorId: string,
  aziendaId: string,
  preventivoId: string,
): Promise<EsitoDalPreventivo> {
  return prisma.$transaction(async (tx) => {
    if (!(await bloccaAzienda(tx, aziendaId))) return { esito: 'missing' } as const;
    const [preventivo] = await tx.$queryRaw<ClienteNelPreventivo[]>`
      SELECT "cliente", "clienteIndirizzo", "clientePiva", "clienteEmail", "clienteId"
      FROM "Preventivo"
      WHERE "id" = ${preventivoId} AND "aziendaId" = ${aziendaId}
      FOR UPDATE`;
    if (!preventivo) return { esito: 'missing' } as const;
    if (preventivo.clienteId)
      return { esito: 'ok', id: preventivo.clienteId, nuovo: false } as const;
    const data = clienteDaPreventivo(preventivo);
    const omonimi = await tx.cliente.findMany({
      where: { aziendaId, nome: { equals: data.nome, mode: 'insensitive' } },
      select: { id: true, piva: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: OMONIMI,
    });
    const stesso = stessoCliente(omonimi, data.piva);
    let id = stesso;
    if (id === null) {
      if (await registroPieno(tx, aziendaId)) return { esito: 'pieno' } as const;
      const row = await tx.cliente.create({
        data: { ...data, aziendaId, searchText: searchTextCliente(data) },
        select: { id: true },
      });
      id = row.id;
      await auditCliente(tx, actorId, 'CLIENTE_CREATE', aziendaId, id, { origine: 'preventivo' });
    }
    await tx.$executeRaw`
      UPDATE "Preventivo" SET "clienteId" = ${id}
      WHERE "id" = ${preventivoId} AND "aziendaId" = ${aziendaId}`;
    return { esito: 'ok', id, nuovo: stesso === null } as const;
  });
}
