"""The six section covers (printed 13, 19, 26, 39, 56, 60) show what the section holds: under the chips,
in the empty lower half of the navy page, a row of renders of the section's assemblies or parts, each with
its code and the page that shows it, a link to that page in the PDF. The section's own text, the big
number and its icon stay where they are. Like the summary's tiles (no caption: it does not fit; the
footer carries the notice). gen.py prints the sheets (sheet()), merge.py lays them over the covers
(apply()) and links the tiles (links()), verify.py checks them (check()). Units: pt."""
from html import escape
import pymupdf

# The section cover's printed page: the renders (an assembly "<first>+<second>" or a part), in the
# order of the section's pages; each tile's page is its first part's (src/catalog.js).
SECTIONS = {
    13: ["A-65-170-7+B-65-320", "A-45-170-7+B-45-320", "A-45-175-2+B-45-320", "A-37-150-7+B-37-320", "A-37-170-2+B-37-320"],
    19: ["SU-220-160+SG-80-150", "SU-220-180+SG-80-170", "SU-220-200+SG-80-190"],
    26: ["SD-150-160+SG-80-150", "SD-150-180+SG-80-170", "SD-150-200+SG-80-190", "SD-220-160+SG-80-150", "SD-220-180+SG-80-170", "SD-220-200+SG-80-190"],
    39: ["SC-50-200+SG-50-190", "SC-60-200+SG-60-190", "SC-80-200+SG-80-190", "SC-90-200+SG-80-190",
         "SC-50-220+SG-50-220", "SC-60-220+SG-60-220", "SC-80-220+SG-80-220", "SC-90-220+SG-80-220"],
    56: ["SG-50-130", "SG-60-170", "SG-80-220"],
    60: ["SC-50-170", "SG-225-50", "SN-60-65", "SN-65-200", "BRACCIO-160-190"],
}
X0, X1, GAP, MAX_H, BELOW, CLEAR = 74.0, 770.0, 9.0, 100.0, 30.0, 12.0  # the row: the text column's left edge, gaps, under the chips and the number
FLOOR = 556.0  # above the footer line (572)
NARROW = 100.0  # under this width a pairing's two codes do not fit on one line


def code(name):
    return " + ".join(p.replace("-", " ") for p in name.split("+"))


def build(base_pdf, catalogue, indicative):
    """Each cover's row: [{page (the cover's printed page), rect (the row), tiles [{render, code, page, rect,
    indicative}]}]. catalogue: [{code, page}] of src/catalog.js."""
    doc = pymupdf.open(base_pdf)
    page_of = {i["code"]: i["page"] for i in catalogue}
    out = []
    for cover, names in SECTIONS.items():
        page = doc[cover]
        # Under the chips' row and clear of the big number ("02" reaches further down and left than "01").
        chips = max(b[3] for b in page.get_text("blocks", clip=pymupdf.Rect(0, 150, 470, 560)))
        number = max(b[3] for b in page.get_text("blocks", clip=pymupdf.Rect(0, 150, 815, 560)))
        n = len(names)
        h = min(MAX_H, (X1 - X0 - (n - 1) * GAP) / n * 0.75)
        w, top = h / 0.75, max(chips + BELOW, number + CLEAR)
        if top + h > FLOOR:
            raise SystemExit(f"sezioni: page {cover}'s row runs into the footer ({top + h:.1f})")
        tiles = []
        for k, name in enumerate(names):
            first = code(name.split("+")[0])
            if first not in page_of:
                raise SystemExit(f"sezioni: {first} is not in src/catalog.js")
            # A narrow tile names the support alone: the pairing does not fit on a line and would hide the render.
            tiles.append(dict(render=name, code=first if w < NARROW else code(name), page=page_of[first], rect=(X0 + k * (w + GAP), top, w, h),
                              indicative=any(c in indicative for c in code(name).split(" + "))))
        if not all(cover < t["page"] < cover + 17 for t in tiles):
            raise SystemExit(f"sezioni: a tile of page {cover} points outside its section")
        row = (X0, top, X0 + n * w + (n - 1) * GAP, top + h)
        if page.get_text("text", clip=pymupdf.Rect(row)).strip() or page.get_images() and any(
                pymupdf.Rect(r).intersects(pymupdf.Rect(row)) for img in page.get_images(full=True) for r in page.get_image_rects(img[0])):
            raise SystemExit(f"sezioni: page {cover} is not empty where the row goes")
        out.append(dict(page=cover, rect=row, tiles=tiles))
    return out


CSS = """
.sez .shot { border: 0.6pt solid rgba(255, 255, 255, 0.3); }  /* no box-shadow: Chromium prints it as an image */
.sez .pg, .sez .ind { position: absolute; bottom: 5pt; border-radius: 2.5pt; line-height: 1.15; white-space: nowrap; font-size: 6pt; padding: 2.2pt 4.4pt 2pt; }
.sez .pg { right: 5pt; background: rgba(255, 255, 255, 0.9); color: #162862; font-weight: 700; }
.sez .ind { left: 5pt; background: rgba(99, 99, 95, 0.9); color: #fff; font-weight: 600; }
"""


def sheet(s, img):
    """One cover's row on a transparent page; img(render) is the render's file."""
    body = ""
    for t in s["tiles"]:
        x, y, w, h = t["rect"]
        extra = '<span class="ind">Forma indicativa</span>' if t["indicative"] else ""
        body += (f'<div class="abs shot" style="left:{x:.2f}pt;top:{y:.2f}pt;width:{w:.2f}pt;height:{h:.2f}pt"><img src="{img(t["render"])}" alt="">'
                 f'<div class="tags"><span class="c">{escape(t["code"])}</span></div>{extra}<span class="pg">p. {t["page"]}</span></div>')
    return f'<section class="sheet sez">{body}</section>'


def apply(doc, gen, data):
    """The rows over the covers (still at their base positions: merge.py calls this before inserting pages)."""
    for k, s in enumerate(data["pages"]):
        doc[s["page"]].show_pdf_page(doc[s["page"]].rect, gen, data["first"] + k)


def links(doc, data, order):
    """Each tile to its page, once every page is in place (order: what is at each position)."""
    for s in data["pages"]:
        page = doc[order.index(s["page"])]
        for t in s["tiles"]:
            x, y, w, h = t["rect"]
            page.insert_link({"kind": pymupdf.LINK_GOTO, "from": pymupdf.Rect(x, y, x + w, y + h), "page": order.index(t["page"]), "to": pymupdf.Point(0, 0)})


def check(doc, data):
    """Every tile's code and page on it, and one link from it to the page labelled with that page."""
    flat = lambda t: "".join(t.split()).upper()
    problems = []
    for s in data["pages"]:
        page = next(p for p in doc if p.get_label() == f"{s['page']:02d}")
        links = page.get_links()
        if len(links) != len(s["tiles"]):
            problems.append(f"section cover {s['page']}: {len(links)} links for {len(s['tiles'])} tiles")
        for t in s["tiles"]:
            x, y, w, h = t["rect"]
            r = pymupdf.Rect(x, y, x + w, y + h)
            want = flat(t["code"] + ("Forma indicativa" if t["indicative"] else "") + f"p. {t['page']}")
            hit = [lk for lk in links if abs(lk["from"].x0 - r.x0) < 0.5 and abs(lk["from"].y0 - r.y0) < 0.5]
            if flat(page.get_text(clip=r)) != want or len(hit) != 1 or doc[hit[0]["page"]].get_label() != f"{t['page']:02d}":
                problems.append(f"section cover {s['page']}: {t['code']} reads {flat(page.get_text(clip=r))}, links to {[doc[lk['page']].get_label() for lk in hit]}")
    return problems
