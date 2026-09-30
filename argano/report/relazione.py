#!/usr/bin/env python3
"""Relazione di calcolo: renders the report model built by src/lib/report/build.ts (JSON on stdin) as an A4 PDF
on stdout. Layout only: every text and number arrives already written and formatted in Italian.

Fonts: DejaVu Sans registered from REPORT_FONT_DIR (Cyrillic, Greek and technical symbols); never the built-in
Helvetica/Times. Works with ReportLab 3.6 (Debian bookworm) and later.
"""
import json
import os
import sys
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import CondPageBreak, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

FONT_DIR = os.environ.get("REPORT_FONT_DIR", "/usr/share/fonts/truetype/dejavu")
pdfmetrics.registerFont(TTFont("DejaVu", os.path.join(FONT_DIR, "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("DejaVu-Bold", os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf")))
pdfmetrics.registerFontFamily("DejaVu", normal="DejaVu", bold="DejaVu-Bold", italic="DejaVu", boldItalic="DejaVu-Bold")

INK = colors.HexColor("#121829")
MUTED = colors.HexColor("#5a6480")
RULE = colors.HexColor("#d6dce6")
HEAD_BG = colors.HexColor("#eef1f6")
ACCENT = colors.HexColor("#1d3271")
STATUS = {"ok": colors.HexColor("#1f7a4a"), "warn": colors.HexColor("#8f5500"), "fail": colors.HexColor("#b3261e"), "info": colors.HexColor("#3b4a73")}
WARN_BG = colors.HexColor("#fbefd9")

BODY = ParagraphStyle("body", fontName="DejaVu", fontSize=8.6, leading=11.4, textColor=INK)
CELL = ParagraphStyle("cell", parent=BODY, fontSize=7.8, leading=10)
CELL_R = ParagraphStyle("cellr", parent=CELL, alignment=TA_RIGHT)
HEAD = ParagraphStyle("head", parent=CELL, fontName="DejaVu-Bold", textColor=colors.HexColor("#3b4a73"))
HEAD_R = ParagraphStyle("headr", parent=HEAD, alignment=TA_RIGHT)
NOTE = ParagraphStyle("note", parent=BODY, fontSize=7.8, leading=10.2, textColor=MUTED)
H1 = ParagraphStyle("h1", parent=BODY, fontName="DejaVu-Bold", fontSize=15.5, leading=19, spaceAfter=2)
SUB = ParagraphStyle("sub", parent=BODY, fontSize=9, leading=12, textColor=MUTED)
H2 = ParagraphStyle("h2", parent=BODY, fontName="DejaVu-Bold", fontSize=10.8, leading=14, spaceBefore=9, spaceAfter=3, textColor=INK)
H3 = ParagraphStyle("h3", parent=BODY, fontName="DejaVu-Bold", fontSize=9, leading=12, spaceBefore=5, spaceAfter=2)
BOX = ParagraphStyle("box", parent=BODY, fontSize=8.4, leading=11.2, textColor=colors.HexColor("#6b4000"))
VERDICT = ParagraphStyle("verdict", parent=BODY, fontName="DejaVu-Bold", fontSize=11, leading=14, spaceBefore=4)

PAGE_W, PAGE_H = A4
MARGIN = 16 * mm
FRAME_W = PAGE_W - 2 * MARGIN


def p(text, style=BODY):
    return Paragraph(escape(str(text)).replace("\n", "<br/>"), style)


def kv(rows):
    data = [[p(k, NOTE), p(v, CELL)] for k, v in rows]
    t = Table(data, colWidths=[FRAME_W * 0.34, FRAME_W * 0.66])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def grid(block):
    head, rows = block["head"], block["rows"]
    n = len(head)
    align = block.get("align") or (["l"] + ["r"] * (n - 1))
    widths = block.get("widths")
    col_w = [FRAME_W * w for w in widths] if widths else [FRAME_W * 0.34] + [FRAME_W * 0.66 / (n - 1)] * (n - 1) if n > 1 else [FRAME_W]
    status = block.get("status") or []
    scol = block.get("statusCol", n - 1)

    def style_of(i, j):
        base = CELL_R if align[j] == "r" else CELL
        s = status[i] if i < len(status) else ""
        if j == scol and s in STATUS:
            return ParagraphStyle("st_%s_%s" % (s, align[j]), parent=base, fontName="DejaVu-Bold", textColor=STATUS[s])
        return base

    data = [[p(h, HEAD_R if align[j] == "r" else HEAD) for j, h in enumerate(head)]]
    for i, row in enumerate(rows):
        data.append([p(c, style_of(i, j)) for j, c in enumerate(row)])
    t = Table(data, colWidths=col_w, repeatRows=1)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), HEAD_BG),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 2.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2),
        ("LEFTPADDING", (0, 0), (-1, -1), 2.5), ("RIGHTPADDING", (0, 0), (-1, -1), 2.5),
    ]
    t.setStyle(TableStyle(style))
    return t


def box(text):
    t = Table([[p(text, BOX)]], colWidths=[FRAME_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WARN_BG),
        ("LINEBEFORE", (0, 0), (0, -1), 2.2, STATUS["warn"]),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ]))
    return t


def sign(labels):
    cells = [p(x, NOTE) for x in labels]
    t = Table([cells], colWidths=[FRAME_W * 0.46, FRAME_W * 0.30, FRAME_W * 0.24])
    t.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.8, INK),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    return KeepTogether([Spacer(1, 22 * mm), t])


def flow(blocks):
    out = []
    for b in blocks:
        kind = b["t"]
        if kind == "h1":
            out.append(p(b["text"], H1))
        elif kind == "sub":
            out.append(p(b["text"], SUB))
        elif kind == "h2":
            out += [CondPageBreak(28 * mm), p(b["text"], H2)]
        elif kind == "h3":
            out += [CondPageBreak(20 * mm), p(b["text"], H3)]
        elif kind == "p":
            out.append(p(b["text"], NOTE if b.get("style") == "note" else BODY))
            out.append(Spacer(1, 2))
        elif kind == "box":
            out += [Spacer(1, 4), box(b["text"]), Spacer(1, 4)]
        elif kind == "kv":
            out.append(kv(b["rows"]))
        elif kind == "grid":
            out.append(grid(b))
            out.append(Spacer(1, 3))
        elif kind == "list":
            for item in b["items"]:
                out.append(Paragraph(escape(item), ParagraphStyle("li", parent=BODY, leftIndent=9, bulletIndent=0), bulletText="•"))
        elif kind == "verdict":
            out.append(p(b["text"], ParagraphStyle("v", parent=VERDICT, textColor=STATUS.get(b.get("status"), INK))))
        elif kind == "sign":
            out.append(sign(b["labels"]))
        else:
            raise ValueError("unknown block " + kind)
    return out


def numbered_canvas(meta):
    class NumberedCanvas(canvas.Canvas):
        """Two passes: 'pagina N di M' needs the total."""

        def __init__(self, *args, **kwargs):
            canvas.Canvas.__init__(self, *args, **kwargs)
            self._saved = []

        def showPage(self):
            self._saved.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._saved)
            for state in self._saved:
                self.__dict__.update(state)
                self.draw_frame(total)
                canvas.Canvas.showPage(self)
            canvas.Canvas.save(self)

        def draw_frame(self, total):
            self.saveState()
            self.setFont("DejaVu", 7.2)
            self.setFillColor(MUTED)
            top = PAGE_H - 10 * mm
            self.drawString(MARGIN, top, meta["header"])
            self.drawRightString(PAGE_W - MARGIN, top, "Pagina %d di %d" % (self._pageNumber, total))
            self.setStrokeColor(RULE)
            self.setLineWidth(0.4)
            self.line(MARGIN, top - 2.2 * mm, PAGE_W - MARGIN, top - 2.2 * mm)
            self.line(MARGIN, 12.5 * mm, PAGE_W - MARGIN, 12.5 * mm)
            self.drawString(MARGIN, 9 * mm, meta["footer"])
            self.drawRightString(PAGE_W - MARGIN, 9 * mm, "Created and Designed by Carbon Stealth VCC · carbonstealth.eu")
            self.drawString(MARGIN, 5.8 * mm, meta["code"])
            self.restoreState()

    return NumberedCanvas


def main():
    doc_model = json.load(sys.stdin)
    meta = doc_model["meta"]
    out = sys.stdout.buffer
    doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=17 * mm, bottomMargin=17 * mm,
                            title=meta["title"], author=meta["author"], subject=meta["subject"], creator="Argano · Carbon Stealth VCC")
    doc.build(flow(doc_model["blocks"]), canvasmaker=numbered_canvas(meta))


if __name__ == "__main__":
    main()
