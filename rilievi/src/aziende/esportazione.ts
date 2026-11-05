import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { percorsi } from '../allegati/archivio.js';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { fineTar, intestazioneTar, riempimentoTar } from './tar.js';

/**
 * Всичко на една фирма в един файл (чл. 28, ал. 3, б. „g“ GDPR — в края на услугата данните се връщат
 * на фирмата): `dati.json` (фирмата, хората ѝ с ролите, картите с мерките, скиците и описанието на
 * снимките, листовете за интервенция с подписите и печата, табелите, изчисленията за аргано, регистърът),
 * логото и готовите снимки и клипове. Без пароли, тайни на 2FA, токени и HMAC-и на резервните кодове —
 * те не са данни на фирмата, а ключове. Само MASTER (маршрутът), с ред в регистъра.
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
  yield fineTar();
}

/** Архивът на фирмата; null — няма такава. */
export async function esportaAzienda(
  aziendaId: string,
  actorId: string,
): Promise<Esportazione | null> {
  const azienda = await prisma.azienda.findUnique({
    where: { id: aziendaId },
    select: {
      id: true,
      name: true,
      datiSocietari: true,
      ordineSezioni: true,
      schizzi: true,
      cartelloModello: true,
      nomiRuoli: true,
      permessiRuoli: true,
      logo: true,
      logoType: true,
      createdAt: true,
      deactivatedAt: true,
    },
  });
  if (!azienda) return null;
  const [persone, schede, interventi, cartelli, calcoliArgano, verbali, registro] =
    await Promise.all([
      prisma.membership.findMany({
        where: { aziendaId },
        orderBy: { createdAt: 'asc' },
        select: {
          role: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              createdAt: true,
              deactivatedAt: true,
              lastLoginAt: true,
            },
          },
        },
      }),
      prisma.scheda.findMany({
        where: { aziendaId },
        orderBy: { createdAt: 'asc' },
        include: {
          misureBottoniere: true,
          schizzi: { orderBy: { ordine: 'asc' } },
          allegati: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              schedaId: true,
              sezione: true,
              tipo: true,
              stato: true,
              didascalia: true,
              nomeOriginale: true,
              inStampa: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.intervento.findMany({ where: { aziendaId }, orderBy: { numero: 'asc' } }),
      prisma.cartello.findMany({ where: { aziendaId }, orderBy: { createdAt: 'asc' } }),
      prisma.calcoloArgano.findMany({ where: { aziendaId }, orderBy: { createdAt: 'asc' } }),
      prisma.verbale.findMany({ where: { aziendaId }, orderBy: { createdAt: 'asc' } }),
      prisma.auditLog.findMany({
        where: { aziendaId },
        orderBy: { at: 'asc' },
        select: {
          at: true,
          actorId: true,
          action: true,
          targetType: true,
          targetId: true,
          meta: true,
        },
      }),
    ]);
  const files: FileNelTar[] = [];
  const schedeJson = schede.map(({ allegati, ...scheda }) => ({
    ...scheda,
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
  const json = Buffer.from(
    JSON.stringify(
      {
        formato: 'rilievi-impianti/esportazione-1',
        esportatoIl: new Date().toISOString(),
        azienda: { ...datiAzienda, logo: logoFile?.nome ?? null },
        persone: persone.map((m) => ({ ...m.user, ruolo: m.role, nellAziendaDal: m.createdAt })),
        schede: schedeJson,
        interventi,
        cartelli,
        calcoliArgano,
        verbali,
        registro,
      },
      null,
      2,
    ),
    'utf8',
  );
  await writeAudit({
    actorId,
    action: 'AZIENDA_EXPORT',
    aziendaId,
    targetType: 'azienda',
    targetId: aziendaId,
    meta: { schede: schede.length, file: files.length },
  });
  const giorno = new Date().toISOString().slice(0, 10);
  return {
    nomeFile: `${radice(aziendaId)}-${giorno}.tar`,
    stream: Readable.from(contenuto(radice(aziendaId), json, logoFile, files)),
  };
}
