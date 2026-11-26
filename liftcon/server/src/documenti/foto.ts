// Снимките (спецификация D10): формат по съдържание (JPEG/PNG/WebP), таван на пикселите, изправяне по EXIF,
// до 2560 px, JPEG mozjpeg 82, БЕЗ метаданни (sharp не ги пренася без withMetadata — GPS и модел изчезват),
// миниатюра 960 px за PDF-а и прегледа. Подходът е като в Rilievi (src/allegati/foto.ts).
import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";

export const LATO_FOTO = 2560;
export const LATO_MINI = 960;
export const MAX_BYTE = 15 * 1024 * 1024;
// Браузърът праща до 2560 px (~6,5 Mpx); таванът е за неочакваното — и за PNG „бомби“ от няколко KB.
const MAX_PIXEL = 40_000_000;
const FORMATI = new Set(["jpeg", "png", "webp"]);

// Паметта на контейнера е 512 MB: най-много 2 снимки се декодират едновременно, без кеш на libvips.
sharp.cache(false);
sharp.concurrency(2);
const MAX_PARALLELE = 2;
let attive = 0;
const coda: Array<() => void> = [];
async function conTurno<T>(fn: () => Promise<T>): Promise<T> {
  if (attive >= MAX_PARALLELE) await new Promise<void>((ok) => coda.push(ok));
  attive++;
  try {
    return await fn();
  } finally {
    attive--;
    coda.shift()?.();
  }
}

export class FotoNonValida extends Error {
  constructor(readonly codice: "formato" | "dimensioni") {
    super(codice === "formato" ? "formato non supportato" : "immagine troppo grande");
  }
}

export interface FotoElaborata {
  file: Buffer;
  mini: Buffer;
  larghezza: number;
  altezza: number;
  sha256: string;
}

export function elaboraFoto(input: Buffer): Promise<FotoElaborata> {
  return conTurno(() => elabora(input));
}

async function elabora(input: Buffer): Promise<FotoElaborata> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXEL }).metadata();
  } catch {
    throw new FotoNonValida("formato");
  }
  if (!meta.format || !FORMATI.has(meta.format)) throw new FotoNonValida("formato");
  if ((meta.width ?? 0) * (meta.height ?? 0) > MAX_PIXEL) throw new FotoNonValida("dimensioni");
  const base = () => sharp(input, { limitInputPixels: MAX_PIXEL }).rotate().flatten({ background: "#ffffff" }).toColourspace("srgb");
  try {
    const { data: file, info } = await base()
      .resize({ width: LATO_FOTO, height: LATO_FOTO, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    // Миниатюрата — от вече смалената снимка (второ декодиране на оригинала би удвоило паметта).
    const mini = await sharp(file).resize({ width: LATO_MINI, height: LATO_MINI, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    return { file, mini, larghezza: info.width, altezza: info.height, sha256: createHash("sha256").update(file).digest("hex") };
  } catch {
    throw new FotoNonValida("formato");
  }
}
