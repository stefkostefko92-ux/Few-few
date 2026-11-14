import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { cartellaArrivi, percorsi } from '../allegati/archivio.js';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import {
  FORMATO_ESPORTAZIONE,
  SELECT_ALLEGATO,
  SELECT_AZIENDA,
  SELECT_FIRMA_BUONO,
  SELECT_FORNITORE,
  SELECT_INVITO,
  SELECT_PERSONA,
  SELECT_REGISTRO,
  type SezioneDati,
} from './formato.js';
import { fileGeneratiDi, fileVersioni, schedeConVersioni } from './esportazione-documenti.js';
import { aPagine, scriviDati } from './esportazione-dati.js';
import { contenuto, type FileNelTar } from './esportazione-archivio.js';

/**
 * Всичко на една фирма в един файл (чл. 28, ал. 3, б. „g“ GDPR — в края на услугата данните се връщат
 * на фирмата): `dati.json` (фирмата, хората ѝ с ролите, картите с мерките, скиците и описанието на
 * снимките, листовете за интервенция с подписите и печата, табелите, изчисленията за аргано, регистърът,
 * неприетите покани), логото и готовите снимки и клипове. Без пароли, тайни на 2FA, токени и HMAC-и на
 * резервните кодове — те не са данни на фирмата, а ключове. Полетата — formato.ts (и страницата
 * `/esportazione`). MASTER (`/aziende/:id/esporta`) и ADMIN на фирмата (`/impostazioni/esportazione`), с ред в
 * регистъра.
 */

export interface Esportazione {
  nomeFile: string;
  stream: Readable;
}

const radice = (id: string) => `rilievi-${id}`;

/** Редове наведнъж или източник на редове (големите раздели идват от базата на страници). */
type Righe = unknown[] | AsyncIterable<unknown>;

export interface PartiDati {
  azienda: Record<string, unknown>;
  persone: Array<Record<string, unknown>>;
  inviti: Array<Record<string, unknown>>;
  schede: Righe;
  interventi: Righe;
  cartelli: unknown[];
  calcoliArgano: Righe;
  calcoliLimitatore: Righe;
  verbali: Righe;
  buoni: Righe;
  preventivi: Righe;
  listino: unknown[];
  fornitori: unknown[];
  ordini: Righe;
  registro: Righe;
}

/** `dati.json` в реда на `SEZIONI_DATI` — без база (тестът сверява разделите със страницата). */
export function componiDati(parti: PartiDati, esportatoIl: Date): Record<SezioneDati, unknown> {
  return {
    formato: FORMATO_ESPORTAZIONE,
    esportatoIl: esportatoIl.toISOString(),
    azienda: parti.azienda,
    persone: parti.persone,
    inviti: parti.inviti,
    schede: parti.schede,
    interventi: parti.interventi,
    cartelli: parti.cartelli,
    calcoliArgano: parti.calcoliArgano,
    calcoliLimitatore: parti.calcoliLimitatore,
    verbali: parti.verbali,
    buoni: parti.buoni,
    preventivi: parti.preventivi,
    listino: parti.listino,
    fornitori: parti.fornitori,
    ordini: parti.ordini,
    registro: parti.registro,
  };
}

/** Колко реда от таблица стоят в паметта наведнъж, докато `dati.json` се пише. */
const PAGINA = 200;

/** Архивът на фирмата; null — няма такава. */
export async function esportaAzienda(
  aziendaId: string,
  actor: { id: string; master: boolean },
): Promise<Esportazione | null> {
  const azienda = await prisma.azienda.findUnique({
    where: { id: aziendaId },
    select: SELECT_AZIENDA,
  });
  if (!azienda) return null;
  // Малките раздели — наведнъж; големите (карти, листове, регистър…) — на страници, ред по ред към файла.
  const [persone, inviti, cartelli, listino, fornitori] = await Promise.all([
    prisma.membership.findMany({
      where: { aziendaId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, createdAt: true, user: { select: SELECT_PERSONA } },
    }),
    prisma.invite.findMany({
      where: { aziendaId, acceptedAt: null },
      orderBy: { createdAt: 'asc' },
      select: SELECT_INVITO,
    }),
    prisma.cartello.findMany({ where: { aziendaId }, orderBy: { createdAt: 'asc' } }),
    prisma.voceListino.findMany({ where: { aziendaId }, orderBy: { createdAt: 'asc' } }),
    prisma.fornitore.findMany({
      where: { aziendaId },
      orderBy: { nome: 'asc' },
      select: SELECT_FORNITORE,
    }),
  ]);
  const dopo = (id: string | undefined): { cursor: { id: string }; skip: number } | object =>
    id ? { cursor: { id }, skip: 1 } : {};
  const where = { aziendaId };
  const perData = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];
  const perNumero = [{ numero: 'asc' as const }, { id: 'asc' as const }];
  // Износ от ADMIN: действията на собственика на портала остават без автор — в регистъра на фирмата
  // MASTER не се вижда (auth/registro.ts; Кодаджията, 12 ноември 2026).
  const masterIds = actor.master
    ? new Set<string>()
    : new Set(
        (await prisma.user.findMany({ where: { master: true }, select: { id: true } })).map(
          (u) => u.id,
        ),
      );
  const files: FileNelTar[] = [];
  const conVersioni = await schedeConVersioni(aziendaId);
  const versionate = new Set(conVersioni);
  let nSchede = 0;
  async function* schede() {
    const righe = aPagine(
      (id) =>
        prisma.scheda.findMany({
          where,
          orderBy: perData,
          take: PAGINA,
          ...dopo(id),
          include: {
            misureBottoniere: true,
            schizzi: { orderBy: { ordine: 'asc' } },
            allegati: { orderBy: { createdAt: 'asc' }, select: SELECT_ALLEGATO },
          },
        }),
      PAGINA,
    );
    for await (const { allegati, ...scheda } of righe) {
      nSchede += 1;
      yield {
        ...scheda,
        versioni: versionate.has(scheda.id) ? fileVersioni(scheda.id) : null,
        allegati: allegati.map((a) => {
          if (a.stato !== 'PRONTO') return { ...a, file: null };
          const nome = `allegati/${a.schedaId}/${a.id}.${a.tipo === 'VIDEO' ? 'mp4' : 'jpg'}`;
          files.push({ nome, percorso: percorsi(a).file });
          return { ...a, file: nome };
        }),
      };
    }
  }
  async function* registro() {
    const righe = aPagine(
      (id) =>
        prisma.auditLog.findMany({
          where,
          orderBy: [{ at: 'asc' }, { id: 'asc' }],
          take: PAGINA,
          ...dopo(id),
          select: { ...SELECT_REGISTRO, id: true },
        }),
      PAGINA,
    );
    for await (const { id: _id, ...r } of righe)
      yield r.actorId && masterIds.has(r.actorId) ? { ...r, actorId: null } : r;
  }
  const { logo, logoType, ...datiAzienda } = azienda;
  const logoFile =
    logo && logoType
      ? { data: Buffer.from(logo), nome: `logo.${logoType === 'image/png' ? 'png' : 'jpg'}` }
      : null;
  const dati = componiDati(
    {
      azienda: { ...datiAzienda, logo: logoFile?.nome ?? null },
      persone: persone.map((m) => ({ ...m.user, ruolo: m.role, nellAziendaDal: m.createdAt })),
      inviti,
      schede: schede(),
      interventi: aPagine(
        (id) =>
          prisma.intervento.findMany({ where, orderBy: perNumero, take: PAGINA, ...dopo(id) }),
        PAGINA,
      ),
      cartelli,
      calcoliArgano: aPagine(
        (id) =>
          prisma.calcoloArgano.findMany({ where, orderBy: perData, take: PAGINA, ...dopo(id) }),
        PAGINA,
      ),
      calcoliLimitatore: aPagine(
        (id) =>
          prisma.calcoloLimitatore.findMany({
            where,
            orderBy: perData,
            take: PAGINA,
            ...dopo(id),
          }),
        PAGINA,
      ),
      verbali: aPagine(
        (id) => prisma.verbale.findMany({ where, orderBy: perData, take: PAGINA, ...dopo(id) }),
        PAGINA,
      ),
      buoni: aPagine(
        (id) =>
          prisma.buonoLavoro.findMany({
            where,
            orderBy: perData,
            take: PAGINA,
            ...dopo(id),
            include: { firme: { orderBy: { firmatoAt: 'asc' }, select: SELECT_FIRMA_BUONO } },
          }),
        PAGINA,
      ),
      // Офертите и ценоразписът — винаги, и при изключени оферти (нищо не се губи).
      preventivi: aPagine(
        (id) =>
          prisma.preventivo.findMany({ where, orderBy: perNumero, take: PAGINA, ...dopo(id) }),
        PAGINA,
      ),
      listino,
      fornitori,
      ordini: aPagine(
        (id) =>
          prisma.ordineFornitore.findMany({
            where,
            orderBy: [{ inviatoAt: 'asc' }, { id: 'asc' }],
            take: PAGINA,
            ...dopo(id),
          }),
        PAGINA,
      ),
      registro: registro(),
    },
    new Date(),
  );
  // На диска (в тома, при качванията — прекъснат износ го чисти поддръжката), не в паметта.
  const fileDati = join(cartellaArrivi(), `esportazione-${randomUUID()}.json`);
  let bytes: number;
  try {
    bytes = await scriviDati(fileDati, dati);
  } catch (error) {
    await rm(fileDati, { force: true });
    throw error;
  }
  const generati = await fileGeneratiDi(aziendaId, conVersioni);
  await writeAudit({
    actorId: actor.id,
    action: 'AZIENDA_EXPORT',
    aziendaId,
    targetType: 'azienda',
    targetId: aziendaId,
    meta: { schede: nSchede, file: files.length, generati: generati.length },
  });
  const giorno = new Date().toISOString().slice(0, 10);
  return {
    nomeFile: `${radice(aziendaId)}-${giorno}.tar`,
    stream: Readable.from(
      contenuto(radice(aziendaId), { percorso: fileDati, bytes }, logoFile, files, generati),
    ),
  };
}
