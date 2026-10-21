"""The signatures of the relazione tecnica di modifica (block 'firme', src/lib/report/model.ts): columns side by side —
who drew the document up, who checked it —, each a title, its lines and an empty box for the hand (the signature, the
stamp) under its label; the whole block is kept together on one page. Layout only: the texts arrive written in Italian.
"""
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, KeepTogether, Spacer, Table, TableStyle

LABEL_SIZE = 6.8
LABEL_ROOM = 4.2 * mm  # the label above the box
GUTTER = 8 * mm  # between two columns
MAX_BOX_H = 80 * mm


class HandBox(Flowable):
    """An empty frame w × h for the hand, its label written above it."""

    def __init__(self, w, h, label, ink, muted):
        Flowable.__init__(self)
        self.w, self.h, self.label, self.ink, self.muted = w, h, label, ink, muted

    def wrap(self, avail_w, avail_h):
        return self.w, self.h + LABEL_ROOM

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFont("DejaVu", LABEL_SIZE)
        c.setFillColor(self.muted)
        c.drawString(0, self.h + 1.5 * mm, self.label)
        c.setStrokeColor(self.ink)
        c.setLineWidth(0.6)
        c.rect(0, 0, self.w, self.h, stroke=1, fill=0)
        c.restoreState()


def block(b, frame_w, para, title_style, line_style, ink, muted):
    """The flowable of a 'firme' block: `para(text, style)` writes a paragraph as the rest of the document does."""
    cols = b["cols"] or []
    n = max(1, len(cols))
    col_w = frame_w / n
    cells = []
    for i, col in enumerate(cols):
        inner = col_w - (GUTTER if i < n - 1 else 0)
        box = col["box"]
        w = max(10 * mm, min(float(box["w"]) * mm, inner))
        h = max(10 * mm, min(float(box["h"]) * mm, MAX_BOX_H))
        cell = [para(col["title"], title_style)]
        cell += [para(line, line_style) for line in col["lines"]]
        cell += [Spacer(1, 4 * mm), HandBox(w, h, box["label"], ink, muted)]
        cells.append(cell)
    t = Table([cells or [""]], colWidths=[col_w] * n)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEABOVE", (0, 0), (-1, 0), 0.8, ink),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]
    if n > 1:
        style.append(("RIGHTPADDING", (0, 0), (n - 2, 0), GUTTER))
    t.setStyle(TableStyle(style))
    return KeepTogether([Spacer(1, 8 * mm), t])
