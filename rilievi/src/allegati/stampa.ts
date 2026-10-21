import { readFile } from 'node:fs/promises';
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

/**
 * Снимките в края на печата и PDF-а на картата — отметнатите в иконките в края на формата
 * (`inStampa`), само готовите (клиповете остават в портала). По разделите в реда на фирмата — и раздел,
 * изключен от печата или скрит от условие: отметнатата снимка излиза (решение на собственика);
 * „Impianto“ влиза (данните му са в главата на листа, снимките му — тук).
 */
export function fotoPerStampa<T extends { key: string }>(
  sections: readonly T[],
  allegati: readonly AllegatoVista[],
): Array<{ section: T; foto: AllegatoVista[] }> {
  return sections
    .map((section) => ({
      section,
      foto: allegati.filter(
        (a) => a.sezione === section.key && a.tipo === 'FOTO' && a.stato === 'PRONTO' && a.inStampa,
      ),
    }))
    .filter((gruppo) => gruppo.foto.length > 0);
}

export interface FotoPdf {
  /** Миниатюрата (до 960 px): за половин ширина на A4 е ~290 dpi, а PDF-ът остава лек. */
  immagine: Buffer;
  larghezza: number;
  altezza: number;
  didascalia: string | null;
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
              return { immagine, larghezza: width, altezza: height, didascalia: a.didascalia };
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
