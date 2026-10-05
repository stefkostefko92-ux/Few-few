""""Proprietà intellettuale di Panev Ascensori SAS" in the catalogue, where the owner wants it (almost
everywhere): a line in the footer of every page but the cover, and a caption on every technical
drawing, near a corner. The renders of the 3D pages and of page 7 carry the caption from their
sheets (gen.py). The texts are set in Inter by Chromium on the stamp pages at the end of gen.pdf
(STAMPS in gen.py), and each is laid where it goes with show_pdf_page:
- "foot": after "MADE IN ITALY", on the pages with the catalogue's footer;
- "foot_light": alone at the same height, on the section covers (navy, no footer);
- "back": after the copyright line of the back page;
- "corner": the drawings' caption, in the free spot nearest to a corner of the drawing (place()).
merge.py calls apply() once the page labels are set; verify.py checks the result. Units: pt."""
import numpy as np
import pymupdf

TEXT = "Proprietà intellettuale di Panev Ascensori SAS"
INSET = 3  # the caption's least distance from the drawing's edges, as on the renders
REACH = 30  # how far outside a crowded drawing its caption may go (into the card's margin)
INK = 240  # darker than this (0-255) is something on the page: lines, text, the cards' light borders
MIN_AREA = 3000  # a drawing is at least this big; smaller images are icons and the header's logo
NOT_DRAWINGS = ("Copertina", "02", "Retro")  # the logo and the QR code, the patent certificate (a document)
DRAWINGS = 21  # left after inline.py: the assembly drawings (17 and the rigid arm's) and the patent's on pp. 03-04
COVERS = 6  # section covers: no footer


def has_footer(page):
    """The catalogue's footer: "MADE IN ITALY" at its place, bottom left."""
    return any(abs(w[0] - 34) < 1 and abs(w[1] - 579.2) < 1.5 for w in page.get_text("words"))


def drawings(page):
    """The technical drawings: pictures drawn on the page itself (the 3D renders are inside the sheets'
    forms and bring their own caption), not the emptied old images (1 x 1), MIN_AREA or more."""
    found = []
    for xref, _, width, height, *_, referencer in page.get_images(full=True):
        if referencer or width * height < 10000:
            continue
        found += [r for r in page.get_image_rects(xref) if r.get_area() >= MIN_AREA]
    return found


# Where a caption may go, cheapest first: (cost, x side, y side, distance from that side in x, in y); a side 1 is
# the right or the bottom. Inside the drawing, the bottom right corner first, then bottom left, top right, top left;
# outside it (a distance under INSET), only when there is no room inside.
SPOTS = sorted(
    (corner + (0 if min(dx, dy) >= INSET else 100) + abs(dx - INSET) + abs(dy - INSET), sx, sy, dx, dy)
    for corner, sx, sy in ((0, 1, 1), (20, 0, 1), (30, 1, 0), (40, 0, 0))
    for dx in range(-REACH, 46)
    for dy in range(-REACH, 36)
)


def place(page, drawing, box):
    """Where the caption of a drawing goes: box-sized, over nothing on the page (nor within 1 pt of it),
    at the cheapest of SPOTS. The page is looked at 1 px to the pt."""
    area = (drawing + (-REACH - box.width, -REACH - box.height, REACH + box.width, REACH + box.height)) & page.rect
    pm = page.get_pixmap(dpi=72, clip=area)
    ink = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, pm.n)[..., :3].mean(axis=2) < INK
    total = np.pad(ink.cumsum(0).cumsum(1), ((1, 0), (1, 0)))  # ink in any box by four lookups
    sx_, sy_ = pm.width / area.width, pm.height / area.height
    for _, sx, sy, dx, dy in SPOTS:
        x0 = drawing.x1 - dx - box.width if sx else drawing.x0 + dx
        y0 = drawing.y1 - dy - box.height if sy else drawing.y0 + dy
        spot = pymupdf.Rect(x0, y0, x0 + box.width, y0 + box.height)
        c0 = max(0, int((spot.x0 - 1 - area.x0) * sx_)), max(0, int((spot.y0 - 1 - area.y0) * sy_))
        c1 = int(np.ceil((spot.x1 + 1 - area.x0) * sx_)), int(np.ceil((spot.y1 + 1 - area.y0) * sy_))
        if c1[0] > pm.width or c1[1] > pm.height or spot.x0 - 1 < area.x0 or spot.y0 - 1 < area.y0:
            continue
        if total[c1[1], c1[0]] - total[c0[1], c1[0]] - total[c1[1], c0[0]] + total[c0[1], c0[0]] == 0:
            return spot
    raise SystemExit(f"notice: no room for the caption of the drawing at {drawing} on page {page.number + 1}")


def stamp(page, gen, stamps, kind, target=None):
    pno, clip = stamps[kind]
    clip = pymupdf.Rect(clip)
    page.show_pdf_page(target or clip, gen, pno, clip=clip)


def apply(doc, gen, stamps):
    covers = captions = 0
    box = pymupdf.Rect(stamps["corner"][1])
    for page in doc:
        label = page.get_label()
        if label == "Copertina":
            continue
        # The spots first: they are chosen on the page as it is, before any stamp.
        spots = [] if label in NOT_DRAWINGS else [place(page, d, box) for d in drawings(page)]
        if label == "Retro":
            stamp(page, gen, stamps, "back")
        elif has_footer(page):
            stamp(page, gen, stamps, "foot")
        else:
            stamp(page, gen, stamps, "foot_light")
            covers += 1
        for spot in spots:
            stamp(page, gen, stamps, "corner", spot)
        captions += len(spots)
    if covers != COVERS or captions != DRAWINGS:
        raise SystemExit(f"notice: {covers} pages without the footer ({COVERS} section covers expected), {captions} drawings ({DRAWINGS} expected)")
