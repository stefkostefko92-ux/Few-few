import { promises as fs } from "fs";
import path from "path";
import { getImageProps } from "next/image";
import { UPLOADS_DIR } from "./storage";

// Responsive pictures: every photo on the page goes out as a srcset of widths,
// in AVIF or WebP (whichever the browser takes), through Next's optimizer — so
// a phone downloads a phone-sized file instead of the 1400 px original.

export type Dim = { width: number; height: number };
const dims = new Map<string, Dim | null>();

/** Real pixel size of a local picture (bundled or uploaded), read once. */
export async function imageSize(src: string): Promise<Dim | null> {
  if (dims.has(src)) return dims.get(src)!;
  let file: string | null = null;
  if (src.startsWith("/uploads/")) file = path.join(UPLOADS_DIR, path.basename(src));
  else if (src.startsWith("/assets/") && !src.includes("..")) file = path.join(process.cwd(), "public", src);
  let d: Dim | null = null;
  if (file) {
    try {
      const sharp = (await import("sharp")).default;
      const m = await sharp(await fs.readFile(file)).metadata();
      if (m.width && m.height) d = { width: m.width, height: m.height };
    } catch {
      d = null;
    }
  }
  dims.set(src, d);
  return d;
}

export type Responsive = { src: string; srcSet?: string; sizes?: string; width: number; height: number };

/** Props for a plain <img>: srcset + sizes + real dimensions. Falls back to the
 *  original file (and the given size) when the picture can't be read. */
export async function responsive(src: string, sizes: string, fallback: Dim): Promise<Responsive> {
  const d = (await imageSize(src)) ?? fallback;
  const { props } = getImageProps({ src, alt: "", width: d.width, height: d.height, sizes });
  return { src: props.src, srcSet: props.srcSet, sizes: props.sizes, width: d.width, height: d.height };
}
