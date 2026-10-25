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
 * PNG е без загуба, GIF пази анимацията. Грешка (повреден файл) → изключение:
 * оригиналът НИКОГА не се записва вместо обработената снимка.
 */
export async function stripImageMetadata(buf: Buffer, ext: ImageExt): Promise<Buffer> {
  if (ext === "gif") {
    // GIF няма EXIF ориентация; animated — пазим всички кадри.
    return sharp(buf, { animated: true, failOn: "error" }).gif().toBuffer();
  }
  const img = sharp(buf, { failOn: "error" }).rotate();
  if (ext === "jpg") return img.jpeg({ quality: 90 }).toBuffer();
  if (ext === "png") return img.png().toBuffer();
  return img.webp({ quality: 90 }).toBuffer();
}
