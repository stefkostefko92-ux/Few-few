import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";

// Папка за качените файлове. В Docker се монтира като том (виж docker-compose).
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

// Проверка по съдържание (magic bytes), не само по заявения от браузъра MIME —
// клиентският Content-Type е подаваем.
function sniffImage(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "jpg";
  if (
    buf.length >= 8 &&
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "png";
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "webp";
  if (
    buf.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(buf.subarray(0, 6).toString("ascii"))
  )
    return "gif";
  return null;
}

export function uploadDir(): string {
  return UPLOAD_DIR;
}

// Записва качено изображение и връща публичен адрес (/api/foto/<име>).
export async function saveUploadedImage(
  file: File,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!file || file.size === 0) return { ok: false, error: "Няма избран файл." };
  if (file.size > MAX_BYTES)
    return { ok: false, error: "Снимката е твърде голяма (максимум 8 MB)." };
  if (!ALLOWED[file.type])
    return { ok: false, error: "Позволени са само снимки (JPG, PNG, WEBP, GIF)." };

  const buf = Buffer.from(await file.arrayBuffer());
  // Разширението идва от реалното съдържание, не от клиентския MIME.
  const ext = sniffImage(buf);
  if (!ext)
    return { ok: false, error: "Файлът не изглежда като валидна снимка." };
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), buf);
  return { ok: true, url: `/api/foto/${name}` };
}

export const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};
