"""The summary at the end of the catalogue (the owner's wish): every article sold, on three pages before
the back cover ("67"-"69"), each as its render with its code, description and the page that shows it,
a link to that page in the PDF. The articles are the 3D package's (src/catalog.js: codes, printed
pages, thicknesses, sizes as printed), grouped as in the price list (printed page 65, whose bar titles
and subtitles they reuse), six to a row and a row per kind (A / B, the SC lengths, the SG widths).
The pages are copies of the price list page: its header bar and footer stay, its label and side tab
give way to "Riepilogo gamma" and the code index page's tab ("Gamma"). gen.py prints the sheets
(sheet()), merge.py inserts the pages (insert()), verify.py checks them (check()). Units: pt."""
import json
import re
import subprocess
from html import escape
import pymupdf
import layout as L

TEMPLATE = 65  # the base page (0-based) the summary pages copy: the price list, printed 65
# Bar title and subtitle as in the price list, the section's printed pages, what splits its rows.
GROUPS = [
    ("STAFFE PORTE DI PIANO", "Tipo A angolari · Tipo B dritte · sp. 4 / 5 mm", range(13, 19), lambda c: c.split()[0]),
    ("SUPPORTI SU · UNIVERSALE", "Supporto guide contrappeso · sp. 5 mm", range(19, 26), None),
    ("SUPPORTI SD · DECENTRATO", "Supporto guide contrappeso · sp. 5 mm", range(26, 39), None),
    ("SUPPORTI SCORREVOLI SC", "Supporto guide contrappeso · sp. 4 mm", range(39, 56), lambda c: c.split()[2]),
    ("STAFFE GUIDA SG", "Larghezze 50 / 60 / 80 mm · sp. 4 mm", range(56, 60), lambda c: c.split()[1]),
    ("SOLUZIONI SPECIALI", "Su misura / fissaggio a parete · quotazione su commessa", range(60, 63), None),
]
SPLIT = [(0, 1), (2, 3), (4, 5)]  # the groups on each page: 3, 3 and 4 rows, the sections in order
NO_THICKNESS = (62,)  # the rigid arm's page states no sheet thickness
WORD = {"A": "Piastra", "B": "Staffa", "SU": "Supporto", "SD": "Supporto", "SC": "Supporto", "SG": "Guida"}
CODE = re.compile(r"\b(?:BRACCIO \d+ \d+|[AB] \d+ \d+(?: \d)?|S[UDCGN] \d+ \d+)\b")
TITLE, EYEBROW, LABEL, TAB = "La gamma completa", "Riepilogo gamma · tutti gli articoli a catalogo", "Riepilogo gamma", "Gamma"
OUTLINE = "Riepilogo della gamma"

X0, X1, COLS, GX = 45.0, 785.2, 6, 9.0  # the price list's columns span 45.0-785.2
TW = (X1 - X0 - (COLS - 1) * GX) / COLS
TH = TW * 0.75
TOP, BAR, BAR_GAP, ROW_GAP, GROUP_GAP = 107.0, 17.3, 6.0, 7.0, 12.0
NOTE = (X0, 534.0, X1, 558.0)
HEAD = pymupdf.Rect(705, 10, 812, 30)  # the header bar's icon and label ("LISTINO PREZZI")
SIDE = pymupdf.Rect(819, 247, 841.9, 351)  # the side tab
# The side tab instead: the code index page's (printed 64), whose "CODICI" is as long as "GAMMA", with its soft shadow.
TAB_SRC, TAB_AREA = 64, pymupdf.Rect(812, 255, 841.92, 345)


def catalogue():
    js = ("import { CATALOG } from './src/catalog.js';"
          "process.stdout.write(JSON.stringify(CATALOG.map(({ code, id, page, t, size }) => ({ code, id, page, t, size }))));")
    return json.loads(subprocess.run(["node", "--input-type=module", "-e", js], cwd=L.PKG, check=True, capture_output=True, text=True).stdout)


def describe(item, doc):
    """As the renders on the article's page say it (layout.describe), with the thickness the catalogue states."""
    code = item["code"]
    text = L.DESC.get(code) or f"{WORD[code.split()[0]]} {item['size']} mm"
    shown = L.describe(code, L.page_info(doc, item["page"] + 1)["rows"])
    if text != shown:
        raise SystemExit(f"summary: {code} is '{text}' in src/catalog.js, '{shown}' on page {item['page']}")
    return text if item["page"] in NO_THICKNESS else f"{text} · sp. {item['t']} mm"


def build(base_pdf):
    """The summary pages: label, title and groups, each with its bar and its tiles (code, render, description,
    printed page, rect (x, y, w, h), indicative?)."""
    doc = pymupdf.open(base_pdf)
    items = catalogue()
    groups = []
    for title, sub, pages, key in GROUPS:
        rows = {}
        for item in (i for i in items if i["page"] in pages):
            rows.setdefault(key(item["code"]) if key else None, []).append(item)
        groups.append((title, sub, list(rows.values())))
    if sum(len(r) for _, _, rows in groups for r in rows) != len(items) or any(len(r) > COLS for _, _, rows in groups for r in rows):
        raise SystemExit("summary: an article in no group, or a row longer than the grid")
    out = []
    for n, which in enumerate(SPLIT):
        y, placed = TOP, []
        for title, sub, rows in (groups[g] for g in which):
            bar, y = (X0, y, X1, y + BAR), y + BAR + BAR_GAP
            tiles = []
            for row in rows:
                tiles += [dict(code=i["code"], render=i["id"], desc=describe(i, doc), page=i["page"], rect=(X0 + c * (TW + GX), y, TW, TH),
                               indicative=i["code"] in L.INDICATIVE) for c, i in enumerate(row)]
                y += TH + ROW_GAP
            placed.append(dict(title=title, sub=sub, bar=bar, tiles=tiles))
            y += GROUP_GAP - ROW_GAP
        if y - GROUP_GAP > NOTE[1] - 4:
            raise SystemExit(f"summary: page {n + 1} runs into its note")
        out.append(dict(label=f"{doc.page_count - 1 + n:02d}", title=TITLE if n == 0 else f"{TITLE} (segue)", groups=placed))
    return out


CSS = """
.sum-head { right: 34pt; top: 13.38pt; height: 12.75pt; display: flex; align-items: center; gap: 12.82pt; }
.sum-head svg { width: 11.34pt; height: 12.75pt; flex: none; overflow: visible; }
.sum-head span { font-size: 7.12pt; font-weight: 500; letter-spacing: 0.16em; color: #c3cee0; text-transform: uppercase; white-space: nowrap; }
.sum-tab { left: 825pt; top: 297.85pt; width: 17.25pt; transform: translateY(-50%); display: flex; justify-content: center; }
.sum-tab span { writing-mode: vertical-rl; font-size: 5.62pt; font-weight: 700; letter-spacing: 0.26em; color: #fff; text-transform: uppercase; }
.sum-eyebrow { left: 45.4pt; top: 42.65pt; font-size: 7.5pt; font-weight: 600; letter-spacing: 0.19em; color: #63635f; text-transform: uppercase; white-space: nowrap; }
.sum-title { left: 45.4pt; top: 57.1pt; font-size: 16.5pt; font-weight: 700; letter-spacing: -0.035em; color: #162862; white-space: nowrap; }
.sum-lead { left: 45.4pt; top: 84.65pt; font-size: 7.65pt; color: #5a6875; white-space: nowrap; }
.gbar { height: 17.3pt; border-radius: 2.5pt; background: #162862; display: flex; align-items: center; justify-content: space-between; padding: 0 9pt 0 7.1pt; }
.gbar .t { font-size: 6.9pt; font-weight: 700; letter-spacing: 0.04em; color: #fff; white-space: nowrap; }
.gbar .s { font-size: 5.85pt; font-weight: 500; color: #b7c4d6; white-space: nowrap; }
.sum .tags { left: 5pt; top: 5pt; right: 5pt; flex-direction: column; align-items: flex-start; gap: 2.2pt; }
.sum .tags .ds { display: flex; flex-wrap: wrap; gap: 2.2pt; }
.sum .tags span, .sum .pg, .sum .ind { font-size: 5.4pt; padding: 2pt 4pt 1.8pt; }
.sum .pg, .sum .ind { position: absolute; bottom: 5pt; border-radius: 2.5pt; line-height: 1.15; white-space: nowrap; }
.sum .pg { right: 5pt; background: rgba(255, 255, 255, 0.88); color: #162862; font-weight: 700; }
.sum .ind { left: 5pt; background: rgba(99, 99, 95, 0.9); color: #fff; font-weight: 600; }
.sum-note { display: flex; align-items: center; gap: 8pt; padding-left: 11pt; background: #edf1f7; border-left: 2.2pt solid #162862; border-radius: 3pt;
  font-size: 6.38pt; color: #1b2733; }
.sum-note b { font-weight: 700; color: #162862; }
.sum-note svg { width: 11pt; height: 11pt; flex: none; }
"""
ICON = ('<svg viewBox="0 0 11.34 12.75" fill="none" stroke="#9fb0cc" stroke-width="1.346" stroke-linecap="round" stroke-linejoin="round">'
        '<path d="M5.67 0 11.34 3.18v6.38L5.67 12.75 0 9.57V3.18zM5.67 6.37l5.67-3.19M5.67 6.37v6.38M5.67 6.37 0 3.18"/></svg>')
NOTE_TEXT = ("<b>Vista 3D</b>: render generati dalle quote di questo catalogo, versione <b>destra (DX)</b>; la sinistra (SX) è speculare. "
             "<b>Forma indicativa</b> per i pezzi su disegno o non quotati per intero. In caso di differenze fanno fede catalogo e disegni tecnici.")


def sheet(p, img, count, cube):
    """One summary page; img(render) is the render's file, cube the icon of the notes."""
    pos = lambda r: f"left:{r[0]:.2f}pt;top:{r[1]:.2f}pt;width:{r[2] - r[0]:.2f}pt;height:{r[3] - r[1]:.2f}pt"
    body = ""
    for g in p["groups"]:
        body += f'<div class="abs gbar" style="{pos(g["bar"])}"><span class="t">{escape(g["title"])}</span><span class="s">{escape(g["sub"])}</span></div>'
        for t in g["tiles"]:
            x, y, w, h = t["rect"]
            extra = '<span class="ind">Forma indicativa</span>' if t["indicative"] else ""
            chips = "".join(f'<span class="d">{escape(part)}</span>' for part in t["desc"].split(" · "))  # each whole on a line
            body += (f'<div class="abs shot" style="{pos((x, y, x + w, y + h))}"><img src="{img(t["render"])}" alt="">'
                     f'<div class="tags"><span class="c">{escape(t["code"])}</span><div class="ds">{chips}</div></div>{extra}<span class="pg">p. {t["page"]}</span></div>')
    lead = (f"Tutti i {count} articoli a catalogo, raggruppati come nel listino, con la pagina in cui sono illustrati. "
            "Nella versione digitale (PDF) tocca un articolo per aprire direttamente la sua pagina.")
    return (
        f'<section class="sheet sum"><div class="abs sum-head">{ICON}<span>{LABEL}</span></div><div class="abs sum-tab"><span>{TAB}</span></div>'
        f'<div class="abs sum-eyebrow">{escape(EYEBROW)}</div><div class="abs sum-title">{escape(p["title"])}</div><div class="abs sum-lead">{escape(lead)}</div>'
        f'{body}<div class="abs sum-note" style="{pos(NOTE)}">{cube}<span>{NOTE_TEXT}</span></div><div class="abs pageno">{p["label"]}</div></section>'
    )


def side_tab(tpl):
    """The code index page with nothing left on it but its side tab (the pill and its soft shadow), no text."""
    doc = pymupdf.open()
    doc.insert_pdf(tpl, from_page=TAB_SRC, to_page=TAB_SRC)
    page = doc[0]
    w, h = page.rect.br
    for r in ((0, 0, TAB_AREA.x0, h), (TAB_AREA.x0, 0, w, TAB_AREA.y0), (TAB_AREA.x0, TAB_AREA.y1, w, h)):
        page.add_redact_annot(pymupdf.Rect(r), fill=False)
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_REMOVE, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    page.add_redact_annot(TAB_AREA, fill=False)
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    if page.get_text("text").strip() or page.get_images() or len(page.get_drawings()) != 2:
        raise SystemExit("summary: the side tab template carries more than the tab")
    return doc


def insert(doc, tpl, gen, data, order, body, pageno):
    """The summary pages before the back: copies of the price list page without its body, page number, label,
    icon and side tab, the code index page's tab, the sheets over them; then each tile's link to its article's
    page (order: what is at each position, base indices for the base pages)."""
    at, tab = doc.page_count - 1, side_tab(tpl)
    for k, p in enumerate(data["pages"]):
        doc.insert_pdf(tpl, from_page=TEMPLATE, to_page=TEMPLATE, start_at=at + k, links=False, annots=False)
        page = doc[at + k]
        for r in (body, pageno, SIDE):
            page.add_redact_annot(r)
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_REMOVE, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
        page.add_redact_annot(HEAD, fill=False)  # on the navy bar: only the icon and the text go
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
        left = "".join(page.get_text("text").split()).upper()
        if "LISTINOPREZZI" in left or "€" in left or any(d["rect"].x0 > 815 and d["rect"].y0 > 40 for d in page.get_drawings()):
            raise SystemExit(f"summary: the price list page still shows on page {at + k + 1}")
        page.show_pdf_page(TAB_AREA, tab, 0, clip=TAB_AREA)
        page.show_pdf_page(page.rect, gen, data["first"] + k)
        order.insert(at + k, p["label"])
    for k, p in enumerate(data["pages"]):
        for t in (t for g in p["groups"] for t in g["tiles"]):
            x, y, w, h = t["rect"]
            doc[at + k].insert_link({"kind": pymupdf.LINK_GOTO, "from": pymupdf.Rect(x, y, x + w, y + h), "page": order.index(t["page"]), "to": pymupdf.Point(0, 0)})
    toc = doc.get_toc(simple=False)
    doc.set_toc(toc + [[1, OUTLINE, at + 1, {"kind": pymupdf.LINK_GOTO, "page": at, "to": pymupdf.Point(0, 0)}]])


def check(doc, base, data):
    """verify.py's checks of the summary pages: each right before the back with its label, the price list's bar
    titles and subtitles, its codes and pages on their tiles and nothing of the page it copies; a link per tile
    to the page labelled with the tile's page; every code of the price list exactly once; the outline entry."""
    flat = lambda t: "".join(t.split()).upper()
    problems, codes = [], []
    listino = flat(base[TEMPLATE].get_text())
    first = doc.page_count - 1 - len(data["pages"])
    for k, p in enumerate(data["pages"]):
        page = doc[first + k]
        text, links = flat(page.get_text()), page.get_links()
        if page.get_label() != p["label"] or "LISTINOPREZZI" in text or "€" in text or flat(LABEL) not in text:
            problems.append(f"page {page.number + 1}: label {page.get_label()} ({p['label']}), or the price list's page shows")
        if flat(page.get_text(clip=SIDE)) != flat(TAB) or flat(page.get_text(clip=(780, 575, 815, 591))) != p["label"]:
            problems.append(f"page {page.number + 1}: the side tab or the page number")
        for g in p["groups"]:
            if any(flat(s) not in text or flat(s) not in listino for s in (g["title"], g["sub"])):
                problems.append(f"page {page.number + 1}: bar {g['title']} / {g['sub']}")
        tiles = [t for g in p["groups"] for t in g["tiles"]]
        if len(links) != len(tiles):
            problems.append(f"page {page.number + 1}: {len(links)} links for {len(tiles)} articles")
        for t in tiles:
            codes.append(t["code"])
            x, y, w, h = t["rect"]
            r = pymupdf.Rect(x, y, x + w, y + h)
            on = flat(page.get_text(clip=r))
            want = flat(t["code"] + t["desc"].replace(" · ", "") + ("Forma indicativa" if t["indicative"] else "") + f"p. {t['page']}")
            hit = [lk for lk in links if abs(lk["from"].x0 - r.x0) < 0.5 and abs(lk["from"].y0 - r.y0) < 0.5]
            if on != want or len(hit) != 1 or doc[hit[0]["page"]].get_label() != f"{t['page']:02d}":
                problems.append(f"page {page.number + 1}: {t['code']} reads {on} / links to {[doc[lk['page']].get_label() for lk in hit]}")
    listed = CODE.findall(" ".join(base[TEMPLATE].get_text().split()))
    if sorted(codes) != sorted(listed) or len(set(codes)) != len(codes):
        problems.append(f"summary: {len(codes)} articles, the price list has {len(listed)}: {sorted(set(codes) ^ set(listed))}")
    if doc.get_toc()[-1] != [1, OUTLINE, first + 1]:
        problems.append(f"outline: last entry {doc.get_toc()[-1]}")
    return problems
