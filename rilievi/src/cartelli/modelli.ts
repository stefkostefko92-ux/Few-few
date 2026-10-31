import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { ROOT } from '../paths.js';

/**
 * Шаблоните на табелата „Avviso di fermo impianto“ (собственикът, 30 октомври 2026 — пет готови табели
 * без лого, „usa questi come bozze“): картинката на всяка (JPEG от PDF-а му, увеличен за печат —
 * assets/cartelli/, scripts/cartelli/README.md) и картата ѝ (JSON до нея) в пиксели на оригинала, от горе:
 * какво се изчиства (примерните дата, адрес, град, място, текстът към хората, примерният ред с дейността
 * и червената линия над него — всяка колона от пиксели се запълва плавно между фона над и под полето,
 * затова и преливането към снимката остава), къде отиват логото и данните на фирмата, четирите стойности
 * и текстът. Надписите и снимките на табелата остават — това е облеклото, което фирмата избира в
 * настройките си. Картинката е закрепена по SHA-256: друга картинка значи други координати, и процесът
 * отказва да тръгне. Изчистената се прави веднъж и остава в паметта.
 */

const DIR = join(ROOT, 'assets', 'cartelli');

const num = z.number().finite().min(0).max(4000);
/** Пикселите от горе (x0, y0) до долу (x1, y1), без последните. */
const box = z.tuple([num, num, num, num]);
const colore = z.string().regex(/^#[0-9a-f]{6}$/);
const dimensione = z.number().min(6).max(80);

const modelloSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z-]{1,30}$/),
    titolo: z.string().min(1).max(40),
    fonte: z.string().min(1),
    file: z.string().regex(/^[a-z-]+\.jpg$/),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    larghezza: z.number().int().min(100).max(4000),
    altezza: z.number().int().min(100).max(4000),
    /**
     * Картинката е `scala` пъти по-голяма от размера на картата (увеличена за печат, около 300 dpi на A4 —
     * scripts/cartelli/README.md); всички координати тук остават в пикселите на оригинала.
     */
    scala: z.number().int().min(1).max(4),
    /** Примерните данни на табелата — изчистват се (`pulita`). */
    copri: z.array(z.object({ rect: box }).strict()).min(1),
    /** Логото — вписано в кутията, вляво и по средата; `lastra` — бяла плочка под него (тъмна табела). */
    logo: z.object({ box, lastra: colore.optional() }),
    /** Данните на фирмата до логото — по ред, най-много четири, смаляват се до кутията. */
    azienda: z.object({ box, colore, dimensione }),
    /** Датата, адресът, градът и мястото — под надписите на табелата, x и ширината на всяка колона. */
    valori: z.object({
      y: num,
      dimensione,
      colore,
      colonne: z.array(z.tuple([num, num])).length(4),
    }),
    /** Текстът към хората: от първата базова линия надолу, `righe` реда през `riga`. */
    testo: z.object({
      x: num,
      y: num,
      larghezza: num,
      riga: z.number().min(5).max(100),
      righe: z.number().int().min(1).max(10),
      dimensione,
      colore,
    }),
    /** Надписи, написани наново (отрязаните в картинката на собственика — шаблонът „Blu tecnico“). */
    scritte: z.array(
      z.object({
        testo: z.string().min(1).max(120),
        x: num,
        y: num,
        larghezza: num,
        dimensione,
        colore,
        peso: z.enum(['normale', 'grassetto']),
      }),
    ),
  })
  .strict();

export type ModelloCartello = z.output<typeof modelloSchema>;

/** Редът на шаблоните в настройките; първият е по подразбиране. */
export const MODELLI_ID = ['rosso', 'giallo-nero', 'fuori-servizio', 'blu', 'grafite-oro'] as const;
export type ModelloId = (typeof MODELLI_ID)[number];

function load(id: ModelloId): ModelloCartello {
  const modello = modelloSchema.parse(JSON.parse(readFileSync(join(DIR, `${id}.json`), 'utf8')));
  if (modello.id !== id) throw new Error(`assets/cartelli/${id}.json: id ${modello.id}`);
  for (const { rect } of modello.copri) {
    const [x0, y0, x1, y1] = rect;
    // Редът над полето и редът под него трябва да са в картинката — от тях се запълва.
    if (!(x0 < x1 && x1 <= modello.larghezza && y0 >= 1 && y0 < y1 && y1 < modello.altezza - 1)) {
      throw new Error(`assets/cartelli/${id}.json: copri ${rect.join(',')} извън картинката`);
    }
  }
  return modello;
}

export const MODELLI: ReadonlyMap<ModelloId, ModelloCartello> = new Map(
  MODELLI_ID.map((id) => [id, load(id)]),
);

export const MODELLO_PREDEFINITO: ModelloId = 'rosso';

export function isModelloId(value: unknown): value is ModelloId {
  return typeof value === 'string' && (MODELLI_ID as readonly string[]).includes(value);
}

/** Шаблонът на фирмата: записаният, ако още го има, иначе първият (записът се чете с недоверие). */
export function modelloDi(value: unknown): ModelloCartello {
  return MODELLI.get(isModelloId(value) ? value : MODELLO_PREDEFINITO)!;
}

/** Картинката на шаблона, както е дошла — проверена по SHA-256. */
export function originale(modello: ModelloCartello): Buffer {
  const data = readFileSync(join(DIR, modello.file));
  const sha = createHash('sha256').update(data).digest('hex');
  if (sha !== modello.sha256)
    throw new Error(`assets/cartelli/${modello.file}: друга картинка (${sha})`);
  return data;
}

/**
 * Изчистването: всяка колона на полето се запълва между средния цвят на `bordo` реда над него и `bordo`
 * под него, по права линия — фонът (бял, сив, тъмен, преливащ) продължава, текстът го няма.
 */
export function pulisci(
  rgb: Uint8Array,
  width: number,
  height: number,
  rects: ReadonlyArray<readonly [number, number, number, number]>,
  bordo = 3,
): void {
  const at = (x: number, y: number, c: number) => rgb[(y * width + x) * 3 + c]!;
  const sopraDi = (y0: number) =>
    Array.from({ length: bordo }, (_, i) => y0 - 1 - i).filter((y) => y >= 0);
  const sottoDi = (y1: number) =>
    Array.from({ length: bordo }, (_, i) => y1 + i).filter((y) => y < height);
  for (const [x0, y0, x1, y1] of rects) {
    const righeSopra = sopraDi(y0);
    const righeSotto = sottoDi(y1);
    for (let x = x0; x < x1; x++) {
      const sopra = [0, 1, 2].map(
        (c) => righeSopra.reduce((sum, y) => sum + at(x, y, c), 0) / righeSopra.length,
      );
      const sotto = [0, 1, 2].map(
        (c) => righeSotto.reduce((sum, y) => sum + at(x, y, c), 0) / righeSotto.length,
      );
      for (let y = y0; y < y1; y++) {
        const t = (y - y0 + 1) / (y1 - y0 + 1);
        for (let c = 0; c < 3; c++) {
          rgb[(y * width + x) * 3 + c] = Math.round(sopra[c]! * (1 - t) + sotto[c]! * t);
        }
      }
    }
  }
}

const pulite = new Map<ModelloId, Promise<Buffer>>();

/** Шаблонът без примерните данни (JPEG) — прави се веднъж за процеса. */
export function immagineModello(modello: ModelloCartello): Promise<Buffer> {
  const id = modello.id as ModelloId;
  let pronta = pulite.get(id);
  if (!pronta) {
    pronta = (async () => {
      const { data, info } = await sharp(originale(modello))
        .removeAlpha()
        .toColourspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true });
      const k = modello.scala;
      if (
        info.width !== modello.larghezza * k ||
        info.height !== modello.altezza * k ||
        info.channels !== 3
      ) {
        throw new Error(`assets/cartelli/${modello.file}: ${info.width}×${info.height}`);
      }
      // Полетата са в пикселите на оригинала; картинката е `scala` пъти по-голяма.
      pulisci(
        data,
        info.width,
        info.height,
        modello.copri.map(({ rect }) => rect.map((v) => Math.round(v * k)) as typeof rect),
        3 * k,
      );
      return sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } })
        .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
        .toBuffer();
    })();
    pulite.set(id, pronta);
    // Неуспехът не остава в паметта — следващото искане опитва пак.
    pronta.catch(() => pulite.delete(id));
  }
  return pronta;
}

/** Проверка при старт: шаблоните са на мястото си и са точно картинките на картите си. */
export function assertModelliCartello(): void {
  for (const modello of MODELLI.values()) originale(modello);
}
