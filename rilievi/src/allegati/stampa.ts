import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { percorsi } from './archivio.js';
import type { AllegatoVista } from './service.js';

/**
 * Снимките в края на печата и PDF-а на картата — само при отметката (`fotoStampate`) и само готовите
 * снимки (клиповете остават в портала). Подредени по разделите на листа — в реда на фирмата, без
 * изключените от печата; „Impianto“ влиза (данните му са в главата на листа, снимките му — тук).
 */
export function fotoPerStampa<T extends { key: string }>(
  scheda: { fotoStampate: boolean; sezioniEscluse: readonly string[] },
  sections: readonly T[],
  allegati: readonly AllegatoVista[],
): Array<{ section: T; foto: AllegatoVista[] }> {
  if (!scheda.fotoStampate) return [];
  return sections
    .filter((section) => !scheda.sezioniEscluse.includes(section.key))
    .map((section) => ({
      section,
      foto: allegati.filter(
        (a) => a.sezione === section.key && a.tipo === 'FOTO' && a.stato === 'PRONTO',
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
  scheda: { id: string; fotoStampate: boolean; sezioniEscluse: readonly string[] },
  sections: readonly { key: string; title: string }[],
  allegati: readonly AllegatoVista[],
): Promise<GruppoFotoPdf[]> {
  const gruppi = await Promise.all(
    fotoPerStampa(scheda, sections, allegati).map(async ({ section, foto }) => ({
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
