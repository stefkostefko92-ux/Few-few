// Чистата част от качването на снимки (без „server-only“ — за тестовете):
// разпознаване на формата по съдържанието и махане на метаданните.
import sharp from "sharp";

export type ImageExt = "jpg" | "png" | "webp" | "gif";

// Проверка по съдържание (magic bytes), не само по заявения от браузъра MIME —
// клиентският Content-Type е подаваем.
export function sniffImage(buf: Buffer): ImageExt | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "png";
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "webp";
  if (buf.length >= 6 && ["GIF87a", "GIF89a"].includes(buf.subarray(0, 6).toString("ascii")))
    return "gif";
  return null;
}

/**
 * Снимката без метаданни (GDPR): EXIF с GPS координатите, модела на телефона и
 * часа, XMP, IPTC, коментари. Снимка от телефон иначе издава къде е направена —
 * често у дома. Файлът се декодира и кодира наново: без `withMetadata()` sharp
 * не пише никакви метаданни (и превръща цветовете в sRGB). `.rotate()` без
 * ъгъл завърта пикселите по EXIF ориентацията — иначе, след като ориентацията
 * изчезне, снимката от телефона ляга настрани.
 *
 * Форматът се запазва (JPEG → JPEG и т.н.), качеството — 90 за JPEG/WebP;
 * PNG е без загуба, GIF и анимираното WebP пазят всички кадри. Грешка (повреден
 * файл, твърде много пиксели) → изключение: оригиналът НИКОГА не се записва
 * вместо обработената снимка.
 *
 * Памет: 1,5 MB JPEG може да е 16000×16000 — декодиран целият и завъртян, това
 * са гигабайти. Затова таван на пикселите преди декодиране (MAX_INPUT_PIXELS) и
 * смаляване до MAX_SIDE: при JPEG/WebP libvips тогава декодира направо в
 * по-малък размер (shrink-on-load), а за сайта по-голяма снимка не трябва.
 */
export const MAX_INPUT_PIXELS = 50_000_000;
export const MAX_SIDE = 3000;

export async function stripImageMetadata(buf: Buffer, ext: ImageExt): Promise<Buffer> {
  const opts = { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS } as const;
  const fit = { fit: "inside", withoutEnlargement: true } as const;
  if (ext === "gif" || ext === "webp") {
    const anim = sharp(buf, { ...opts, animated: true });
    const { pages = 1 } = await anim.metadata();
    // GIF няма EXIF ориентация; многокадрово изображение sharp не завърта —
    // пазим всички кадри, само ги смаляваме.
    if (ext === "gif" || pages > 1) {
      const r = anim.resize(MAX_SIDE, MAX_SIDE, fit);
      return ext === "gif" ? r.gif().toBuffer() : r.webp({ quality: 90 }).toBuffer();
    }
  }
  const img = sharp(buf, opts).rotate().resize(MAX_SIDE, MAX_SIDE, fit);
  if (ext === "jpg") return img.jpeg({ quality: 90 }).toBuffer();
  if (ext === "png") return img.png().toBuffer();
  return img.webp({ quality: 90 }).toBuffer();
}

/**
 * Пуска задачите една по една (опашка в паметта на процеса). Обработката на
 * снимка е тежка за паметта — няколко едновременни качвания не бива да се
 * събират върху сървъра наведнъж.
 */
export function createSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>) => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}
