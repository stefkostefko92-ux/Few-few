// Снимките (спецификация D10): формат по съдържание (JPEG/PNG/WebP), таван на пикселите, изправяне по EXIF,
// до 2560 px, JPEG mozjpeg 82, БЕЗ метаданни (sharp не ги пренася без withMetadata — GPS и модел изчезват),
// миниатюра 960 px за PDF-а и прегледа. Подходът е като в Rilievi (src/allegati/foto.ts).
import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";

export const LATO_FOTO = 2560;
export const LATO_MINI = 960;
export const MAX_BYTE = 15 * 1024 * 1024;
const MAX_PIXEL = 50_000_000;
const FORMATI = new Set(["jpeg", "png", "webp"]);

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

export async function elaboraFoto(input: Buffer): Promise<FotoElaborata> {
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
    const mini = await base().resize({ width: LATO_MINI, height: LATO_MINI, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    return { file, mini, larghezza: info.width, altezza: info.height, sha256: createHash("sha256").update(file).digest("hex") };
  } catch {
    throw new FotoNonValida("formato");
  }
}
