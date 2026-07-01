import { randomUUID } from "node:crypto";
import path from "node:path";

// Качване на изображения за блоковете Снимка/Галерия. Пазим на локален диск
// (UPLOAD_DIR, монтиран том в продукция) и сервираме през /uploads/<име>.
// Валидираме по МАГИЧНИ БАЙТОВЕ, не по подадения content-type (който се лъже),
// и умишлено НЕ приемаме SVG (носител на скриптове → XSS).

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export type ImageKind = "png" | "jpeg" | "webp" | "gif";

const EXT: Record<ImageKind, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
  gif: "gif",
};

const CONTENT_TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

// Разпознава типа по началните байтове. Връща null за непознат/неразрешен.
export function sniffImageType(buf: Uint8Array): ImageKind | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  // GIF: "GIF8"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "gif";
  // WEBP: "RIFF"...."WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function uploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
}

// Ново случайно име на файл (без потребителски вход в пътя → няма traversal).
export function newStoredName(kind: ImageKind): string {
  return `${randomUUID()}.${EXT[kind]}`;
}

// Content-type за сервиране по разширението на съхранения файл.
export function contentTypeForName(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPE[ext] ?? null;
}

// Позволено ли е името (само нашият формат: <uuid>.<ext>, без пътища/точки).
export function isSafeStoredName(name: string): boolean {
  return /^[a-f0-9-]{36}\.(png|jpg|jpeg|webp|gif)$/.test(name);
}
