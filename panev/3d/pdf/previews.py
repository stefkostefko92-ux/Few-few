"""The site's previews of the catalogue (panev/img/catalogo/pagina-NN.webp, shown on the catalogue
page) made again from dist/pdf/catalogo-staffe-panev-2026.pdf: the same pages as the files already
there, NN being the page of the base catalogue (01 the cover), at 72 dpi like before (842 x 595).
Writes dist/pdf/catalogo/; they go to the site with the PDF (README)."""
import glob
import os
import re
import pymupdf
from PIL import Image

PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(PKG, "dist", "pdf")
SITE = os.path.join(os.path.dirname(PKG), "img", "catalogo")

doc = pymupdf.open(os.path.join(OUT, "catalogo-staffe-panev-2026.pdf"))
base_pages = pymupdf.open(os.path.join(OUT, "base.pdf")).page_count
os.makedirs(os.path.join(OUT, "catalogo"), exist_ok=True)
names = sorted(os.path.basename(f) for f in glob.glob(os.path.join(SITE, "pagina-*.webp")))
if not names:
    raise SystemExit(f"no previews in {SITE}")
for name in names:
    n = int(re.fullmatch(r"pagina-(\d+)\.webp", name).group(1))
    label = "Copertina" if n == 1 else "Retro" if n == base_pages else f"{n - 1:02d}"
    found = doc.get_page_numbers(label)
    if len(found) != 1:
        raise SystemExit(f"{name}: {len(found)} pages labelled {label}")
    pm = doc[found[0]].get_pixmap(dpi=72)
    Image.frombytes("RGB", (pm.width, pm.height), pm.samples).save(os.path.join(OUT, "catalogo", name), "WEBP", quality=80, method=6)
print(f"{os.path.join(OUT, 'catalogo')}: {len(names)} previews ({', '.join(names)})")
