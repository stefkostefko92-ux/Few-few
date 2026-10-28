"""The page boxes of the brochure's PDFs (build-brochure.mjs): Chromium sizes a page in hundredths of an inch, rounded up,
so the page comes out up to 0.25 mm larger than asked. This cuts the MediaBox to the exact size, keeping the top-left
corner where the content starts, and states the cut for the print shop: BleedBox = the page, TrimBox = the page less the
bleed. Also the document's author and subject. Needs PyMuPDF.

    python3 -I print/boxes.py <file.pdf> <width mm> <height mm> <bleed mm>
"""
import sys

import pymupdf

PT = 72 / 25.4


def main() -> None:
    path, width, height, bleed = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
    w, h, b = width * PT, height * PT, bleed * PT
    doc = pymupdf.open(path)
    for page in doc:
        top = page.mediabox.y1  # the MediaBox is in PDF space (y up): the content starts at its top
        if page.mediabox.width < w - 0.01 or page.mediabox.height < h - 0.01:
            raise SystemExit(f"{path}: page {page.number + 1} smaller than {width} x {height} mm")
        page.set_mediabox(pymupdf.Rect(0, top - h, w, top))
        # the other boxes are in page space (y down, origin top left)
        page.set_bleedbox(page.rect)
        page.set_trimbox(pymupdf.Rect(b, b, page.rect.x1 - b, page.rect.y1 - b))
    doc.set_metadata({**doc.metadata, "author": "Carbon Stealth VCC", "subject": "LiftPilot — software di progettazione ascensori"})
    doc.save(path, incremental=True, encryption=pymupdf.PDF_ENCRYPT_KEEP)


if __name__ == "__main__":
    main()
