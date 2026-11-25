import { cercaLiberi as arganoLiberi, type RigaCalcolo } from '../argano/elenco.js';
import type { Capability } from '../auth/roles.js';
import { canAnywhere, scopeFor } from '../auth/scope.js';
import { prisma } from '../db.js';
import { menuPer, type VoceMenu } from '../http/menu.js';
import type { Translator } from '../i18n.js';
import { cercaLiberi as limitatoreLiberi } from '../limitatore/elenco.js';
import { listSchede, type SchedaRow } from '../schede/list.js';
import { MAX_QUERY_LENGTH, normalizeSearch, queryTokens } from '../schede/search.js';
import type { SessionUser } from '../types.js';

/** Колко от всеки вид — повече са на страницата на вида („Tutte le N schede“). */
export const PER_GRUPPO = 8;

export interface Risultati {
  q: string;
  /** Уредбите (картите) — null, ако човекът не вижда карти или няма какво да се търси. */
  impianti: { rows: SchedaRow[]; total: number } | null;
  argano: RigaCalcolo[];
  limitatore: RigaCalcolo[];
  /** Само за MASTER — фирмите по име. */
  aziende: Array<{ id: string; name: string; disattivata: boolean }>;
  /** Страниците и действията на портала, чието име съдържа търсеното (празно търсене — всички). */
  pagine: VoceMenu[];
}

/** Страниците извън менюто, до които човек стига често. */
const ALTRE: readonly VoceMenu[] = [
  { href: '/account', key: 'nav.account', icon: 'user' },
  { href: '/novita', key: 'novita.nav', icon: 'pulse' },
  { href: '/condizioni', key: 'legale.pagina.title', icon: 'seal' },
  { href: '/app', key: 'installa.nav', icon: 'download' },
];

/**
 * Едно търсене за целия портал (собственикът, 10 ноември 2026 — проучването на менюто: „una ricerca unica
 * dell'impianto“): уредбите по матрикула, номер и адрес (търсачката на „Schede“), изчисленията без карта,
 * фирмите (MASTER) и страниците. Всеки вид — в обхвата на своята способност; празен обхват е „нищо“.
 */
export async function cerca(user: SessionUser, raw: string, t: Translator): Promise<Risultati> {
  const q = raw.trim().slice(0, MAX_QUERY_LENGTH);
  const can = (capability: Capability) => canAnywhere(user, capability);
  const menu = menuPer(can);
  const tutte = [...menu.gruppi.flatMap((g) => g.voci), ...menu.nuovo, ...ALTRE];
  const parole = normalizeSearch(q).split(' ').filter(Boolean);
  const pagine = tutte.filter((voce) => {
    const testo = normalizeSearch(`${t(voce.key)} ${voce.descKey ? t(voce.descKey) : ''}`);
    return parole.every((parola) => testo.includes(parola));
  });
  const vuoto: Risultati = { q, impianti: null, argano: [], limitatore: [], aziende: [], pagine };
  if (queryTokens(q).length === 0) return vuoto;

  const leggeSchede = can('schede:read');
  const scope = scopeFor(user, 'schede:read');
  const [schede, argano, limitatore, aziende] = await Promise.all([
    leggeSchede ? listSchede({ scope, query: q }) : null,
    leggeSchede ? arganoLiberi(scope, q) : { rows: [] },
    leggeSchede ? limitatoreLiberi(scope, q) : { rows: [] },
    can('aziende:manage')
      ? prisma.azienda.findMany({
          where: { name: { contains: q, mode: 'insensitive' } },
          select: { id: true, name: true, deactivatedAt: true },
          orderBy: { name: 'asc' },
          take: PER_GRUPPO,
        })
      : [],
  ]);
  return {
    ...vuoto,
    impianti: schede ? { rows: schede.rows.slice(0, PER_GRUPPO), total: schede.total } : null,
    argano: argano.rows.slice(0, PER_GRUPPO),
    limitatore: limitatore.rows.slice(0, PER_GRUPPO),
    aziende: aziende.map((a) => ({
      id: a.id,
      name: a.name,
      disattivata: a.deactivatedAt !== null,
    })),
  };
}

/** Има ли поне един резултат. */
export const trovato = (r: Risultati): boolean =>
  (r.impianti?.total ?? 0) > 0 ||
  r.argano.length > 0 ||
  r.limitatore.length > 0 ||
  r.aziende.length > 0 ||
  r.pagine.length > 0;
