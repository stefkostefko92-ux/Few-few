import { writeAudit } from '../audit.js';
import { cifraSmtp, decifraSmtp } from '../auth/chiavi.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import type { ValoriPosta } from './posta-form.js';

/**
 * Откъде тръгват писмата (#32 — собственикът, 12 ноември 2026: „конфигурирам brevo сървъра за емайлите от Master
 * Account“): настройката от конзолата на MASTER (`PostaPortale`, ключът — шифрован), докато е включена; иначе
 * SMTP_* от средата; иначе нищо (поканите и връзките — на екрана). Помни се в паметта на процеса: зарежда се
 * при първата заявка (`assicuraPosta`) и се подменя при запис — `mailEnabled()` остава синхронна.
 */

export interface ParametriSmtp {
  host: string;
  port: number;
  secure: boolean;
  user: string | undefined;
  pass: string | undefined;
  from: string | { name: string; address: string };
  fonte: 'portale' | 'ambiente';
}

/** undefined — още не е четено; null — няма включена настройка в базата. */
let memoria: ParametriSmtp | null | undefined;
/** Сменя се при всяка нова настройка — транспортът на mailer.ts се прави наново. */
let versione = 0;

export const versionePosta = (): number => versione;

function daRiga(riga: {
  host: string;
  porta: number;
  utente: string;
  passwordEnc: string;
  mittenteNome: string;
  mittenteEmail: string;
}): ParametriSmtp | null {
  const pass = decifraSmtp(riga.passwordEnc);
  if (pass === null) {
    // Ключът не се разшифрова (сменен INTERVENTI_SEAL_KEY, ръчна промяна) — както без настройка.
    logger.error('пощата на портала: ключът не се разшифрова');
    return null;
  }
  return {
    host: riga.host,
    port: riga.porta,
    secure: riga.porta === 465,
    user: riga.utente,
    pass,
    from: { name: riga.mittenteNome, address: riga.mittenteEmail },
    fonte: 'portale',
  };
}

export async function caricaPosta(): Promise<void> {
  const riga = await prisma.postaPortale.findUnique({ where: { id: 'posta' } });
  memoria = riga?.attiva ? daRiga(riga) : null;
  versione += 1;
}

/**
 * Зарежда настройката веднъж (първата заявка, първото писмо). Базата не отговаря — до следващия опит важи
 * средата: страницата (и `/stato`) върви и без пощата от конзолата.
 */
export async function assicuraPosta(): Promise<void> {
  if (memoria !== undefined) return;
  try {
    await caricaPosta();
  } catch {
    logger.warn('пощата на портала: настройката не се прочете');
  }
}

/** Параметрите, с които тръгва писмо сега, или null — пощата не е включена. */
export function parametriSmtp(): ParametriSmtp | null {
  if (memoria) return memoria;
  const c = config();
  if (!c.SMTP_HOST) return null;
  return {
    host: c.SMTP_HOST,
    port: c.SMTP_PORT,
    secure: c.SMTP_SECURE,
    user: c.SMTP_USER && c.SMTP_PASS ? c.SMTP_USER : undefined,
    pass: c.SMTP_USER && c.SMTP_PASS ? c.SMTP_PASS : undefined,
    from: c.MAIL_FROM,
    fonte: 'ambiente',
  };
}

/** Има ли поща — от това зависи дали поканата тръгва по имейл, или само се показва за копиране. */
export const mailEnabled = (): boolean => parametriSmtp() !== null;

/** За страницата на конзолата: записаното (без ключа) и откъде тръгват писмата сега. */
export async function statoPosta() {
  await assicuraPosta();
  const riga = await prisma.postaPortale.findUnique({
    where: { id: 'posta' },
    select: {
      host: true,
      porta: true,
      utente: true,
      mittenteNome: true,
      mittenteEmail: true,
      attiva: true,
      updatedAt: true,
      updatedBy: { select: { name: true } },
    },
  });
  return { riga, fonte: parametriSmtp()?.fonte ?? null };
}

export const passwordSalvata = async (): Promise<boolean> =>
  (await prisma.postaPortale.count({ where: { id: 'posta' } })) > 0;

/** Записва и включва настройката; празен ключ — остава записаният. Одит без ключа и без логина. */
export async function salvaPosta(actorId: string, v: ValoriPosta): Promise<void> {
  const dati = {
    host: v.host,
    porta: v.porta,
    utente: v.utente,
    mittenteNome: v.mittenteNome,
    mittenteEmail: v.mittenteEmail,
    attiva: true,
    updatedById: actorId,
  };
  await prisma.$transaction(async (tx) => {
    const esiste = await tx.postaPortale.findUnique({
      where: { id: 'posta' },
      select: { id: true },
    });
    if (esiste) {
      await tx.postaPortale.update({
        where: { id: 'posta' },
        data: { ...dati, ...(v.password !== null ? { passwordEnc: cifraSmtp(v.password) } : {}) },
      });
    } else {
      if (v.password === null) throw new Error('posta: ключ без записан');
      await tx.postaPortale.create({ data: { ...dati, passwordEnc: cifraSmtp(v.password) } });
    }
    await writeAudit(
      {
        actorId,
        action: 'POSTA_IMPOSTATA',
        aziendaId: null,
        targetType: 'posta',
        targetId: 'posta',
        meta: { porta: v.porta, chiaveNuova: v.password !== null },
      },
      tx,
    );
  });
  await caricaPosta();
}

/** Изключва настройката от конзолата (остава записана): писмата — пак от средата, ако я има. */
export async function disattivaPosta(actorId: string): Promise<boolean> {
  const { count } = await prisma.postaPortale.updateMany({
    where: { id: 'posta', attiva: true },
    data: { attiva: false, updatedById: actorId },
  });
  if (count > 0) {
    await writeAudit({
      actorId,
      action: 'POSTA_DISATTIVATA',
      aziendaId: null,
      targetType: 'posta',
      targetId: 'posta',
    });
  }
  await caricaPosta();
  return count > 0;
}
