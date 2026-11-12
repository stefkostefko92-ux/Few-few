import { mezzanotteRoma } from '../master/tempo.js';
import { businessDay } from '../time.js';

/**
 * Версиите на правните текстове (собственикът, 10 ноември 2026 — „Fai tutto in modo tale da essere
 * legalmente coperti e minimamente esposti“). Текстът на всяка версия е файл в `legale/` и не се пипа
 * никога: нов текст = нов файл + ред в `STORIA` + ред в теста (хешът), и всички го приемат наново.
 *
 * Нова версия влиза в сила САМО обявена (чл. 18.1 — в портала и по имейл до администраторите, поне 30
 * дни преди): в полунощ по Рим на по-късния от двата дни — своя ден или 30 дни след обявата (legale/
 * annunci.ts записва обявата и я зарежда тук). Без обява остава досегашната — сменя се сама, без деплой
 * в деня. Първата версия на всеки текст е в сила от своя ден.
 */

export type TipoTesto = 'CONDIZIONI' | 'REGOLE';

/** Дните предизвестие по чл. 18.1 на условията. */
export const PREAVVISO_GIORNI = 30;

/** Версиите на всеки текст, от най-старата; `versione` е и денят, от който може да влезе. */
export const STORIA: Readonly<Record<TipoTesto, readonly string[]>> = {
  CONDIZIONI: ['2026-11-10', '2026-11-12'],
  REGOLE: ['2026-11-10'],
};

/**
 * Версии, които влизат от своя ден без обява. 2026-11-12 (пробният месец, плановете, само четенето — чл. 12):
 * собственикът, 12 ноември 2026 — „Акаунтите са мои на всичките тестови фирми, не ми трябва да обявявам нищо …
 * Новите условия влизат в сила днес“. Предизвестието по чл. 18.1 пази клиентите, а клиенти отвън още няма
 * (Правният Разбирач: без външни фирми то няма на кого да служи). 2027-01-12 (Allegato B) не влиза никога:
 * целият ѝ текст е в 2026-11-12, а файлът ѝ остава непипнат. Нова версия оттук нататък — само обявена.
 */
export const SENZA_PREAVVISO: Readonly<Record<TipoTesto, readonly string[]>> = {
  CONDIZIONI: ['2026-11-12'],
  REGOLE: [],
};

export interface Annuncio {
  tipo: TipoTesto;
  versione: string;
  annunciatoAt: Date;
}

const annunci = new Map<string, Date>();
const chiave = (tipo: TipoTesto, versione: string) => `${tipo}:${versione}`;

/** Обявите от базата (legale/annunci.ts) — заместват досегашните в паметта. */
export function impostaAnnunci(righe: readonly Annuncio[]): void {
  annunci.clear();
  for (const r of righe) annunci.set(chiave(r.tipo, r.versione), r.annunciatoAt);
}

export const annuncioDi = (tipo: TipoTesto, versione: string): Date | null =>
  annunci.get(chiave(tipo, versione)) ?? null;

/** Откога влиза версия, обявена в момента `annuncio`: по-късният от своя ден и 30 дни след обявата. */
export function dataEntrata(versione: string, annuncio: Date): Date {
  const dalGiorno = mezzanotteRoma(versione);
  const dalPreavviso = mezzanotteRoma(businessDay(annuncio), PREAVVISO_GIORNI);
  return dalPreavviso > dalGiorno ? dalPreavviso : dalGiorno;
}

/**
 * Откога е в сила версията; null — още не е обявена (не влиза). `storia` — само за тестовете (бъдеща версия,
 * която още не съществува).
 */
export function inVigoreDal(
  tipo: TipoTesto,
  versione: string,
  storia: readonly string[] = STORIA[tipo],
): Date | null {
  if (storia[0] === versione || SENZA_PREAVVISO[tipo].includes(versione))
    return mezzanotteRoma(versione);
  const annuncio = annuncioDi(tipo, versione);
  return annuncio ? dataEntrata(versione, annuncio) : null;
}

/** Версията в сила в момента `now` — последната в `STORIA`, която вече е влязла. */
export function versioneVigente(
  tipo: TipoTesto,
  now: Date = new Date(),
  storia: readonly string[] = STORIA[tipo],
): string {
  let vigente = storia[0]!;
  for (const v of storia) {
    const dal = inVigoreDal(tipo, v, storia);
    if (dal && dal <= now) vigente = v;
  }
  return vigente;
}

/** Следващата версия след действащата (обявена или не); null — няма. */
export function versioneProssima(
  tipo: TipoTesto,
  now: Date = new Date(),
  storia: readonly string[] = STORIA[tipo],
): { versione: string; dal: Date | null; annunciataAt: Date | null } | null {
  const i = storia.indexOf(versioneVigente(tipo, now, storia));
  const versione = storia[i + 1];
  if (!versione) return null;
  return {
    versione,
    dal: inVigoreDal(tipo, versione, storia),
    annunciataAt: annuncioDi(tipo, versione),
  };
}

/** Действащите версии — четени при всяко обръщение, затова сменят деня сами. */
export const VERSIONE: Readonly<Record<TipoTesto, string>> = {
  get CONDIZIONI() {
    return versioneVigente('CONDIZIONI');
  },
  get REGOLE() {
    return versioneVigente('REGOLE');
  },
};

/** Денят на последната действаща версия на двата текста — за sitemap и JSON-LD на `/condizioni`. */
export function testiAggiornati(now: Date = new Date()): string {
  return [versioneVigente('CONDIZIONI', now), versioneVigente('REGOLE', now)].sort().at(-1) ?? '';
}

/** Колко години се пазят доказателствата (приемания и изтеглени изчисления) след събитието. */
export const ANNI_CONSERVAZIONE = 10;

interface Testo {
  articoli: ReadonlyArray<{ numero: string; titolo: string; paragrafi: readonly string[] }>;
  allegati: ReadonlyArray<{
    id: string;
    titolo: string;
    articoli: ReadonlyArray<{ numero: string; titolo: string; paragrafi: readonly string[] }>;
  }>;
}

export interface Modifica {
  numero: string;
  titolo: string;
  tipo: 'nuovo' | 'modificato' | 'eliminato';
}

/**
 * Какво се сменя между две версии — за обявата и страницата `/condizioni/prossima`: в членовете — по
 * алинея („2.4“, по номера в началото ѝ), в приложенията — по член („B.1“).
 */
export function modifiche(prima: Testo, dopo: Testo): Modifica[] {
  const voci = (t: Testo): Map<string, { titolo: string; testo: string }> => {
    const m = new Map<string, { titolo: string; testo: string }>();
    for (const a of t.articoli) {
      for (const p of a.paragrafi) {
        const numero = /^(\d{1,2}\.\d{1,2})\s/.exec(p)?.[1] ?? a.numero;
        const prima = m.get(numero);
        m.set(numero, { titolo: a.titolo, testo: (prima ? `${prima.testo}\n` : '') + p });
      }
    }
    for (const al of t.allegati) {
      for (const a of al.articoli)
        m.set(a.numero, { titolo: a.titolo, testo: a.paragrafi.join('\n') });
    }
    return m;
  };
  const a = voci(prima);
  const b = voci(dopo);
  const out: Modifica[] = [];
  for (const [numero, v] of b) {
    const vecchio = a.get(numero);
    if (!vecchio) out.push({ numero, titolo: v.titolo, tipo: 'nuovo' });
    else if (vecchio.testo !== v.testo) out.push({ numero, titolo: v.titolo, tipo: 'modificato' });
  }
  for (const [numero, v] of a) {
    if (!b.has(numero)) out.push({ numero, titolo: v.titolo, tipo: 'eliminato' });
  }
  return out;
}
