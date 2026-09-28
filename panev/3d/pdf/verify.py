"""Checks dist/pdf/catalogo-staffe-panev-2026.pdf against the base catalogue:
- every base page renders pixel-identical (page 7: identical outside its two cards), outside the
  logo's place (logo.py) and the intellectual property notice's (notice.py);
- every page shows the owner's logo exactly once, undistorted, inside its white badge or card, and
  the old logo nowhere;
- every page but the cover carries the notice in its footer, and every drawing and render its caption,
  where notice.py and gen.py put them, and nowhere else;
- every 3D page carries only its own text and links to the drawing page its label names;
- the outline and the index links still reach the same printed pages;
- the page labels are PDFDocEncoded."""
import json
import os
import sys
from collections import Counter
import numpy as np
import pymupdf
import layout as L
import logo
import notice

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "pdf")
base = pymupdf.open(os.path.join(OUT, "base.pdf"))
new = pymupdf.open(os.path.join(OUT, "catalogo-staffe-panev-2026.pdf"))
problems = []


def pixels(page, dpi=60):
    pm = page.get_pixmap(dpi=dpi)
    return np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width, pm.n).astype(int)


is3d = ["Vista 3D —" in p.get_text("text") for p in new]
positions = [i for i, flag in enumerate(is3d) if not flag]
if len(positions) != base.page_count:
    sys.exit(f"{len(positions)} base pages found, {base.page_count} expected")

def white(page, r):
    """The white badge or card under the rectangle r (the smallest white fill round it)."""
    fills = [d["rect"] for d in page.get_drawings() if d.get("fill") == (1.0, 1.0, 1.0) and (d.get("fill_opacity") or 1) > 0.9 and d["rect"].contains(r)]
    return min(fills, key=lambda f: f.width * f.height, default=pymupdf.Rect())


# The logo's place on each base page: the old one's place grown to the new one's (the section covers:
# the badge), left out of the pixel comparison; and the white it has to stay on. The section covers
# and the 3D pages take the header's badge, the most common one.
size = logo.image()[2]
olds = {pos: logo.old_logos(base[i]) for i, pos in enumerate(positions)}
zones = {pos: [r | logo.placed(r, size) for _, r in old] or [logo.BADGE] for pos, old in olds.items()}
whites = {pos: [white(base[i], r) for _, r in olds[pos]] for i, pos in enumerate(positions)}
badge = pymupdf.Rect(Counter(tuple(w) for ws in whites.values() for w in ws).most_common(1)[0][0])
# The notice on each base page (notice.py): the footer line, none on the cover, and the drawings' captions,
# placed on the base page as merge.py placed them on the page before its stamps. The drawings are the ones
# the new page still shows (page 7's two illustrations are gone: its renders bring their own caption).
data = json.load(open(os.path.join(OUT, "spec.json")))
stamps = {k: pymupdf.Rect(r) for k, (_, r) in data["stamps"].items()}
last = base.page_count - 1
lines = {pos: None if i == 0 else "back" if i == last else "foot" if notice.has_footer(base[i]) else "foot_light" for i, pos in enumerate(positions)}
labels = {pos: {0: "Copertina", last: "Retro"}.get(i, f"{i:02d}") for i, pos in enumerate(positions)}
spots = {pos: [] if labels[pos] in notice.NOT_DRAWINGS else [notice.place(base[i], d, stamps["corner"]) for d in notice.drawings(new[pos])] for i, pos in enumerate(positions)}
cards = [pymupdf.Rect(140.6, 301.9, 400.9, 510.4), pymupdf.Rect(441.4, 301.9, 700.9, 510.4)]
s = 60 / 72
for i, pos in enumerate(positions):
    a, b = pixels(base[i]), pixels(new[pos])
    for r in zones[pos] + (cards if i == 6 else []) + ([stamps[lines[pos]]] if lines[pos] else []) + spots[pos]:
        a[int(r.y0 * s) - 1 : int(r.y1 * s) + 2, int(r.x0 * s) - 1 : int(r.x1 * s) + 2] = 0
        b[int(r.y0 * s) - 1 : int(r.y1 * s) + 2, int(r.x0 * s) - 1 : int(r.x1 * s) + 2] = 0
    if np.abs(a - b).max():
        problems.append(f"base page {i + 1} changed")

for page in new:
    if logo.old_logos(page):
        problems.append(f"page {page.number + 1}: the old logo is still there")
    shown = [r for img in page.get_images(full=True) if (img[2], img[3]) == size for r in page.get_image_rects(img[0])]
    on = whites.get(page.number) or [badge]
    if len(shown) != 1 or not any((w + (-0.5, -0.5, 0.5, 0.5)).contains(shown[0]) for w in on):
        problems.append(f"page {page.number + 1}: the logo at {shown}, expected once on the white of {on}")
    elif abs(shown[0].width / shown[0].height - size[0] / size[1]) > 0.01:
        problems.append(f"page {page.number + 1}: the logo is distorted ({shown[0]})")

# The notice: the footer line where its stamp goes, the captions inside their drawings' spots, the 3D pages'
# renders (from spec.json, in the order of the pages) and page 7's; no caption anywhere else.
shots = iter([pymupdf.Rect(x, y, x + w, y + h) for x, y, w, h in (sh["rect"] for sh in p["shots"])] for p in sorted(data["pages"], key=lambda p: p["after"]))
compact = notice.TEXT.replace(" ", "").upper()
for page in new:
    line = lines.get(page.number, "foot")
    footer = page.get_text("text", clip=stamps[line] if line else page.rect).replace(" ", "").replace("\n", "").upper()
    if (compact in footer) != bool(line):
        problems.append(f"page {page.number + 1}: the notice {'missing from the footer' if line else 'on the cover'}")
    places = spots.get(page.number) if not is3d[page.number] else next(shots)
    if page.number == 6:
        places = [pymupdf.Rect(r) for _, r in L.P7]
    hits = [h for h in page.search_for(notice.TEXT) if h.y1 < 560]
    if len(hits) != len(places) or not all(any((p + (-0.5, -0.5, 0.5, 0.5)).contains(h) for h in hits) for p in places):
        problems.append(f"page {page.number + 1}: captions at {hits}, expected in {places}")

for pos in (p for p, flag in enumerate(is3d) if flag):
    page = new[pos]
    text = page.get_text("text")
    links = page.get_links()
    if len(links) != 1:
        problems.append(f"page {pos + 1}: {len(links)} links")
        continue
    target = new[links[0]["page"]].get_label()
    # Letter-spaced labels come out of the text layer with stray spaces: compare without them.
    ref = [t.replace(" ", "").upper() for t in text.split("\n") if t.replace(" ", "").upper().startswith("DISEGNITECNICI")]
    if not ref or f"PAG.{target}" not in ref[0]:
        problems.append(f"page {pos + 1}: link to {target}, label {ref}")
    compact = text.replace(" ", "").upper()
    for stale in ("PREZZO", "QUOTEINMM", "DISEGNOTECNICO", "€", "IVAESCLUSA"):
        if stale in compact:
            problems.append(f"page {pos + 1}: text of the product page left: {stale}")

for (_, title, pa), (_, tb, pb) in zip(base.get_toc(), new.get_toc()):
    if title != tb or new[pb - 1].get_label() != ("Copertina" if pa == 1 else f"{pa - 1:02d}"):
        problems.append(f"outline {title}: page {pa} -> {pb} ({new[pb - 1].get_label()})")
for la, lb in zip(base[1].get_links(), new[1].get_links()):
    if la.get("nameddest") != lb.get("nameddest") or new[lb["page"]].get_label() != f"{la['page']:02d}":
        problems.append(f"index link {la.get('nameddest')}: {la['page']} -> {lb['page']}")
if "\\302" in new.xref_get_key(new.pdf_catalog(), "PageLabels")[1]:
    problems.append("page labels are UTF-8, not PDFDocEncoding")

print(f"{new.page_count} pages: {sum(is3d)} 3D pages, {base.page_count} base pages compared")
if problems:
    sys.exit("\n".join(problems))
print("all checks passed")
