"""Retouches of base pages whose content ran off the page or was cut short (slips of the original layout),
re-typeset in place the way indice.py does for the index:
- printed 04 "Anatomia della staffa": the legend's fourth row ("21 · 22") sat under the footer; the rows
  come closer together and all ten items show;
- printed 63 "Confronto dei sistemi": the adjustable systems' table ran off the page after SC 50 220
  (SC 60 220 under the footer, SC 80 220 and SC 90 220 not on the page at all); the whole table is set at
  a tighter pitch, each row read from the base table and checked against its product page, the missing
  ones read from their product pages (title, "Range regolazione");
- the side tabs whose label was cut at 16 characters ("AZIENDA · QUALIT", "QUADRO COMPARATI", ...): a
  whole short word, in the pill of a page whose label is as long.
gen.py prints one sheet per retouched page (sheet()), merge.py applies them on the base pages (apply()),
verify.py checks them (check()). Units: pt."""
import re
from html import escape
import pymupdf
import summary as S

NAVY, STEEL = (0.0863, 0.1569, 0.3843), (0.5294, 0.5294, 0.5255)
ASCENT = 0.727  # Inter's baseline in a line box of line-height 1, as a share of the font size
# Base page -> (the tab's new label, the base page whose pill is as long: BRACCIO, CODICI, GLOSSARIO).
TABS = {7: ("Azienda", 62), 8: ("Scelta", 64), 9: ("Materiali", 12), 63: ("Confronto", 12), 66: ("Termini", 62)}
LEGEND, LEG_AREA, LEG_HIDDEN, LEG_PITCH, LEG_RULE = 4, pymupdf.Rect(40, 444, 800, 569.5), pymupdf.Rect(40, 569.5, 300, 579.0), 28.6, 23.4
TABLE, TAB_AREA, TAB_HIDDEN = 63, pymupdf.Rect(44, 162.5, 405, 569.8), pymupdf.Rect(40, 569.8, 378, 578.8)
HEAD_H, SERIES_H, ROW_H, INSET = 20.0, 16.5, 19.0, 8.85
CONFIG = re.compile(r"^(S[UDC] \d+ \d+) · (SG \d+ \d+)$")


def close(a, b):
    return all(abs(x - y) < 0.01 for x, y in zip(a, b))


def pill(page):
    """The side tab's pill on a base page: opaque and navy (its soft shadow is the same navy at a quarter;
    the assembly pages' pill is slate)."""
    found = [d["rect"] for d in page.get_drawings() if d["rect"].x0 > 820 and d["rect"].height > 40 and d.get("fill") and close(d["fill"], NAVY) and (d.get("fill_opacity") or 1) > 0.9]
    if len(found) != 1:
        raise SystemExit(f"ritocchi: page {page.number} has {len(found)} navy side tabs")
    return found[0]


def lines(page, clip):
    out = []
    for b in page.get_text("dict", clip=clip)["blocks"]:
        for line in b.get("lines", []):
            s = line["spans"]
            text = "".join(x["text"] for x in s).strip()
            if text:
                out.append(dict(text=text, x=s[0]["origin"][0], y=s[0]["origin"][1], size=s[0]["size"], color=s[0]["color"], bbox=line["bbox"]))
    return out


def legend(doc):
    """The ten items of page 04's legend, each at its new place: badge (rect, colour, number), title, text."""
    page = doc[LEGEND]
    text = lines(page, pymupdf.Rect(40, 444, 800, 600))
    badges = sorted((d for d in page.get_drawings() if 440 < d["rect"].y0 < 600 and abs(d["rect"].height - 18.8) < 0.5 and d.get("fill") and (close(d["fill"], NAVY) or close(d["fill"], STEEL))),
                    key=lambda d: (round(d["rect"].y0), d["rect"].x0))
    rules = [d["rect"] for d in page.get_drawings() if 440 < d["rect"].y0 < 600 and d["rect"].height < 1 and 200 < d["rect"].width < 300]
    top = badges[0]["rect"].y0
    items = []
    for b in badges:
        r = b["rect"]
        row = round((r.y0 - top) / 39)
        dy = top + row * LEG_PITCH - r.y0
        inside = [t for t in text if r.x0 < t["x"] < r.x1 and r.y0 < t["y"] < r.y1]
        right = sorted((t for t in text if 0 < t["x"] - r.x1 < 12 and r.y0 - 2 < t["bbox"][1] < r.y1), key=lambda t: t["y"])
        if len(inside) != 1 or len(right) != 2:
            raise SystemExit(f"ritocchi: legend item at {r} reads {inside} / {right}")
        col = max((x for x in (45.0, 303.0, 561.0) if x <= r.x0 + 0.1))
        items.append(dict(old=tuple(r), badge=(r.x0, r.y0 + dy, r.width, r.height), steel=close(b["fill"], STEEL), num=inside[0]["text"],
                          title=(right[0]["text"], right[0]["x"], right[0]["y"] + dy), desc=(right[1]["text"], right[1]["x"], right[1]["y"] + dy),
                          rule=(col, r.y0 + dy + LEG_RULE, 235.5), rect=(col, r.y0 + dy - 1.5, col + 235.5, r.y0 + dy + 20.5)))
    if len(items) != 10 or len(rules) != 10 or max(i["rect"][3] for i in items) > 562:
        raise SystemExit(f"ritocchi: the legend has {len(items)} items and {len(rules)} rules")
    return dict(items=items, rules=[tuple(r) for r in rules])


def table(doc):
    """Page 63's table of the adjustable systems, whole: [(series label | None, cells)] with each line's y and
    height, the columns' x. The base rows must say what their product pages say; the rows it lost come from theirs."""
    page = doc[TABLE]
    cols = sorted({round(d["rect"].x0, 1) for d in page.get_drawings() if abs(d["rect"].y0 - 163.5) < 0.2 and d["rect"].x0 < 420} | {404.2})
    text = sorted(lines(page, pymupdf.Rect(40, 160, 410, 600)), key=lambda t: (round(t["y"]), t["x"]))
    by_y = {}
    for t in text:
        by_y.setdefault(round(t["y"]), []).append(t["text"])
    rows = list(by_y.values())
    head, base = rows[0], rows[1:]
    if len(cols) != 6 or len(head) != 5:
        raise SystemExit(f"ritocchi: the comparison table's header reads {head} over {cols}")
    thick, shown = {}, {}
    for r in base:
        if len(r) == 5:
            thick.setdefault(r[0][:2], r[3])
            shown[r[0]] = r
    series = [r[0] for r in base if len(r) == 1]
    out, added = [], []
    for label in series:
        out.append((label, None))
        for n in range(1, doc.page_count - 1):
            title = next((m for m in (CONFIG.match(t.strip()) for t in doc[n].get_text().split("\n")) if m), None)
            if not title or f"SERIE {title[1][:2]} + SG" != label:
                continue
            flat = [t.strip() for t in doc[n].get_text().split("\n") if t.strip()]
            rng = flat[next(k for k, t in enumerate(flat) if t.replace(" ", "").upper() == "RANGEREGOLAZIONE") + 1]
            row = [title[1], title[2], rng, thick[title[1][:2]], f"p. {n}"]
            if title[1] in shown and shown[title[1]] != row:
                raise SystemExit(f"ritocchi: the comparison table says {shown[title[1]]}, page {n} says {row}")
            if title[1] not in shown:
                added.append(title[1])
            out.append((None, row))
    if len([1 for s, _ in out if s is None]) != 17 or len(shown) + len(added) != 17:
        raise SystemExit(f"ritocchi: {len(out)} lines in the comparison table, {len(shown)} in the base")
    y, placed = 163.5 + HEAD_H, []
    for label, cells in out:
        h = SERIES_H if label else ROW_H
        placed.append(dict(series=label, cells=cells, y=y, h=h))
        y += h
    if y > 562:
        raise SystemExit(f"ritocchi: the comparison table ends at {y}")
    return dict(cols=cols, head=head, lines=placed, added=added, bottom=y)


def build(base_pdf):
    """One entry per retouched page, in page order: {page, tab?, legend?, table?}."""
    doc = pymupdf.open(base_pdf)
    pages = {LEGEND: dict(page=LEGEND, legend=legend(doc)), TABLE: dict(page=TABLE, table=table(doc))}
    for n, (label, src) in TABS.items():
        old, new = pill(doc[n]), pill(doc[src])
        if abs((old.y0 + old.y1) - (new.y0 + new.y1)) > 1:
            raise SystemExit(f"ritocchi: the pills of pages {n} and {src} are not centred alike")
        pages.setdefault(n, dict(page=n))["tab"] = dict(label=label, src=src, old=(812, old.y0 - 17, 860, old.y1 + 21), area=(812, new.y0 - 15.9, 841.92, new.y1 + 20.1))
    return [pages[n] for n in sorted(pages)]


CSS = """
.rt-badge { height: 18.8pt; border-radius: 9.4pt; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 6.375pt; font-weight: 700; white-space: nowrap; }
.rt-t, .rt-d { line-height: 1; white-space: nowrap; }
.rt-t { font-size: 7.125pt; font-weight: 600; color: #162862; }
.rt-d { font-size: 6.375pt; color: #5a6875; }
.rt-rule { height: 0.75pt; background: #e2e6ea; }
.rt-line { display: flex; align-items: center; white-space: nowrap; }
.rt-line span { flex: none; }
.rt-head { background: #162862; color: #fff; font-size: 6pt; font-weight: 600; letter-spacing: 0.085em; text-transform: uppercase; }
.rt-series { background: #eaeef4; color: #162862; font-size: 6.375pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; border-bottom: 0.75pt solid #e2e6ea; }
.rt-row { font-size: 7.125pt; color: #1b2733; border-bottom: 0.75pt solid #e2e6ea; }
.rt-row .c { font-weight: 700; color: #162862; }
"""


def sheet(p):
    out = ""
    if "tab" in p:
        out += f'<div class="abs sum-tab"><span>{escape(p["tab"]["label"])}</span></div>'
    for i in p.get("legend", {}).get("items", []):
        x, y, w, _ = i["badge"]
        out += f'<div class="abs rt-badge" style="left:{x:.2f}pt;top:{y:.2f}pt;width:{w:.2f}pt;background:{"#878786" if i["steel"] else "#162862"}">{escape(i["num"])}</div>'
        for cls, size, (text, tx, ty) in (("rt-t", 7.125, i["title"]), ("rt-d", 6.375, i["desc"])):
            out += f'<div class="abs {cls}" style="left:{tx:.2f}pt;top:{ty - size * ASCENT - 0.27:.2f}pt">{escape(text)}</div>'
        rx, ry, rw = i["rule"]
        out += f'<div class="abs rt-rule" style="left:{rx:.2f}pt;top:{ry:.2f}pt;width:{rw:.2f}pt"></div>'
    if "table" in p:
        t = p["table"]
        cols = t["cols"]
        cells = lambda texts, bold=(): "".join(
            f'<span class="{"c" if k in bold else ""}" style="width:{cols[k + 1] - cols[k]:.2f}pt;padding-left:{INSET}pt">{escape(x)}</span>' for k, x in enumerate(texts))
        box = lambda y, h: f"left:{cols[0]:.2f}pt;top:{y:.2f}pt;width:{cols[-1] - cols[0]:.2f}pt;height:{h:.2f}pt"
        out += f'<div class="abs rt-line rt-head" style="{box(163.5, HEAD_H)}">{cells(t["head"])}</div>'
        for line in t["lines"]:
            if line["series"]:
                out += f'<div class="abs rt-line rt-series" style="{box(line["y"], line["h"])}"><span style="padding-left:{INSET}pt">{escape(line["series"])}</span></div>'
            else:
                out += f'<div class="abs rt-line rt-row" style="{box(line["y"], line["h"])}">{cells(line["cells"], bold=(0, 1))}</div>'
    return f'<section class="sheet">{out}</section>'


def wipe(page, text_rects, covered):
    """Text out of text_rects, line art that lies wholly inside any of `covered` (what is drawn behind stays)."""
    for r in text_rects:
        page.add_redact_annot(pymupdf.Rect(r), fill=False)
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    for r in covered:
        page.add_redact_annot(pymupdf.Rect(r), fill=False)
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED, text=pymupdf.PDF_REDACT_TEXT_NONE)


def apply(doc, tpl, gen, data):
    """On the base pages, still at their base positions (merge.py calls this before it inserts pages)."""
    for k, p in enumerate(data["pages"]):
        page = doc[p["page"]]
        if "legend" in p:
            grow = lambda r: pymupdf.Rect(r) + (-0.6, -0.6, 0.6, 0.6)
            wipe(page, [LEG_AREA, LEG_HIDDEN], [grow(i["old"]) for i in p["legend"]["items"]] + [grow(r) for r in p["legend"]["rules"]])
            if page.get_text("text", clip=LEG_AREA).strip() or page.search_for("21 · 22"):
                raise SystemExit("ritocchi: the old legend is still on page 04")
        if "table" in p:
            wipe(page, [TAB_AREA, TAB_HIDDEN], [TAB_AREA, pymupdf.Rect(44, 569.0, 405, 600)])
            left = [d["rect"] for d in page.get_drawings() if TAB_AREA.contains(d["rect"])]
            if page.get_text("text", clip=TAB_AREA).strip() or page.get_text("text", clip=TAB_HIDDEN).strip() or left:
                raise SystemExit(f"ritocchi: the old comparison table is still on page 63 ({len(left)} drawings)")
        if "tab" in p:
            t = p["tab"]
            # The pill and its shadow run past the page's edge, and so does the rectangle that has to cover them
            # whole: "if touched" would take the page's own background with them.
            page.add_redact_annot(pymupdf.Rect(t["old"]), fill=False)
            page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
            if page.get_text("text", clip=pymupdf.Rect(t["old"])).strip() or any(d["rect"].x0 > 815 and d["rect"].y0 > 40 for d in page.get_drawings()):
                raise SystemExit(f"ritocchi: the old side tab is still on page {p['page']}")
            area = pymupdf.Rect(t["area"])
            page.show_pdf_page(area, S.side_tab(tpl, t["src"], area), 0, clip=area)
        page.show_pdf_page(page.rect, gen, data["first"] + k)


def check(doc, data):
    """Each retouched page says what its sheet says, where it says it, and nothing is left under the footer."""
    flat = lambda t: "".join(t.split()).upper()
    problems = []
    for p in data["pages"]:
        page = next(x for x in doc if x.get_label() == f"{p['page']:02d}")
        if "tab" in p and flat(page.get_text(clip=pymupdf.Rect(t := p["tab"]["old"]))) != flat(p["tab"]["label"]):
            problems.append(f"page {p['page']}: the side tab reads {page.get_text(clip=pymupdf.Rect(t))!r}")
        for i in p.get("legend", {}).get("items", []):
            if flat(page.get_text(clip=pymupdf.Rect(i["rect"]))) != flat(i["num"] + i["title"][0] + i["desc"][0]) and flat(page.get_text(clip=pymupdf.Rect(i["rect"]))) != flat(i["title"][0] + i["num"] + i["desc"][0]):
                problems.append(f"page 04: legend item {i['num']} reads {page.get_text(clip=pymupdf.Rect(i['rect']))!r}")
        if "table" in p:
            t = p["table"]
            for line in t["lines"]:
                want = flat(line["series"] or "".join(line["cells"]))
                got = flat(page.get_text(clip=pymupdf.Rect(t["cols"][0], line["y"] + 0.5, t["cols"][-1], line["y"] + line["h"] - 0.5)))
                if got != want:
                    problems.append(f"page 63: the comparison table's line at {line['y']:.1f} reads {got}, not {want}")
        if any(k in p for k in ("legend", "table")) and flat(page.get_text(clip=pymupdf.Rect(40, 563, 378, 578.8))):
            problems.append(f"page {p['page']}: text under the footer")
    return problems
