"""Merges the "Vista 3D" sheets (dist/pdf/gen.pdf) into the base catalogue (dist/pdf/base.pdf):
- page 7 (printed 06): the DX / SX line illustrations go, the renders take their place in the cards;
- after every product (after the assembly drawing for SU/SD/SC) a 3D page is inserted: a copy of
  the product page keeps its header, side tab and footer, its body is removed by redaction and the
  sheet is laid over it, with a link back to the technical drawing;
- page labels follow the printed numbers ("14", "14 · 3D", ...).
Every other page stays as it is: drawings, dimensions, ranges, tables and prices.
Writes dist/pdf/catalogo-staffe-panev-2026.pdf."""
import json
import os
import pymupdf

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "pdf")
spec = json.load(open(os.path.join(OUT, "spec.json")))["pages"]
gen = pymupdf.open(os.path.join(OUT, "gen.pdf"))
doc = pymupdf.open(os.path.join(OUT, "base.pdf"))
tpl = pymupdf.open(os.path.join(OUT, "base.pdf"))  # untouched copy: templates of the inserted pages
n_base = doc.page_count
if gen.page_count != len(spec) + 1:
    raise SystemExit("gen.pdf does not match spec.json: run gen.py and print.mjs again")

# Page 7: remove the two line illustrations, lay the renders over the cards.
p06 = doc[6]
drawings = [i for i in p06.get_image_info(xrefs=True) if i["xref"] and 300 <= i["bbox"][1] <= 320]
if len(drawings) != 2:
    raise SystemExit(f"page 7: expected the 2 DX / SX illustrations, found {len(drawings)}")
for info in drawings:
    p06.delete_image(info["xref"])
p06.show_pdf_page(p06.rect, gen, gen.page_count - 1)

BODY = pymupdf.Rect(0, 40.5, 815.5, 569.5)  # below the header bar, above the footer, left of the side tab
PAGENO = pymupdf.Rect(780, 575, 815, 591)
LINK = pymupdf.Rect(560, 538, 802.2, 562)  # "Disegni tecnici · pag. NN"

order = list(range(n_base))  # base index at each final position; None marks an inserted page
for k, page_spec in sorted(enumerate(spec), key=lambda t: -t[1]["after"]):  # from the back: earlier indices stay put
    at = page_spec["after"]  # 1-based page it follows == 0-based position of the new page
    doc.insert_pdf(tpl, from_page=page_spec["src"] - 1, to_page=page_spec["src"] - 1, start_at=at, links=False, annots=False)
    page = doc[at]
    page.add_redact_annot(BODY)
    page.add_redact_annot(PAGENO)
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_REMOVE, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    if page.get_text("text", clip=BODY).strip():
        raise SystemExit(f"page after {at}: text of the product page left in the body")
    page.show_pdf_page(page.rect, gen, k)
    page.insert_link({"kind": pymupdf.LINK_GOTO, "from": LINK, "page": page_spec["refs"][0][0] - 1, "to": pymupdf.Point(0, 0)})
    order.insert(at, None)

base_labels = {i: "Copertina" if i == 0 else "Retro" if i == n_base - 1 else f"{i:02d}" for i in range(n_base)}
added = iter(p["label"] for p in sorted(spec, key=lambda p: p["after"]))
labels = [base_labels[i] if i is not None else next(added) for i in order]
for pos, lab in enumerate(labels):
    if lab.endswith(" · 3D") and lab != f"{labels[pos - 1]} · 3D":
        raise SystemExit(f"label {lab} follows {labels[pos - 1]}")
doc.set_page_labels([{"startpage": pos, "prefix": lab, "style": "", "firstpagenum": 1} for pos, lab in enumerate(labels)])
# PyMuPDF writes the prefix as UTF-8 bytes; PDF text strings want PDFDocEncoding, where "·" is 0xB7.
kind, value = doc.xref_get_key(doc.pdf_catalog(), "PageLabels")
doc.xref_set_key(doc.pdf_catalog(), "PageLabels", value.replace("\\302\\267", "\\267"))

out = os.path.join(OUT, "catalogo-staffe-panev-2026.pdf")
doc.save(out, garbage=4, deflate=True)
print(f"{out}: {doc.page_count} pages ({doc.page_count - n_base} added), {os.path.getsize(out) / 1e6:.1f} MB")
