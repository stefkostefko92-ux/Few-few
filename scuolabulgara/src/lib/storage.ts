import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

// Uploaded files live on the VPS disk (persisted via a Docker volume). The
// directory is configurable; default keeps everything under ./data/uploads.
export const UPLOADS_DIR =
  process.env.UPLOADS_DIR || path.join(process.cwd(), "data", "uploads");

// Raster formats only. SVG is intentionally excluded: a same-origin SVG can
// carry script, so allowing uploads would be a stored-XSS vector. Brand SVGs
// live in the repo, not in user uploads.
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function isAllowedImage(mime: string): boolean {
  return ALLOWED.has(mime);
}

export async function ensureUploadsDir(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "image";
}

export type SavedImage = { filename: string; url: string; mime: string; size: number; width?: number; height?: number };

// Persist an uploaded image and return its metadata. Uses sharp for dimensions
// and to recompress raster images; SVG is stored as-is (after a basic check).
export async function saveImage(file: File): Promise<SavedImage> {
  if (!isAllowedImage(file.type)) throw new Error("Unsupported file type");
  await ensureUploadsDir();

  const buf = Buffer.from(await file.arrayBuffer());
  const id = crypto.randomBytes(5).toString("hex");
  const ext = EXT[file.type] || "bin";
  const filename = `${slugify(file.name)}-${id}.${ext}`;
  const dest = path.join(UPLOADS_DIR, filename);

  let width: number | undefined;
  let height: number | undefined;

  try {
    const sharp = (await import("sharp")).default;
    // limitInputPixels guards against decompression-bomb uploads.
    const img = sharp(buf, { failOn: "none", limitInputPixels: 50_000_000 });
    const meta = await img.metadata();
    width = meta.width;
    height = meta.height;
    // Cap very large uploads to a sensible max width while keeping the format.
    if (meta.width && meta.width > 2200) {
      const out = await img.resize({ width: 2200 }).toBuffer();
      await fs.writeFile(dest, out);
      width = 2200;
      height = meta.height ? Math.round((meta.height * 2200) / meta.width) : undefined;
    } else {
      await fs.writeFile(dest, buf);
    }
  } catch {
    await fs.writeFile(dest, buf);
  }

  const size = (await fs.stat(dest)).size;
  return { filename, url: `/uploads/${filename}`, mime: file.type, size, width, height };
}

export async function deleteUpload(filename: string): Promise<void> {
  const safe = path.basename(filename);
  await fs.rm(path.join(UPLOADS_DIR, safe), { force: true });
}

export async function readUpload(rel: string): Promise<{ data: Buffer; mime: string } | null> {
  // Prevent path traversal; only serve flat files from the uploads dir.
  const safe = path.basename(rel);
  const full = path.join(UPLOADS_DIR, safe);
  try {
    const data = await fs.readFile(full);
    const ext = path.extname(safe).slice(1).toLowerCase();
    const mimeByExt: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
    return { data, mime: mimeByExt[ext] || "application/octet-stream" };
  } catch {
    return null;
  }
}
