// Pictures in the Word document: the media parts, their relationships and the DrawingML inline picture of each
// (ECMA-376 Part 1: wp:inline 20.4.2.8, pic:pic 20.2.2.5), at the size they print [mm]. Pure.

export const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
export const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
export const PIC_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
export const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

const EMU_PER_MM = 36000;

export interface Media {
  /** the part's name under word/ and the relationship's id */
  name: string;
  rel: string;
  data: Uint8Array;
}

/** The pictures of a document: `inline` adds one and returns its run; `media` lists the parts to pack. */
export function pictures(esc: (s: string) => string): { media: Media[]; inline(data: Uint8Array, mime: 'image/png' | 'image/jpeg', w: number, h: number, descr: string): string } {
  const media: Media[] = [];
  return {
    media,
    inline(data, mime, w, h, descr) {
      const k = media.length + 1, name = `media/image${k}.${mime === 'image/png' ? 'png' : 'jpeg'}`, rel = `rIdImg${k}`;
      media.push({ name, rel, data });
      const cx = Math.round(w * EMU_PER_MM), cy = Math.round(h * EMU_PER_MM), ext = `<a:ext cx="${cx}" cy="${cy}"/>`;
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`
        + `<wp:docPr id="${k}" name="Immagine ${k}" descr="${esc(descr)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`
        + `<a:graphic><a:graphicData uri="${PIC_NS}"><pic:pic><pic:nvPicPr><pic:cNvPr id="${k}" name="image${k}"/><pic:cNvPicPr/></pic:nvPicPr>`
        + `<pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
        + `<pic:spPr><a:xfrm><a:off x="0" y="0"/>${ext}</a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>`
        + '</wp:inline></w:drawing></w:r>';
    },
  };
}

/** Base64 to bytes, in the browser and in Node. */
export function fromBase64(s: string): Uint8Array {
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
