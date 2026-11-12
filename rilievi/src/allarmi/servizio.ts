import { writeAudit } from '../audit.js';
import { cifraAllarmi, decifraAllarmi } from '../auth/chiavi.js';
import { config, isProduction } from '../config.js';
import { prisma } from '../db.js';
import { DEFAULT_LOCALE, translatorFor } from '../i18n.js';
import { errorMessage, logger } from '../logger.js';
import { inviaDiscord, puoPartire, type TipoAllarme } from './discord.js';

/**
 * Алармите на портала към Discord (собственикът, 12 ноември 2026): адресът на webhook-а се настройва в конзолата
 * на MASTER (`/master/allarmi`), пази се шифрован и само се пише. Съобщението носи вида на събитието, броя и
 * връзка към конзолата — НИКОГА име, имейл, фирма или свободен текст (така не е обработване на лични данни и
 * Discord не е получател по чл. 13 GDPR). Алармата не чака и не проваля работата, която я праща.
 */
const t = translatorFor(DEFAULT_LOCALE);

/** Къде води връзката на всеки вид. */
const PAGINA: Record<TipoAllarme, string> = {
  prova: '/master/allarmi',
  manutenzione: '/master',
  pagamentoDaVerificare: '/master/pagamenti',
  contestazione: '/master/pagamenti#h-contestazioni',
  rimborsoFallito: '/master/pagamenti#h-rimborsi',
  posta: '/master/posta',
  segnalazione: '/master/segnalazioni',
};

/** Адресът е в паметта за минута: алармата не пита базата всеки път; записът от конзолата го сменя веднага. */
let memo: { fino: number; url: string | null } | null = null;
const ultimi = new Map<TipoAllarme, number>();

const base = (): string | undefined =>
  isProduction() ? undefined : (config().DISCORD_API_BASE ?? undefined);

export async function leggiAllarmi() {
  const riga = await prisma.configAllarmi.findUnique({
    where: { id: 'discord' },
    include: { updatedBy: { select: { name: true } } },
  });
  return {
    attivo: riga?.attivo ?? false,
    haUrl: Boolean(riga?.urlEnc),
    updatedAt: riga?.updatedAt ?? null,
    updatedBy: riga?.updatedBy?.name ?? null,
  };
}

async function urlAttivo(): Promise<string | null> {
  const adesso = Date.now();
  if (memo && memo.fino > adesso) return memo.url;
  const riga = await prisma.configAllarmi.findUnique({ where: { id: 'discord' } });
  const url = riga?.attivo && riga.urlEnc ? decifraAllarmi(riga.urlEnc) : null;
  memo = { fino: adesso + 60_000, url };
  return url;
}

/** Записва настройката; `url` null — остава записаният адрес. Одит без адреса. */
export async function salvaAllarmi(
  actorId: string,
  v: { attivo: boolean; url: string | null },
): Promise<'ok' | 'senzaUrl'> {
  const esistente = await prisma.configAllarmi.findUnique({ where: { id: 'discord' } });
  if (v.attivo && !v.url && !esistente?.urlEnc) return 'senzaUrl';
  const dati = {
    attivo: v.attivo,
    updatedById: actorId,
    ...(v.url !== null ? { urlEnc: cifraAllarmi(v.url) } : {}),
  };
  await prisma.$transaction(async (tx) => {
    await tx.configAllarmi.upsert({ where: { id: 'discord' }, create: dati, update: dati });
    await writeAudit(
      {
        actorId,
        action: 'ALLARMI_IMPOSTATI',
        aziendaId: null,
        targetType: 'allarmi',
        targetId: 'discord',
        meta: { attivo: v.attivo, urlNuovo: v.url !== null },
      },
      tx,
    );
  });
  memo = null;
  return 'ok';
}

const testo = (tipo: TipoAllarme, n: number): string =>
  t(`allarmi.testo.${tipo}`, { n, link: `${config().PUBLIC_BASE_URL}${PAGINA[tipo]}` });

/** Пробното съобщение от конзолата: чака потвърждението на Discord и връща кода му. */
export async function provaAllarmi(): Promise<number | 'rete' | 'spenti'> {
  memo = null;
  const url = await urlAttivo();
  if (!url) return 'spenti';
  return inviaDiscord(url, testo('prova', 1), { base: base(), attendi: true });
}

/**
 * Праща аларма, ако алармите са включени и видът не е в пауза. Не хвърля и не се чака (`void allarme(…)`):
 * неуспехът отива само в лога — без адреса.
 */
export async function allarme(tipo: TipoAllarme, n = 1): Promise<void> {
  try {
    const url = await urlAttivo();
    if (!url || !puoPartire(ultimi, tipo, Date.now())) return;
    const esito = await inviaDiscord(url, testo(tipo, n), { base: base() });
    if (esito === 'rete' || esito >= 300) {
      // Неизпратената не се брои за пауза: следващото събитие опитва пак.
      ultimi.delete(tipo);
      logger.warn(
        { evento: 'allarme.non_inviato', tipo, esito },
        'allarme: Discord non ha risposto',
      );
    }
  } catch (error) {
    logger.error({ evento: 'allarme.errore', tipo, err: errorMessage(error) }, 'allarme: errore');
  }
}
