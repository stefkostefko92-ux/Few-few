import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { percorsi } from '../allegati/archivio.js';
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
import {
  fileGeneratiDi,
  fileVersioni,
  schedeConVersioni,
  type FileGenerato,
} from './esportazione-documenti.js';
import { fineTar, intestazioneTar, riempimentoTar } from './tar.js';

/**
 * Всичко на една фирма в един файл (чл. 28, ал. 3, б. „g“ GDPR — в края на услугата данните се връщат
 * на фирмата): `dati.json` (фирмата, хората ѝ с ролите, картите с мерките, скиците и описанието на
 * снимките, листовете за интервенция с подписите и печата, табелите, изчисленията за аргано, регистърът,
 * неприетите покани), логото и готовите снимки и клипове. Без пароли, тайни на 2FA, токени и HMAC-и на
 * резервните кодове — те не са данни на фирмата, а ключове. Полетата — formato.ts (и страницата
 * `/esportazione`). MASTER (`/aziende/:id/esporta`) и ADMIN на фирмата (`/impostazioni/esportazione`), с ред в
 * регистъра.
 */

interface FileNelTar {
  nome: string;
  percorso: string;
}

export interface Esportazione {
  nomeFile: string;
  stream: Readable;
}

const radice = (id: string) => `rilievi-${id}`;

async function* contenuto(
  base: string,
  json: Buffer,
  logo: { data: Buffer; nome: string } | null,
  files: readonly FileNelTar[],
  generati: readonly FileGenerato[],
): AsyncGenerator<Buffer> {
  const now = new Date();
  yield intestazioneTar(`${base}/dati.json`, json.length, now);
  yield json;
  yield riempimentoTar(json.length);
  if (logo) {
    yield intestazioneTar(`${base}/${logo.nome}`, logo.data.length, now);
    yield logo.data;
    yield riempimentoTar(logo.data.length);
  }
  for (const file of files) {
    // Файл, който междувременно е изтрит, просто липсва — в dati.json остава описанието му.
    const info = await stat(file.percorso).catch(() => null);
    if (!info?.isFile()) continue;
    yield intestazioneTar(`${base}/${file.nome}`, info.size, info.mtime);
    let sent = 0;
    for await (const chunk of createReadStream(file.percorso, { end: info.size - 1 })) {
      const part = chunk as Buffer;
      sent += part.length;
      yield part;
    }
    // Размерът е в главата: по-къс файл се допълва, за да не се развали архивът след него.
    if (sent < info.size) yield Buffer.alloc(info.size - sent);
    yield riempimentoTar(info.size);
  }
  // PDF/A-тата и версиите — един по един: размерът е в главата, затова файлът е цял, преди да тръгне.
  for (const file of generati) {
    const dati = await file.genera();
    if (!dati) continue;
    yield intestazioneTar(`${base}/${file.nome}`, dati.length, now);
    yield dati;
    yield riempimentoTar(dati.length);
  }
  yield fineTar();
}

/** Частите на `dati.json`, прочетени от базата (без тайни — formato.ts). */
export interface PartiDati {
  azienda: Record<string, unknown>;
  persone: Array<Record<string, unknown>>;
  inviti: Array<Record<string, unknown>>;
  schede: Array<Record<string, unknown>>;
  interventi: unknown[];
  cartelli: unknown[];
  calcoliArgano: unknown[];
  calcoliLimitatore: unknown[];
  verbali: unknown[];
  buoni: unknown[];
  preventivi: unknown[];
  listino: unknown[];
  fornitori: unknown[];
  ordini: unknown[];
  registro: unknown[];
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
  const [
    persone,
    inviti,
    schede,
    interventi,
    cartelli,
    calcoliArgano,
    calcoliLimitatore,
    verbali,
    buoni,
    preventivi,
    listino,
    fornitori,
    ordini,
    registro,
  ] = await Promise.all([
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
    prisma.scheda.findMany({
      where: { aziendaId },
      orderBy: { createdAt: 'asc' },
      include: {
        misureBottoniere: true,
        schizzi: { orderBy: { ordine: 'asc' } },
        allegati: { orderBy: { createdAt: 'asc' }, select: SELECT_ALLEGATO },
      },
    }),
    prisma.intervento.findMany({ where: { aziendaId }, orderBy: { numero: 'asc' } }),
    prisma.cartello.findMany({ where: { aziendaId }, orderBy: { createdAt: 'asc' } }),
    prisma.calcoloArgano.findMany({ where: { aziendaId }, orderBy: { createdAt: 'asc' } }),
    prisma.calcoloLimitatore.findMany({ where: { aziendaId }, orderBy: { createdAt: 'asc' } }),
    prisma.verbale.findMany({ where: { aziendaId }, orderBy: { createdAt: 'asc' } }),
    prisma.buonoLavoro.findMany({
      where: { aziendaId },
      orderBy: { createdAt: 'asc' },
      include: { firme: { orderBy: { firmatoAt: 'asc' }, select: SELECT_FIRMA_BUONO } },
    }),
    // Офертите и ценоразписът — винаги, и при изключени оферти (нищо не се губи).
    prisma.preventivo.findMany({ where: { aziendaId }, orderBy: { numero: 'asc' } }),
    prisma.voceListino.findMany({ where: { aziendaId }, orderBy: { createdAt: 'asc' } }),
    prisma.fornitore.findMany({
      where: { aziendaId },
      orderBy: { nome: 'asc' },
      select: SELECT_FORNITORE,
    }),
    prisma.ordineFornitore.findMany({ where: { aziendaId }, orderBy: { inviatoAt: 'asc' } }),
    prisma.auditLog.findMany({
      where: { aziendaId },
      orderBy: { at: 'asc' },
      select: SELECT_REGISTRO,
    }),
  ]);
  // Износ от ADMIN: действията на собственика на портала остават без автор — в регистъра на фирмата
  // MASTER не се вижда (auth/registro.ts; Кодаджията, 12 ноември 2026).
  const masterIds = actor.master
    ? new Set<string>()
    : new Set(
        (await prisma.user.findMany({ where: { master: true }, select: { id: true } })).map(
          (u) => u.id,
        ),
      );
  const registroVisibile = registro.map((r) =>
    r.actorId && masterIds.has(r.actorId) ? { ...r, actorId: null } : r,
  );
  const files: FileNelTar[] = [];
  const conVersioni = await schedeConVersioni(aziendaId);
  const versionate = new Set(conVersioni);
  const schedeJson = schede.map(({ allegati, ...scheda }) => ({
    ...scheda,
    versioni: versionate.has(scheda.id) ? fileVersioni(scheda.id) : null,
    allegati: allegati.map((a) => {
      if (a.stato !== 'PRONTO') return { ...a, file: null };
      const nome = `allegati/${a.schedaId}/${a.id}.${a.tipo === 'VIDEO' ? 'mp4' : 'jpg'}`;
      files.push({ nome, percorso: percorsi(a).file });
      return { ...a, file: nome };
    }),
  }));
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
      schede: schedeJson,
      interventi,
      cartelli,
      calcoliArgano,
      calcoliLimitatore,
      verbali,
      buoni,
      preventivi,
      listino,
      fornitori,
      ordini,
      registro: registroVisibile,
    },
    new Date(),
  );
  const json = Buffer.from(JSON.stringify(dati, null, 2), 'utf8');
  const generati = await fileGeneratiDi(aziendaId, conVersioni);
  await writeAudit({
    actorId: actor.id,
    action: 'AZIENDA_EXPORT',
    aziendaId,
    targetType: 'azienda',
    targetId: aziendaId,
    meta: { schede: schede.length, file: files.length, generati: generati.length },
  });
  const giorno = new Date().toISOString().slice(0, 10);
  return {
    nomeFile: `${radice(aziendaId)}-${giorno}.tar`,
    stream: Readable.from(contenuto(radice(aziendaId), json, logoFile, files, generati)),
  };
}
