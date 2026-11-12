import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { creaComunicazione } from '../master/comunicazioni.js';
import { giornoRoma } from '../master/tempo.js';
import type { SessionUser } from '../types.js';
import { DEFAULT_LOCALE, translate } from '../i18n.js';
import { dataEntrata, impostaAnnunci, versioneProssima, type TipoTesto } from './versioni.js';

/**
 * Обявата на нова версия (чл. 18.1 на условията; собственикът, 12 ноември 2026): MASTER я пуска от
 * „Contratti“ — ред в `AnnuncioTesto` (кога; не се трие) и съобщение до всички фирми с лента в портала и
 * писмо до всеки ADMIN (master/comunicazioni.ts) до деня, в който версията влиза. Обявите се зареждат в
 * паметта при старта, всеки час и след обява (versioni.ts ги чете синхронно).
 */
export async function caricaAnnunci(): Promise<void> {
  // Само завършените обяви (съобщението е тръгнало): провал по средата не пуска версията без известие.
  const righe = await prisma.annuncioTesto.findMany({
    where: { comunicazioneId: { not: null } },
    select: { tipo: true, versione: true, annunciatoAt: true },
  });
  impostaAnnunci(righe);
}

export type EsitoAnnuncio = 'ok' | 'gia' | 'nessuna';

const it = (key: string, params: Record<string, string | number> = {}) =>
  translate(DEFAULT_LOCALE, key, params);

/** Обява, която тече в момента (един процес) — второ натискане не праща второ съобщение. */
let inCorso = false;

/**
 * Обявява следващата версия на `tipo`; 'gia' — вече е обявена, 'nessuna' — няма следваща. Редът се пише
 * първо (с одита), съобщението — после; чак когато то е тръгнало, обявата е завършена (`comunicazioneId`)
 * и броят 30-те дни от сега. Ред без съобщение (прекъсната обява) се довършва при следващото натискане.
 */
export async function annunciaVersione(
  autore: SessionUser,
  tipo: TipoTesto,
  now = new Date(),
): Promise<EsitoAnnuncio> {
  const prossima = versioneProssima(tipo, now);
  if (!prossima) return 'nessuna';
  if (inCorso) return 'gia';
  inCorso = true;
  try {
    const chiave = { tipo_versione: { tipo, versione: prossima.versione } };
    const esistente = await prisma.annuncioTesto.findUnique({
      where: chiave,
      select: { comunicazioneId: true },
    });
    if (esistente?.comunicazioneId) return 'gia';
    if (!esistente) {
      await prisma.$transaction(async (tx) => {
        await tx.annuncioTesto.create({
          data: { tipo, versione: prossima.versione, annunciatoAt: now, autoreId: autore.id },
        });
        await writeAudit(
          {
            actorId: autore.id,
            action: 'CONDIZIONI_ANNUNCIATE',
            aziendaId: null,
            meta: { tipo, versione: prossima.versione },
          },
          tx,
        );
      });
    }
    // Денят на влизане, ако обявата завърши сега.
    const dal = dataEntrata(prossima.versione, now);
    const data = giornoRoma(dal);
    const { id, email } = await creaComunicazione(autore, {
      titolo: it('legale.annuncio.titolo', { data }),
      testo: it('legale.annuncio.testo', { data }),
      livello: 'AVVISO',
      aziendaIds: [],
      inizioAt: now,
      fineAt: dal,
      email: true,
    });
    await prisma.annuncioTesto.update({
      where: chiave,
      data: { comunicazioneId: id, emailInviate: email, annunciatoAt: now },
    });
    await caricaAnnunci();
    return 'ok';
  } finally {
    inCorso = false;
  }
}

/** Състоянието на обявата за страницата „Contratti“. */
export async function statoAnnuncio(tipo: TipoTesto, now = new Date()) {
  const prossima = versioneProssima(tipo, now);
  if (!prossima) return null;
  const riga = await prisma.annuncioTesto.findUnique({
    where: { tipo_versione: { tipo, versione: prossima.versione } },
    select: { annunciatoAt: true, emailInviate: true },
  });
  return { ...prossima, email: riga?.emailInviate ?? null };
}
