"""Checks dist/pdf/catalogo-staffe-panev-2026.pdf against the base catalogue:
- every base page renders pixel-identical (page 7: identical outside its two cards);
- every 3D page carries only its own text and links to the drawing page its label names;
- the outline and the index links still reach the same printed pages;
- the page labels are PDFDocEncoded."""
import os
import sys
import numpy as np
import pymupdf

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

cards = [pymupdf.Rect(140.6, 301.9, 400.9, 510.4), pymupdf.Rect(441.4, 301.9, 700.9, 510.4)]
for i, pos in enumerate(positions):
    a, b = pixels(base[i]), pixels(new[pos])
    if i == 6:
        s = 60 / 72
        for r in cards:
            a[int(r.y0 * s) - 1 : int(r.y1 * s) + 2, int(r.x0 * s) - 1 : int(r.x1 * s) + 2] = 0
            b[int(r.y0 * s) - 1 : int(r.y1 * s) + 2, int(r.x0 * s) - 1 : int(r.x1 * s) + 2] = 0
    if np.abs(a - b).max():
        problems.append(f"base page {i + 1} changed")

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
