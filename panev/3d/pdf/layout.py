"""What goes on the "Vista 3D" pages of the catalogue and where: the pages follow the product pages
of the base catalogue (dist/pdf/base.pdf), their titles and code tables are read from it, and the
renders are laid out inside the panel of the assembly-drawing pages. Units: pt."""
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

DOOR = (15, 16, 17, 18, 19)  # PDF pages of section 01: one A plate and two B brackets each
SYSTEMS = (21, 23, 25, 28, 30, 32, 34, 36, 38, 41, 43, 45, 47, 49, 51, 53, 55)  # SU/SD/SC + SG, drawing on the next page
SG_PAGES = {
    58: ["SG 50 130", "SG 60 130", "SG 80 130", "SG 50 150", "SG 60 150", "SG 80 150"],
    59: ["SG 50 170", "SG 60 170", "SG 80 170", "SG 50 190", "SG 60 190", "SG 80 190"],
    60: ["SG 50 220", "SG 60 220", "SG 80 220"],
}
SPECIAL = {62: "Vista 3D · Versione componibile su misura", 63: "Vista 3D · Abbinamento tramite braccio rigido"}

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


def grid_row(n, w, y):
    total = n * w + (n - 1) * GAP
    x0 = BOX[0] + (BOX[2] - BOX[0] - total) / 2
    return [(x0 + i * (w + GAP), y, w, w * 0.75) for i in range(n)]


def layout_big_two():
    """One large render on the left, two stacked on the right, filling the panel."""
    bw, bh = BOX[2] - BOX[0], BOX[3] - BOX[1]
    aw = bh * 4 / 3
    pw = bw - aw - GAP
    ph = pw * 0.75
    return [(BOX[0], BOX[1], aw, bh), (BOX[0] + aw + GAP, BOX[1], pw, ph), (BOX[0] + aw + GAP, BOX[1] + bh - ph, pw, ph)]


def layout_door(n_asm):
    """Assemblies (one or two) over the three parts; both rows share one overall width."""
    bh = BOX[3] - BOX[1]
    total = (6 * (bh - 12) / 0.75 + 3 * GAP + 4 * GAP) / 5
    w1, w2 = (total - GAP) / 2, (total - 2 * GAP) / 3
    return grid_row(n_asm, w1, BOX[1]) + grid_row(3, w2, BOX[1] + w1 * 0.75 + 12)


def layout_rows(n, per_row):
    bw, bh = BOX[2] - BOX[0], BOX[3] - BOX[1]
    w = (bw - (per_row - 1) * GAP) / per_row
    rows = -(-n // per_row)
    h = w * 0.75
    gap = min(GAP, (bh - rows * h) / (rows - 1)) if rows > 1 else 0
    y0 = BOX[1] + (bh - rows * h - (rows - 1) * gap) / 2
    out = []
    for r in range(rows):
        out += grid_row(min(per_row, n - r * per_row), w, y0 + r * (h + gap))
    return out


def shot(label, desc, render, rect, indicative=False):
    return dict(label=label, desc=desc, render=render, rect=rect, indicative=indicative)


def build(base_pdf, assemblies):
    """The 3D pages in reading order. `assemblies`: names of the assembly renders ('A-..+B-..')."""
    doc = pymupdf.open(base_pdf)
    pages = []

    def printed(pno):
        return f"{pno - 1:02d}"

    def add(after, src, eyebrow, title, right, note, shots, codes, refs):
        pages.append(dict(after=after, src=src, label=f"{printed(after)} · 3D", eyebrow=eyebrow, title=title, right=right, note=note, shots=shots, codes=codes, refs=refs))

    for p in DOOR:
        info = page_info(doc, p)
        codes = [c for c, _ in info["rows"]]
        # Assemblies in the order of the page's table (B 320 before B 220).
        asms = sorted((n for n in assemblies if n.startswith(rid(codes[0]) + "+")), key=lambda n: codes.index(n.split("+")[1].replace("-", " ")))
        rects = layout_door(len(asms))
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
        rects = layout_big_two()
        shots = [shot(f"{codes[0]} + {codes[1]}", "Montaggio", asm, rects[0])]
        shots += [shot(c, describe(c, info["rows"]), rid(c), rects[1 + i]) for i, c in enumerate(codes)]
        add(p + 1, p, "Vista 3D · Abbinamento staffa / contrappeso", f"Vista 3D — {codes[0]} / {codes[1]}",
            "Render fotorealistico · versione DX", NOTE_HAND, shots, codes, [(p, info["printed"]), (p + 1, printed(p + 1))])

    for p, codes in SG_PAGES.items():
        info = page_info(doc, p)
        rects = layout_rows(len(codes), 3)
        shots = [shot(c, describe(c, []), rid(c), rects[i]) for i, c in enumerate(codes)]
        add(p, p, "Vista 3D · Staffe guide standard fisse", "Vista 3D — " + info["title"].replace("Serie SG — L", "Serie SG, l"),
            "Render fotorealistico", NOTE_PLAIN, shots, codes, [(p, info["printed"])])

    for p, eyebrow in SPECIAL.items():
        info = page_info(doc, p)
        codes = [c for c, _ in info["rows"]]
        if len(codes) == 3:  # the squared bracket large, the corner bracket and the arm beside it
            shown, rects = [codes[1], codes[0], codes[2]], layout_big_two()
        else:
            shown, rects = codes, layout_rows(len(codes), len(codes))
        shots = [shot(c, describe(c, info["rows"]), rid(c), rects[i], c in INDICATIVE) for i, c in enumerate(shown)]
        add(p, p, eyebrow, f"Vista 3D — {info['title']}", "Render fotorealistico", NOTE_SPECIAL, shots, codes, [(p, info["printed"])])
    return pages
