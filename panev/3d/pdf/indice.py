"""The general index (page 2, printed 01) made whole: its right column, "Guida & riferimenti", listed
13 entries in one column and the last two ("Quadro comparativo 63", "Indice codici prodotto 64") ran
under the footer, unseen though still linked. The column now holds two lists side by side, "Il
prodotto" and "Scelta & riferimenti", the latter with the price list (65), the terms (66) and the
summary of the range (67) added, every entry visible and linked to its page.
build() reads the entries from the base page, gen.py prints the sheet (sheet()), merge.py lays it
over the page (apply()) and links the entries once every page is in place (links()); verify.py
checks them (check()). Units: pt."""
from html import escape
import pymupdf

PAGE = 1  # 0-based: the general index
AREA = pymupdf.Rect(455, 343, 796, 569.4)  # the right column below its title, above the footer
HIDDEN = [pymupdf.Rect(458, 573, 795, 579.0), pymupdf.Rect(458, 589.5, 795, 598)]  # the two rows under the footer (its text starts at 579.2)
COLS = [(460.59, 615.6), (635.85, 790.86)]
HEAD_Y = 354.75  # baseline of the lists' titles
ROW_Y = [372.0, 388.5, 405.0, 422.25, 438.75, 455.25, 471.75]  # baselines of the rows, as on the base page; then every 16.5
DOTS = 5.2  # the dotted rule under a row, below its baseline
ADDED = [(65, "Listino prezzi completo"), (66, "Termini commerciali & conformità")]  # titles as in the outline


def in_column(link):
    """A link of the right column's rows (the cards above it link too)."""
    return link["from"].x0 > 450 and link["from"].y0 > AREA.y0


def row_y(k):
    return ROW_Y[k] if k < len(ROW_Y) else ROW_Y[-1] + 16.5 * (k - len(ROW_Y) + 1)


def build(base_pdf, summary_label, summary_title):
    """The two lists: [(title, [(entry, printed page), ...]), ...] from the base page, the additions at the end."""
    doc = pymupdf.open(base_pdf)
    page = doc[PAGE]
    lines = []
    for b in page.get_text("dict", clip=pymupdf.Rect(455, 343, 796, 600))["blocks"]:
        for line in b.get("lines", []):
            s = line["spans"]
            if s[0]["bbox"][0] < 458:  # the footer's text reaching into the clip
                continue
            lines.append((round(s[0]["origin"][1], 1), s[0]["bbox"][0], s[0]["size"], "".join(x["text"] for x in s).strip()))
    lists = []
    for y, x, size, text in sorted(lines):
        if size < 6.6:
            lists.append((text, []))
        elif x < 700:
            lists[-1][1].append([text, None])
        else:
            next(e for e in reversed(lists[-1][1]) if e[1] is None)[1] = text
    titles = {p: t for _, t, p in doc.get_toc()}
    for printed, title in ADDED:
        if titles.get(printed + 1) != title:
            raise SystemExit(f"indice: the outline has no '{title}' at page {printed}")
    lists[1][1].extend([[t, f"{p:02d}"] for p, t in ADDED] + [[summary_title, summary_label]])
    if [len(e) for _, e in lists] != [7, 9] or any(p is None for _, e in lists for _, p in e):
        raise SystemExit(f"indice: unexpected lists on the index page: {lists}")
    entries = []
    for (x0, x1), (head, rows) in zip(COLS, lists):
        for k, (title, printed) in enumerate(rows):
            y = row_y(k)
            entries.append(dict(title=title, page=printed, col=(x0, x1), baseline=y, rect=(x0 - 0.1, y - 10.5, x1, y + 6.0)))
    return dict(heads=[(h, x0) for (x0, _), (h, _) in zip(COLS, lists)], entries=entries)


CSS = """
.ix-head { font-size: 6.38pt; font-weight: 600; letter-spacing: 0.165em; color: #5c7690; text-transform: uppercase; white-space: nowrap; line-height: 1; }
.ix-row { display: flex; justify-content: space-between; font-size: 7.12pt; line-height: 1; white-space: nowrap; }
.ix-row .t { color: #1b2733; }
.ix-row .p { color: #5a6875; font-weight: 500; }
.ix-dots { height: 0.75pt; }
"""
ASCENT = 0.727  # Inter's cap baseline in a line box of line-height 1, as a share of the font size


def sheet(ix):
    out = "".join(f'<div class="abs ix-head" style="left:{x0:.2f}pt;top:{HEAD_Y - 6.38 * ASCENT - 0.27:.2f}pt">{escape(h)}</div>' for h, x0 in ix["heads"])
    for e in ix["entries"]:
        (x0, x1), y = e["col"], e["baseline"]
        out += (f'<div class="abs ix-row" style="left:{x0:.2f}pt;width:{x1 - x0:.2f}pt;top:{y - 7.12 * ASCENT - 0.27:.2f}pt">'
                f'<span class="t">{escape(e["title"])}</span><span class="p">{e["page"]}</span></div>'
                f'<svg class="abs ix-dots" style="left:{x0 - 0.1:.2f}pt;top:{y + DOTS - 0.35:.2f}pt;width:{x1 - x0 + 0.1:.2f}pt" viewBox="0 0 {x1 - x0 + 0.1:.2f} 0.75" '
                f'preserveAspectRatio="none"><line x1="0" y1="0.375" x2="{x1 - x0 + 0.1:.2f}" y2="0.375" stroke="#e2e6ea" stroke-width="0.75" stroke-dasharray="0.75 0.75"/></svg>')
    return f'<section class="sheet">{out}</section>'


def apply(page, gen, pno):
    """The right column's rows go (text, dotted rules, links; the door drawn behind them stays), the sheet comes over."""
    for r in [AREA] + HIDDEN:
        page.add_redact_annot(r, fill=False)
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    for y in [y + DOTS for y in ROW_Y] + [519.0, 535.5, 552.8, 569.2, 585.8]:  # the dotted rules: thin strips, so only the dots are covered
        page.add_redact_annot(pymupdf.Rect(458, y - 0.6, 795, y + 1.6), fill=False)
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED, text=pymupdf.PDF_REDACT_TEXT_NONE)
    if page.get_text("text", clip=AREA).strip() or any(page.search_for(t) for t in ("Quadro comparativo", "Indice codici prodotto")):
        raise SystemExit("indice: rows of the old right column are left")
    for link in [lk for lk in page.get_links() if in_column(lk)]:
        page.delete_link(link)
    page.show_pdf_page(page.rect, gen, pno)


def links(doc, ix, order):
    """A link per entry to its page (order: what is at each position, the base page index for a base page,
    the label for an inserted one)."""
    for e in ix["entries"]:
        at = order.index(e["page"]) if e["page"] in order else order.index(int(e["page"]))  # an inserted page by its label first: "67" is not base page 67
        doc[PAGE].insert_link({"kind": pymupdf.LINK_GOTO, "from": pymupdf.Rect(e["rect"]), "page": at, "to": pymupdf.Point(0, 0)})


def check(doc, base, ix):
    """Every entry visible in its place and linked to the page with its label; every page the base column
    linked still linked; nothing clickable or written under the footer."""
    flat = lambda t: "".join(t.split())
    page, problems = doc[PAGE], []
    links = page.get_links()
    for e in ix["entries"]:
        r = pymupdf.Rect(e["rect"])
        hit = [lk for lk in links if abs(lk["from"].y0 - r.y0) < 0.5 and abs(lk["from"].x0 - r.x0) < 0.5]
        if flat(page.get_text("text", clip=r)) != flat(e["title"] + e["page"]) or len(hit) != 1 or doc[hit[0]["page"]].get_label() != e["page"]:
            problems.append(f"index: {e['title']} ({e['page']}) reads {page.get_text('text', clip=r)!r}, links to {[doc[lk['page']].get_label() for lk in hit]}")
    was = sorted(f"{lk['page']:02d}" for lk in base[PAGE].get_links() if in_column(lk))
    now = sorted(e["page"] for e in ix["entries"])
    if any(was.count(p) > now.count(p) for p in was):
        problems.append(f"index: the base column linked {was}, now {now}")
    if any(lk["from"].y1 > 569.5 and in_column(lk) for lk in links) or page.search_for("Indice codici prodotto", clip=pymupdf.Rect(455, 569.5, 796, 600)):
        problems.append("index: something left under the footer")
    return problems
