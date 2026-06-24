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
  const ext = ALLOWED[file.type];
  if (!ext)
    return { ok: false, error: "Позволени са само снимки (JPG, PNG, WEBP, GIF)." };

  const buf = Buffer.from(await file.arrayBuffer());
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
