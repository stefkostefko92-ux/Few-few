"""What goes on the "Vista 3D" sheets of the catalogue and where: one sheet per product page of the base
catalogue (dist/pdf/base.pdf), its title and code table read from it. By the owner's decision the renders
take the place of the product's technical drawing on its page ("inline": door brackets, SU/SD/SC, SG,
the made-to-measure guide); only the rigid arm keeps its drawing (an assembly drawing, like the
"Disegno di montaggio" pages, which all stay), so its renders stay on a page of their own after it
("page", laid out in the panel of the assembly-drawing pages). Units: pt."""
import os
import pymupdf

PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # panev/3d
W, H = 841.92, 594.96  # page size of the catalogue

# Panel geometry of the assembly-drawing pages (e.g. printed page 21), stretched down to 532 pt.
CARD = (40.1, 82.1, 802.1, 532.0)
INNER = (50.6, 111.4, 790.9, 490.4)
PAD, GAP = 12.0, 14.0
BOX = (INNER[0] + PAD, INNER[1] + PAD, INNER[2] - PAD, INNER[3] - PAD)  # 716.3 x 355.0

# Page 7 (printed 06): inside of the two illustration cards, where the renders go.
P7 = [("A-65-170-7+B-65-320", (146.6, 307.9, 394.9, 504.4)), ("A-65-170-7+B-65-320-SX", (447.4, 307.9, 694.9, 504.4))]

# Page 6 (printed 05), "Tre applicazioni della staffa": the patent's figures give way to the renders the site
# shows for the three applications (render, catalogue render?, the figure's area); the texts lose the
# figures' letters, and the operator's says what the owner says: the bracket is fixed to the car's
# structure and to the operator. P5_OLD: the texts to redact (the intro, the three bodies).
P5 = [
    ("A-45-170-7+B-45-320", False, (45.8, 142.5, 279.8, 328.5), (61.7, 375.3),
     "Fissaggio e regolazione in quota della <b>soglia</b> della porta di piano rispetto alla quota zero del pianerottolo. L'elemento di supporto può essere <b>tagliato a misura</b> secondo le esigenze di montaggio."),
    ("A-65-170-7+B-65-320-SX", True, (303.8, 142.5, 537.8, 328.5), (319.6, 375.3),
     "Montaggio del <b>gruppo operatore</b> per l'apertura della porta di cabina: la staffa va fissata alla struttura della <b>cabina</b> e all'<b>operatore</b>."),
    ("SD-220-200+SG-80-190", False, (561.8, 142.5, 795.8, 328.5), (577.6, 375.3),
     "Fissaggio delle <b>guide</b> del <b>contrappeso</b> dell'impianto alla <b>muratura</b> del vano di corsa."),
]
P5_INTRO = ((45.4, 96.3), "Lo stesso sistema brevettato assolve funzioni diverse nell'impianto di ascensore o montacarichi.")
P5_OLD = [(44, 94, 545, 121), (60.7, 373, 266, 418.5), (318.6, 373, 524, 407.5), (576.6, 373, 782, 396)]
FIX = "Staffa <b>ambidestra</b>: disponibile nelle versioni <b>destra (DX)</b> e <b>sinistra (SX)</b>. Indicare la mano desiderata in fase d'ordine."

DOOR = (15, 16, 17, 18, 19)  # PDF pages of section 01: one A plate and two B brackets each
SYSTEMS = (21, 23, 25, 28, 30, 32, 34, 36, 38, 41, 43, 45, 47, 49, 51, 53, 55)  # SU/SD/SC + SG, drawing on the next page
SG_PAGES = {
    58: ["SG 50 130", "SG 60 130", "SG 80 130", "SG 50 150", "SG 60 150", "SG 80 150"],
    59: ["SG 50 170", "SG 60 170", "SG 80 170", "SG 50 190", "SG 60 190", "SG 80 190"],
    60: ["SG 50 220", "SG 60 220", "SG 80 220"],
}
SPECIAL = {62: "Vista 3D · Versione componibile su misura", 63: "Vista 3D · Abbinamento tramite braccio rigido"}
KEEP = (63,)  # product pages that keep their drawing (the rigid arm's assembly drawing, printed page 62)

INDICATIVE = {"SC 50 170", "SG 225 50", "SN 65 200"}  # to drawing or not fully dimensioned (README)
DESC = {
    "SC 50 170": "Supporto · misura A",
    "SG 225 50": "Guida 150 + 30 mm",
    "SN 60 65": "Staffa d’angolo · 65 × 65 × 60 mm",
    "SN 65 200": "Staffa a squadra · 65 × 200 × 50 mm",
    "BRACCIO 160 190": "Braccio rigido regolabile · l. 190 mm",
}
NOTE_HAND = "<b>Vista 3D</b>: render generati dalle quote di questo catalogo, versione <b>destra (DX)</b>; la <b>sinistra (SX)</b> è speculare. In caso di differenze fanno fede i disegni tecnici."
NOTE_PLAIN = "<b>Vista 3D</b>: render generati dalle quote di questo catalogo. In caso di differenze fanno fede i disegni tecnici."
NOTE_SPECIAL = "<b>Vista 3D</b>: render generati dalle quote di questo catalogo. <b>Forma indicativa</b> per i pezzi su disegno o non quotati per intero: fanno fede catalogo e disegni esecutivi."


def rid(code):
    return code.replace(" ", "-")


def page_info(doc, pno):
    """Printed number, title and code table (code, description) of a product page (1-based)."""
    page = doc[pno - 1]
    lines = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(s["text"] for s in line["spans"]).strip()
            if text:
                lines.append((line["bbox"], line["spans"][0]["size"], text))
    title = " ".join(t for bb, size, t in lines if 60 < bb[1] < 90 and size > 13)
    rows = []
    for bb, size, code in lines:
        if 620 < bb[0] < 632 and abs(size - 7.88) < 0.1:  # the codes column of the right-hand table
            desc = " ".join(t for b2, s2, t in lines if 670 < b2[0] < 700 and abs(b2[1] - bb[1]) < 6 and abs(s2 - 6.75) < 0.1)
            rows.append((code, desc))
    return dict(printed=f"{pno - 1:02d}", title=title, rows=rows)


def describe(code, rows):
    if code in DESC:
        return DESC[code]
    for c, d in rows:
        if c == code and d:
            return d.split(" ·")[0].strip()
    fam, a, b = code.split(" ")
    if fam == "SG":
        return f"Guida {a} × {b} mm"
    raise KeyError(code)


# Layouts of 4:3 renders in a box (x0, y0, x1, y1): as large as the box allows either way, centred.
def grid_row(n, w, y, box=BOX):
    total = n * w + (n - 1) * GAP
    x0 = box[0] + (box[2] - box[0] - total) / 2
    return [(x0 + i * (w + GAP), y, w, w * 0.75) for i in range(n)]


def layout_big_two(box=BOX):
    """One large render on the left, two stacked on the right."""
    bw, bh = box[2] - box[0], box[3] - box[1]
    ah = min(bh, (bw - GAP / 3) / 2)  # the height or the width decides: the pair beside is as tall
    aw = ah * 4 / 3
    pw = min(bw - aw - GAP, (ah - GAP) / 1.5)
    ph = pw * 0.75
    x0, y0 = box[0] + (bw - aw - GAP - pw) / 2, box[1] + (bh - ah) / 2
    return [(x0, y0, aw, ah), (x0 + aw + GAP, y0, pw, ph), (x0 + aw + GAP, y0 + ah - ph, pw, ph)]


def layout_door(n_asm, box=BOX):
    """Assemblies (one or two) over the three parts; both rows share one overall width."""
    bw, bh = box[2] - box[0], box[3] - box[1]
    total = min(bw, (6 * (bh - 12) / 0.75 + 3 * GAP + 4 * GAP) / 5)
    w1, w2 = (total - GAP) / 2, (total - 2 * GAP) / 3
    y0 = box[1] + (bh - w1 * 0.75 - 12 - w2 * 0.75) / 2
    return grid_row(n_asm, w1, y0, box) + grid_row(3, w2, y0 + w1 * 0.75 + 12, box)


def layout_rows(n, per_row, box=BOX):
    bw, bh = box[2] - box[0], box[3] - box[1]
    rows = -(-n // per_row)
    w = min((bw - (per_row - 1) * GAP) / per_row, (bh - (rows - 1) * GAP) / rows / 0.75)
    h = w * 0.75
    gap = min(GAP, (bh - rows * h) / (rows - 1)) if rows > 1 else 0
    y0 = box[1] + (bh - rows * h - (rows - 1) * gap) / 2
    out = []
    for r in range(rows):
        out += grid_row(min(per_row, n - r * per_row), w, y0 + r * (h + gap), box)
    return out


NAVY = (0.0863, 0.1569, 0.3843)
PANEL = (0.9843, 0.9882, 0.9922)  # the light inside of a drawing card
HAND = "Staffa ambidestra: il disegno riporta"  # a note that speaks of the drawing (9 SU/SD/SC pages)


def panel(doc, pno):
    """The drawing card of a product page (1-based): its title bar, its inside, the white panel the
    renders go in (the inside 10 pt in, as the drawing's frame) and, if its note speaks of the
    drawing, the note's text line."""
    page = doc[pno - 1]
    fills = [(d["rect"], d.get("fill")) for d in page.get_drawings() if d.get("fill")]
    inside = max((r for r, f in fills if all(abs(a - b) < 0.002 for a, b in zip(f, PANEL)) and r.width > 400), key=lambda r: r.get_area())
    bar = next(r for r, f in fills if all(abs(a - b) < 0.002 for a, b in zip(f, NAVY)) and r.height < 25 and abs(r.y1 - inside.y0) < 1)
    note = page.search_for(HAND)
    return dict(bar=tuple(bar), inner=(inside.x0 + 10.1, inside.y0 + 10.1, inside.x1 - 10.1, inside.y1 - 10.9),
                note=tuple(note[0]) if note else None)


def inset(r, d):
    return (r[0] + d, r[1] + d, r[2] - d, r[3] - d)


def shot(label, desc, render, rect, indicative=False):
    return dict(label=label, desc=desc, render=render, rect=rect, indicative=indicative)


def build(base_pdf, assemblies):
    """The 3D sheets in reading order. `assemblies`: names of the assembly renders ('A-..+B-..').
    An inline sheet carries its product page (`target`) and that page's card (`panel`); its shots are
    laid out in the card's white panel instead of the 3D page's."""
    doc = pymupdf.open(base_pdf)
    pages = []

    def printed(pno):
        return f"{pno - 1:02d}"

    def box(src, inline):
        return inset(panel(doc, src)["inner"], PAD) if inline else BOX

    def add(after, src, eyebrow, title, right, note, shots, codes, refs, inline=True):
        extra = dict(mode="inline", target=src, panel=panel(doc, src)) if inline else dict(mode="page")
        pages.append(dict(after=after, src=src, label=f"{printed(after)} · 3D", eyebrow=eyebrow, title=title, right=right, note=note, shots=shots, codes=codes, refs=refs, **extra))

    for p in DOOR:
        info = page_info(doc, p)
        codes = [c for c, _ in info["rows"]]
        # Assemblies in the order of the page's table (B 320 before B 220).
        asms = sorted((n for n in assemblies if n.startswith(rid(codes[0]) + "+")), key=lambda n: codes.index(n.split("+")[1].replace("-", " ")))
        rects = layout_door(len(asms), box(p, True))
        shots = [shot(n.replace("-", " ").replace("+", " + "), "Montaggio", n, rects[i]) for i, n in enumerate(asms)]
        shots += [shot(c, describe(c, info["rows"]), rid(c), rects[len(asms) + i]) for i, c in enumerate(codes)]
        add(p, p, "Vista 3D · Fissaggio porta di piano", "Vista 3D — " + info["title"].replace(" — ", ", "),
            "Render fotorealistico · versione DX", NOTE_HAND, shots, codes, [(p, info["printed"])])

    for p in SYSTEMS:
        info = page_info(doc, p)
        codes = [c for c, _ in info["rows"]]
        asm = f"{rid(codes[0])}+{rid(codes[1])}"
        if asm not in assemblies:
            raise FileNotFoundError(f"assembly render {asm}")
        rects = layout_big_two(box(p, True))
        shots = [shot(f"{codes[0]} + {codes[1]}", "Montaggio", asm, rects[0])]
        shots += [shot(c, describe(c, info["rows"]), rid(c), rects[1 + i]) for i, c in enumerate(codes)]
        add(p + 1, p, "Vista 3D · Abbinamento staffa / contrappeso", f"Vista 3D — {codes[0]} / {codes[1]}",
            "Render fotorealistico · versione DX", NOTE_HAND, shots, codes, [(p, info["printed"]), (p + 1, printed(p + 1))])

    for p, codes in SG_PAGES.items():
        info = page_info(doc, p)
        rects = layout_rows(len(codes), 3, box(p, True))
        shots = [shot(c, describe(c, []), rid(c), rects[i]) for i, c in enumerate(codes)]
        add(p, p, "Vista 3D · Staffe guide standard fisse", "Vista 3D — " + info["title"].replace("Serie SG — L", "Serie SG, l"),
            "Render fotorealistico", NOTE_PLAIN, shots, codes, [(p, info["printed"])])

    for p, eyebrow in SPECIAL.items():
        info = page_info(doc, p)
        codes = [c for c, _ in info["rows"]]
        inline = p not in KEEP  # the rigid arm keeps its drawing and its 3D page
        if len(codes) == 3:  # the squared bracket large, the corner bracket and the arm beside it
            shown, rects = [codes[1], codes[0], codes[2]], layout_big_two(box(p, inline))
        else:
            shown, rects = codes, layout_rows(len(codes), len(codes), box(p, inline))
        shots = [shot(c, describe(c, info["rows"]), rid(c), rects[i], c in INDICATIVE) for i, c in enumerate(shown)]
        add(p, p, eyebrow, f"Vista 3D — {info['title']}", "Render fotorealistico", NOTE_SPECIAL, shots, codes, [(p, info["printed"])], inline)
    return pages
