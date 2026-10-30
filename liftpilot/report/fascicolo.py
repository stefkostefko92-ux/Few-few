#!/usr/bin/env python3
"""Relazione tecnica di modifica laid out as the owner's model (round 52): renders the blocks of
src/lib/report/rt2/model.ts (JSON on stdin) as an A4 PDF on stdout. A cover without a number, then pages headed
«Matricola n° … Commessa n° …», each section a label on the left and its lines on the right; the footer carries the
standard of reference, «pag. N» (the cover is not counted), the record's code, the notice and the credit. A text may
hold {PAGINE}: the pages after the cover, known after a first layout (the document is laid out twice).

Fonts: DejaVu Sans from REPORT_FONT_DIR (fonts.py); never the built-in Helvetica/Times. ReportLab 3.6 and later.
"""
import base64
import io
import json
import re
import sys
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas
from reportlab.platypus import Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

import firme
import fonts
import stamp
from images import decodable

fonts.register()

INK = colors.HexColor("#121829")
MUTED = colors.HexColor("#5a6480")
RULE = colors.HexColor("#d6dce6")
HEAD_BG = colors.HexColor("#eef1f6")
STATUS = {"ok": colors.HexColor("#1f7a4a"), "warn": colors.HexColor("#8f5500"), "fail": colors.HexColor("#b3261e"), "info": colors.HexColor("#3b4a73")}
ESITO = {"ok": "OK", "fail": "NON VERIFICATO", "warn": "ATTENZIONE", "info": ""}

BODY = ParagraphStyle("body", fontName="DejaVu", fontSize=8.8, leading=11.6, textColor=INK)
BOLD = ParagraphStyle("bold", parent=BODY, fontName="DejaVu-Bold")
CENTER = ParagraphStyle("center", parent=BODY, alignment=TA_CENTER)
CENTER_B = ParagraphStyle("centerb", parent=BOLD, alignment=TA_CENTER)
NOTE = ParagraphStyle("note", parent=BODY, fontSize=7.8, leading=10.2, textColor=MUTED)
LABEL = ParagraphStyle("label", parent=BOLD, fontSize=8.8, leading=11.6)
CELL = ParagraphStyle("cell", parent=BODY, fontSize=8.4, leading=11)
CELL_R = ParagraphStyle("cellr", parent=CELL, alignment=TA_RIGHT)
HEAD = ParagraphStyle("head", parent=CELL, fontName="DejaVu-Bold", textColor=colors.HexColor("#3b4a73"))
TITLE = ParagraphStyle("title", parent=BOLD, fontSize=10, leading=13, alignment=TA_CENTER)
COVER_T = ParagraphStyle("covert", parent=BOLD, fontSize=17, leading=22, alignment=TA_CENTER)
COVER_N = ParagraphStyle("covern", parent=BOLD, fontSize=12, leading=16, alignment=TA_CENTER)

PAGE_W, PAGE_H = A4
LEFT, RIGHT = 20 * mm, 14 * mm
FRAME_W = PAGE_W - LEFT - RIGHT
LABEL_W = FRAME_W * 0.29
LINES_W = FRAME_W - LABEL_W
LOGO_W, LOGO_H = 70 * mm, 34 * mm

SUBSCRIPT = re.compile(r"(?<=[A-Za-zΑ-Ωα-ω])_([A-Za-z0-9]+)")
SUPERSCRIPT = re.compile(r"\^\(([^()]{1,24})\)")
IMAGES = {}
PAGINE = {"n": 0}


def markup(text):
    s = escape(str(text)).replace("{PAGINE}", str(PAGINE["n"]))
    s = SUPERSCRIPT.sub(r"<super>\1</super>", SUBSCRIPT.sub(r"<sub>\1</sub>", s))
    return s.replace("\n", "<br/>")


def p(text, style=BODY):
    return Paragraph(markup(text), style)


def esito_style(esito):
    return ParagraphStyle("es_" + esito, parent=CELL, fontName="DejaVu-Bold", textColor=STATUS.get(esito, INK), alignment=TA_RIGHT)


NUMBER = re.compile(r"^[-+]?[\d.,]+$|^—$")


def lines_table(righe):
    """The right column of a section: texts over the whole column, values on five columns — a value that is a word,
    not a number, runs from the value's column to the end of the line, aligned left."""
    data, spans = [], []
    widths = [LINES_W * w for w in (0.40, 0.15, 0.15, 0.11, 0.19)]
    for i, r in enumerate(righe):
        if r["t"] == "testo":
            data.append([p(r["s"], BOLD if r.get("b") else CELL), "", "", "", ""])
            spans.append(("SPAN", (0, i), (-1, i)))
            continue
        esito = r.get("esito") or ""
        if not NUMBER.match(r["v"]) and not r.get("u") and not esito:
            data.append([p(r["l"], CELL), p(r.get("sym") or "", CELL), p(r["v"], CELL), "", ""])
            spans.append(("SPAN", (2, i), (-1, i)))
        else:
            data.append([p(r["l"], CELL), p(r.get("sym") or "", CELL), p(r["v"], CELL_R), p(r.get("u") or "", CELL),
                         p(ESITO.get(esito, ""), esito_style(esito)) if esito else ""])
    if not data:
        return Spacer(1, 1)
    t = Table(data, colWidths=widths)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 1.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.2),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ] + spans))
    return t


def sezione(b):
    t = Table([[p(b["l"], LABEL), lines_table(b["righe"])]], colWidths=[LABEL_W, LINES_W])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
    ]))
    return KeepTogether([t])


def tabella(b):
    head, rows = b["head"], b["rows"]
    n = max(1, len(head) or (len(rows[0]) if rows else 1))
    w = b.get("w")
    col_w = [FRAME_W * x for x in w] if w else [FRAME_W / n] * n
    data = ([[p(h, HEAD) for h in head]] if head else []) + [[p(c, CELL) for c in row] for row in rows]
    t = Table(data, colWidths=col_w, repeatRows=1 if head else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]
    if head:
        style.append(("BACKGROUND", (0, 0), (-1, 0), HEAD_BG))
    t.setStyle(TableStyle(style))
    return t


def logo(ref, max_w, max_h):
    img = IMAGES.get(ref) if ref else None
    data = base64.b64decode(img["data"]) if img else b""
    if not data or not decodable(data):
        return None
    iw, ih = ImageReader(io.BytesIO(data)).getSize()
    k = min(max_w / iw, max_h / ih)
    return Image(io.BytesIO(data), width=iw * k, height=ih * k)


def copertina(b):
    out = [Spacer(1, 18 * mm)]
    img = logo(b.get("logo"), LOGO_W, LOGO_H)
    out += [img, Spacer(1, 6 * mm)] if img else []
    out += [p(b["azienda"], COVER_N), Spacer(1, 26 * mm), p(b["titolo"], COVER_T), Spacer(1, 22 * mm)]
    rows = [[p(k, BOLD), p(v, BODY)] for k, v in b["righe"]]
    if rows:
        t = Table(rows, colWidths=[FRAME_W * 0.34, FRAME_W * 0.66])
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ]))
        out.append(t)
    if b.get("testo"):
        out += [Spacer(1, 12 * mm), p(b["testo"], CENTER)]
    out += [Spacer(1, 16 * mm), p("Commessa: " + b["commessa"], ParagraphStyle("cc", parent=BODY, alignment=TA_RIGHT)) if b.get("commessa") else Spacer(1, 1)]
    return out


def flow(blocks):
    out = []
    for b in blocks:
        kind = b["t"]
        if kind == "pagina":
            out.append(PageBreak())
        elif kind == "titolo":
            out += [p(b["s"], TITLE), Spacer(1, 4 * mm)]
        elif kind == "sez":
            out.append(sezione(b))
        elif kind == "testo":
            style = NOTE if b.get("nota") else (CENTER_B if b.get("b") and b.get("c") else CENTER if b.get("c") else BOLD if b.get("b") else BODY)
            out += [p(b["s"], style), Spacer(1, 1.5)]
        elif kind == "tab":
            out += [tabella(b), Spacer(1, 3)]
        elif kind == "spazio":
            out.append(Spacer(1, float(b["mm"]) * mm))
        elif kind == "copertina":
            out += copertina(b)
        elif kind == "firme":
            out.append(firme.block(b, FRAME_W, p, BOLD, BODY, INK, MUTED))
        else:
            raise ValueError("unknown block " + kind)
    return out


def numbered_canvas(meta, counts):
    class NumberedCanvas(canvas.Canvas):
        """Two passes: the cover has no frame, the others «pag. N» after it."""

        def __init__(self, *args, **kwargs):
            canvas.Canvas.__init__(self, *args, **kwargs)
            self._saved = []

        def showPage(self):
            self._saved.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            counts["pages"] = len(self._saved)
            for state in self._saved:
                self.__dict__.update(state)
                if self._pageNumber > 1:
                    self.draw_frame(self._pageNumber - 1)
                canvas.Canvas.showPage(self)
            canvas.Canvas.save(self)

        def draw_frame(self, n):
            self.saveState()
            self.setFont("DejaVu", 8.4)
            self.setFillColor(INK)
            top = PAGE_H - 11 * mm
            self.drawString(LEFT + FRAME_W * 0.30, top, "Matricola n°  " + meta["matricola"])
            self.drawString(LEFT + FRAME_W * 0.66, top, "Commessa  n°  " + meta["commessa"])
            self.setStrokeColor(RULE)
            self.setLineWidth(0.4)
            self.line(LEFT, top - 2.4 * mm, PAGE_W - RIGHT, top - 2.4 * mm)
            notice = meta.get("notice")
            y = [12.4 * mm, 9.2 * mm, 6 * mm] if notice else [9.6 * mm, 6.4 * mm]
            self.line(LEFT, y[0] + 3.4 * mm, PAGE_W - RIGHT, y[0] + 3.4 * mm)
            self.setFont("DejaVu", 7.2)
            self.setFillColor(MUTED)
            self.drawString(LEFT, y[0], "rif. norme " + meta["norma"])
            self.setFont("DejaVu-Bold", 8.4)
            self.setFillColor(INK)
            self.drawRightString(PAGE_W - RIGHT, y[0], "pag.  %d" % n)
            self.setFont("DejaVu", 7.2)
            self.setFillColor(MUTED)
            self.drawString(LEFT, y[1], meta["code"])
            credit, size = "Created and Designed by Carbon Stealth VCC · carbonstealth.eu", 7.2
            room = FRAME_W - 6 * mm - pdfmetrics.stringWidth(meta["code"], "DejaVu", 7.2)
            while size > 5.6 and pdfmetrics.stringWidth(credit, "DejaVu", size) > room:
                size -= 0.2
            self.setFont("DejaVu", size)
            self.drawRightString(PAGE_W - RIGHT, y[1], credit)
            if notice:
                self.setFont("DejaVu", 7.2)
                self.drawString(LEFT, y[2], notice)
            self.restoreState()

    return NumberedCanvas


def build(doc_model, out):
    meta = doc_model["meta"]
    counts = {}
    doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=LEFT, rightMargin=RIGHT, topMargin=19 * mm, bottomMargin=20 * mm,
                            title=meta["title"], author=meta["author"], subject=meta["subject"], creator="LiftPilot · Carbon Stealth VCC",
                            lang=stamp.LANG)
    doc.build(flow(doc_model["blocks"]), canvasmaker=numbered_canvas(meta, counts))
    return counts["pages"]


def main():
    doc_model = json.load(sys.stdin)
    IMAGES.update((doc_model.get("drawing") or {}).get("images") or {})
    stamp.date_from(doc_model["meta"])
    # first layout: how many pages follow the cover ({PAGINE}); the same blocks give the same count the second time
    PAGINE["n"] = max(0, build(doc_model, io.BytesIO()) - 1)
    out = io.BytesIO()
    build(doc_model, out)
    sys.stdout.buffer.write(out.getvalue())


if __name__ == "__main__":
    main()
