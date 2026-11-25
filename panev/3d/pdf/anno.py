"""The catalogue's year, 2026 → 2027 (owner, 24.11.2026). The base prints it three times: the cover's
"Edizione 2026" (base page 0), the price list's "aggiornamento listino 2026" (printed 65) and the back's "© 2026"
(base page 67). Each of those lines is set again whole, the way ritocchi.py sets page 66's delivery times, in the
base's own face, size, colour and tracking (Inter 400: its digit widths match the base's to the third decimal), so
the text layer reads the year in place and a search finds it. The PDF keeps its file name: its address went to
customers (panev/CLAUDE.md). ritocchi.py carries these as one more kind of retouch: build() → sheet() → apply() →
check()."""
from html import escape
import pymupdf

OLD, NEW = "2026", "2027"
PAGES = (0, 65, 67)
ASCENT = 0.727  # Inter's baseline in a line box of line-height 1, as a share of the font size (as in ritocchi.py)

CSS = ".an-line { line-height: 1; white-space: pre; font-weight: 400; }\n"


def find(page):
    """Each line that prints OLD: its text, first origin, size, colour, tracking (pt) and box."""
    hits = []
    for b in page.get_text("rawdict")["blocks"]:
        for line in b.get("lines", []):
            chars = [c for s in line["spans"] for c in s["chars"]]
            text = "".join(c["c"] for c in chars)
            if OLD not in text:
                continue
            s0 = line["spans"][0]
            gaps = sorted(round(chars[k + 1]["origin"][0] - chars[k]["bbox"][2], 3) for k in range(len(chars) - 1)
                          if chars[k]["c"] not in " \u00a0" and chars[k + 1]["c"] not in " \u00a0")
            if any(abs(s["size"] - s0["size"]) > 0.01 or s["color"] != s0["color"] for s in line["spans"]):
                raise SystemExit(f"anno: page {page.number}'s year line mixes sizes or colours")
            hits.append(dict(text=text, x=chars[0]["origin"][0], y=chars[0]["origin"][1], size=s0["size"], color=s0["color"],
                             track=max(0.0, gaps[len(gaps) // 2]), line=list(line["bbox"])))
    return hits


def build(doc):
    """{base page: the year's place} for the three pages; stops if the base reads otherwise."""
    out = {}
    for n in PAGES:
        hits = find(doc[n])
        if len(hits) != 1:
            raise SystemExit(f"anno: base page {n} prints {OLD} {len(hits)} times, not once")
        out[n] = hits[0]
    return out


def sheet(y):
    top = y["y"] - y["size"] * ASCENT - 0.27
    return (f'<div class="abs an-line" style="left:{y["x"]:.2f}pt;top:{top:.2f}pt;font-size:{y["size"]:.3f}pt;'
            f'letter-spacing:{y["track"]:.3f}pt;color:#{y["color"]:06x}">{escape(y["text"].replace(OLD, NEW))}</div>')


def zone(y):
    """What changes on the page (verify.py masks it): the line's box, a hair wider."""
    return pymupdf.Rect(y["line"]) + (-0.8, -0.8, 1.5, 0.8)


def apply(page, y):
    """Takes the old line's text out; what is drawn behind it stays."""
    page.add_redact_annot(pymupdf.Rect(y["line"]) + (-0.3, 0.3, 0.3, -0.3), fill=False)
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    if page.get_text(clip=pymupdf.Rect(y["line"])).strip():
        raise SystemExit(f"anno: page {page.number} still has text where the year's line was")


def check(page, y):
    flat = lambda t: "".join(t.split())
    text = flat(page.get_text(clip=pymupdf.Rect(y["line"]) + (-0.5, -0.5, 1.5, 0.5)))
    want = flat(y["text"].replace(OLD, NEW))
    return [] if text == want else [f"page {page.get_label()}: the year's line reads {text!r}, not {want!r}"]
