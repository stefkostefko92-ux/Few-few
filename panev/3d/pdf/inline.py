"""The renders in the drawings' place (the owner's decision; see layout.py). On each inline product page
the drawing goes, the text of the card's title bar goes (and, on nine SU/SD/SC pages, the note that
spoke of the drawing), and the page's sheet from gen.pdf is laid over it: a white panel with the
renders, the new title, the note. Page 6 (printed 05) the same for its three figures and its texts.
A drawing goes by its "/Name Do" on that page only: the image object may serve another page (the
first application's figure is the patent's FIG. 1 on page 03, which stays), and the cards' shadows are
images too, so a redaction of images would take them as well. merge.py calls product() and p05()
before it inserts the 3D page. Units: pt."""
import pymupdf
import layout as L


def drop_image(page, xref):
    """The page stops drawing image xref; the image stays for any other page that shows it."""
    doc = page.parent
    streams = {x: doc.xref_stream(x) for x in page.get_contents()}
    for name in {img[7] for img in page.get_images(full=True) if img[0] == xref and not img[-1]}:
        op = f"/{name} Do".encode()
        if sum(s.count(op) for s in streams.values()) != 1:
            raise SystemExit(f"inline: page {page.number + 1} draws {name} other than once")
        streams = {x: s.replace(op, b"") for x, s in streams.items()}
        doc.xref_set_key(page.xref, f"Resources/XObject/{name}", "null")
    for x, s in streams.items():
        doc.update_stream(x, s)


def drawn_in(page, area):
    """The images drawn straight on the page inside area."""
    area = pymupdf.Rect(area) + (-2, -2, 2, 2)
    return [img[0] for img in page.get_images(full=True) if not img[-1] and any(area.contains(r) for r in page.get_image_rects(img[0]))]


def unwrite(page, rects):
    """Removes the text in rects, and nothing else."""
    for r in rects:
        page.add_redact_annot(pymupdf.Rect(r), fill=False)
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE, text=pymupdf.PDF_REDACT_TEXT_REMOVE)


def product(page, gen, pno, spec):
    """Product page `page`, its sheet at gen page pno: the drawing out, the renders in."""
    pan = spec["panel"]
    drawings = drawn_in(page, pan["inner"])
    if len(drawings) != 1:
        raise SystemExit(f"inline: page {page.number + 1} has {len(drawings)} drawings in its card, 1 expected")
    drop_image(page, drawings[0])
    note = pan["note"]
    unwrite(page, [pan["bar"]] + ([(note[0] - 1, note[1] - 1, pan["bar"][2], note[3] + 1)] if note else []))
    page.show_pdf_page(page.rect, gen, pno)


def p05(page, gen, pno):
    """Page 6 (printed 05): the three applications' figures and texts out, the renders and the new texts in."""
    for _, _, area, _, _ in L.P5:
        figures = drawn_in(page, area[:3] + (area[3] + 40,))  # the figure may reach below the render's area
        if len(figures) != 1:
            raise SystemExit(f"inline: {len(figures)} figures in the application at {area}, 1 expected")
        drop_image(page, figures[0])
    unwrite(page, L.P5_OLD)
    page.show_pdf_page(page.rect, gen, pno)
