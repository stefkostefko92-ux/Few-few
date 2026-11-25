import { readFile } from 'node:fs/promises';
import type { Foglio } from '../schizzi/model.js';
import { annotazioniDa } from './annotazioni.js';
import sharp from 'sharp';
import type { Translator } from '../i18n.js';
import { SECTIONS, type SectionKey } from '../schede/fields.js';
import { sezioniOrdinate } from '../schede/ordine.js';
import { percorsi } from './archivio.js';
import type { AllegatoVista } from './service.js';

/** Всички раздели на картата в реда на фирмата, с имената им — групите на снимките. */
export function sezioniFoto(
  ordine: readonly string[],
  t: Translator,
): Array<{ key: SectionKey; title: string }> {
  return sezioniOrdinate(SECTIONS, ordine).map((section) => ({
    key: section.key,
    title: t(`scheda.section.${section.key}`),
  }));
}

/** Готова снимка (клиповете не се печатат). */
const pronta = (a: AllegatoVista) => a.tipo === 'FOTO' && a.stato === 'PRONTO';

/**
 * Редът в печата: снимките с избрано място (`ordineStampa`, „Stampa e PDF“ — собственикът, 10 ноември
 * 2026) първи, по него; после другите — по разделите в реда на фирмата и по реда на качване.
 */
function inOrdine<T extends { key: string }>(
  sections: readonly T[],
  foto: readonly AllegatoVista[],
): Array<{ section: T; foto: AllegatoVista }> {
  const fila = sections.flatMap((section) =>
    foto.filter((a) => a.sezione === section.key).map((a) => ({ section, foto: a })),
  );
  const posto = (a: AllegatoVista) => a.ordineStampa ?? Number.POSITIVE_INFINITY;
  return fila
    .map((voce, i) => ({ voce, i }))
    .sort((x, y) => posto(x.voce.foto) - posto(y.voce.foto) || x.i - y.i)
    .map(({ voce }) => voce);
}

/**
 * Снимките в края на печата и PDF-а на картата — отметнатите в иконките в края на формата
 * (`inStampa`), само готовите (клиповете остават в портала). В избрания ред (`inOrdine`) — и от раздел,
 * изключен от печата или скрит от условие: отметнатата снимка излиза (решение на собственика);
 * „Impianto“ влиза (данните му са в главата на листа, снимките му — тук). Групите са последователните
 * снимки от един раздел.
 */
export function fotoPerStampa<T extends { key: string }>(
  sections: readonly T[],
  allegati: readonly AllegatoVista[],
): Array<{ section: T; foto: AllegatoVista[] }> {
  const gruppi: Array<{ section: T; foto: AllegatoVista[] }> = [];
  for (const { section, foto } of inOrdine(
    sections,
    allegati.filter((a) => pronta(a) && a.inStampa),
  )) {
    const ultimo = gruppi.at(-1);
    if (ultimo && ultimo.section === section) ultimo.foto.push(foto);
    else gruppi.push({ section, foto: [foto] });
  }
  return gruppi;
}

/**
 * Редът на отметнатите във формата (`fotoOrdine`): id-тата в реда на печата. `scelte` — кои са отметнати
 * (пратените, когато формата се връща, иначе записаните).
 */
export function ordineScelte(
  sections: readonly { key: string }[],
  allegati: readonly AllegatoVista[],
  scelte: ReadonlySet<string>,
): string[] {
  return inOrdine(
    sections,
    allegati.filter((a) => pronta(a) && scelte.has(a.id)),
  ).map(({ foto }) => foto.id);
}

export interface FotoPdf {
  /** Миниатюрата (до 960 px): за половин ширина на A4 е ~290 dpi, а PDF-ът остава лек. */
  immagine: Buffer;
  larghezza: number;
  altezza: number;
  didascalia: string | null;
  /** Анотациите (C5) — нарисувани над снимката в PDF-а; липсват — без. */
  annotazioni?: Foglio | null;
}

export interface GruppoFotoPdf {
  titolo: string;
  foto: FotoPdf[];
}

/** Същото за PDF-а — с байтовете и размера на миниатюрите; липсващ файл се прескача (листът излиза). */
export async function fotoPerPdf(
  scheda: { id: string },
  sections: readonly { key: string; title: string }[],
  allegati: readonly AllegatoVista[],
): Promise<GruppoFotoPdf[]> {
  const gruppi = await Promise.all(
    fotoPerStampa(sections, allegati).map(async ({ section, foto }) => ({
      titolo: section.title,
      foto: (
        await Promise.all(
          foto.map(async (a): Promise<FotoPdf | null> => {
            try {
              const immagine = await readFile(percorsi({ ...a, schedaId: scheda.id }).mini);
              const { width, height } = await sharp(immagine).metadata();
              if (!width || !height) return null;
              return {
                immagine,
                larghezza: width,
                altezza: height,
                didascalia: a.didascalia,
                annotazioni: annotazioniDa(a.annotazioni),
              };
            } catch {
              return null;
            }
          }),
        )
      ).filter((f): f is FotoPdf => f !== null),
    })),
  );
  return gruppi.filter((gruppo) => gruppo.foto.length > 0);
}

/** Разделът е в листа: виждат го условията му и не е изключен в избора за печат. */
export function nelFoglioDi(
  attive: ReadonlySet<string>,
  escluse: readonly string[],
): (key: SectionKey) => boolean {
  return (key) => attive.has(key) && !escluse.includes(key);
}

export interface GruppoScelta {
  key: SectionKey;
  title: string;
  /** Разделът не е в листа (изключен в избора за печат или скрит от условие) — снимката пак излиза. */
  esclusa: boolean;
  foto: AllegatoVista[];
}

/**
 * Иконките за избор в края на формата: готовите снимки по разделите в реда на фирмата (клиповете не
 * се печатат). `nelFoglio` казва кой раздел е в листа — белегът на изключения (stampa-foto.js го следи
 * на живо, докато се отмята изборът на разделите).
 */
export function gruppiScelta(
  sections: readonly { key: SectionKey; title: string }[],
  allegati: readonly AllegatoVista[],
  nelFoglio: (key: SectionKey) => boolean,
): GruppoScelta[] {
  return sections
    .map((section) => ({
      ...section,
      esclusa: !nelFoglio(section.key),
      foto: allegati.filter(
        (a) => a.sezione === section.key && a.tipo === 'FOTO' && a.stato === 'PRONTO',
      ),
    }))
    .filter((gruppo) => gruppo.foto.length > 0);
}
