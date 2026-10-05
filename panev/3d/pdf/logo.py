"""The owner's logo (panev/img/brand/panev-ascensori-logo.webp) on every page of the catalogue:
- where the old one was (the white badge in the header bar, the white card on the cover and on the
  back): the old image is emptied and the new one takes its centre, SCALE times its height (the new
  drawing is squarer, so it comes out narrower and stays inside the white);
- on the six section covers, which had none: the header bar's badge with its shadow, copied from a
  product page, and the logo in it, where it stands on every other page.
merge.py calls apply() before it saves; verify.py checks the result. Units: pt."""
import io
import os
from collections import Counter
import numpy as np
import pymupdf
from PIL import Image

MASTER = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "img", "brand", "panev-ascensori-logo.webp")
OLD = (3333, 490)  # pixel size of the old logo image
SCALE = 1.2  # new logo height over the old one's
BADGE = pymupdf.Rect(28, 4, 152, 38)  # the header's white badge (33.8, 9, 144.8, 30.8) with its shadow
COVERS = 6  # section covers without a logo in the base catalogue


def image():
    """The master cut to its drawing: the colour as JPEG, white under the transparent parts (the
    logo only ever stands on white here, and JPEG would darken its rim towards black), and the alpha
    channel as the soft mask, the drawing's inside (250 to 253 in the master) made fully opaque.
    Returns (jpeg, mask png, (width, height))."""
    rgba = np.asarray(Image.open(MASTER).convert("RGBA"))
    x0, y0, x1, y1 = Image.fromarray(((rgba[..., 3] > 8) * 255).astype(np.uint8)).getbbox()
    rgba = rgba[y0:y1, x0:x1]
    rgb = np.where(rgba[..., 3:] == 0, 255, rgba[..., :3]).astype(np.uint8)
    alpha = np.where(rgba[..., 3] >= 245, 255, rgba[..., 3]).astype(np.uint8)
    jpg, png = io.BytesIO(), io.BytesIO()
    Image.fromarray(rgb).save(jpg, "JPEG", quality=92, subsampling=0, optimize=True)
    Image.fromarray(alpha).save(png, "PNG", optimize=True)
    return jpg.getvalue(), png.getvalue(), (x1 - x0, y1 - y0)


def old_logos(page):
    """(xref, rect) of every placement of the old logo on the page."""
    return [(img[0], r) for img in page.get_images(full=True) if (img[2], img[3]) == OLD for r in page.get_image_rects(img[0])]


def placed(old, size):
    """The new logo's rectangle for an old one: the same centre, SCALE times the height."""
    h = old.height * SCALE
    w = h * size[0] / size[1]
    c = (old.tl + old.br) / 2
    return pymupdf.Rect(c.x - w / 2, c.y - h / 2, c.x + w / 2, c.y + h / 2)


def badge(tpl, pno):
    """Page pno of the base catalogue with nothing left on it but the header's badge and its shadow:
    everything that reaches right of it or below the header bar goes (the bar, the page, the side tab),
    then the old logo's drawing (its "/Name Do") inside the badge."""
    doc = pymupdf.open()
    doc.insert_pdf(tpl, from_page=pno, to_page=pno)
    page = doc[0]
    for r in (pymupdf.Rect(BADGE.x1 + 10, 0, page.rect.x1, page.rect.y1), pymupdf.Rect(0, BADGE.y1 + 2, page.rect.x1, page.rect.y1)):
        page.add_redact_annot(r, fill=False)
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_REMOVE, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    names = [img[7] for img in page.get_images(full=True) if (img[2], img[3]) == OLD]
    streams = {x: doc.xref_stream(x) for x in page.get_contents()}
    for name in names:
        op = f"/{name} Do".encode()
        if sum(s.count(op) for s in streams.values()) != 1:
            raise SystemExit(f"logo: the old logo is drawn other than once on the badge template ({op})")
        streams = {x: s.replace(op, b"") for x, s in streams.items()}
        doc.xref_set_key(page.xref, f"Resources/XObject/{name}", "null")  # or the image comes along
    for x, s in streams.items():
        doc.update_stream(x, s)
    if old_logos(page) or page.get_text("text").strip():
        raise SystemExit("logo: the badge template still carries the old logo or text")
    return doc


def apply(doc, tpl):
    jpg, mask, size = image()
    olds = {page.number: old_logos(page) for page in doc}
    key = lambda r: tuple(round(v, 1) for v in r)
    common = Counter(key(r) for placements in olds.values() for _, r in placements).most_common(1)[0][0]
    header = next(r for placements in olds.values() for _, r in placements if key(r) == common)
    if not BADGE.contains(header):
        raise SystemExit(f"logo: the header's logo at {header} is not inside the badge {BADGE}")
    covers = [n for n, placements in olds.items() if not placements]
    if len(covers) != COVERS:
        raise SystemExit(f"logo: {len(covers)} pages without the old logo, {COVERS} section covers expected")
    template = next(i for i, p in enumerate(tpl) if any(key(r) == common for _, r in old_logos(p)))
    form = badge(tpl, template)

    xref = 0
    for n in range(doc.page_count):
        page = doc[n]
        rects = [placed(r, size) for _, r in olds[n]]
        if n in covers:
            page.show_pdf_page(BADGE, form, 0, clip=BADGE)
            rects = [placed(header, size)]
        for rect in rects:
            if xref:
                page.insert_image(rect, xref=xref)
            else:
                xref = page.insert_image(rect, stream=jpg, mask=mask)
    for old in {x for placements in olds.values() for x, _ in placements}:
        doc[next(n for n, placements in olds.items() if any(x == old for x, _ in placements))].delete_image(old)
    return xref
