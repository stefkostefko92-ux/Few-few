"""Plan of the shaft in the relazione: the view laid out by src/lib/report/shaft.ts with the drawing kernel (paper
millimetres, y up, already at its scale), painted by the painter of the drawing set (tavole.py) inside a light frame,
with the scale under it on the right. Layout only, like relazione.py: every position and word arrives computed.
"""
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import Flowable

from tavole import Painter

RULE = colors.HexColor("#d6dce6")
MUTED = colors.HexColor("#5a6480")

# one painter per canvas: the concrete tile is a form of the document, defined once
_PAINTERS = {}


def painter_for(canv, drawing):
    p = _PAINTERS.get(id(canv))
    if p is None or p.c is not canv:
        p = _PAINTERS[id(canv)] = Painter(canv, drawing)
    return p


class Plan(Flowable):
    """Frame with the view, and the scale under the frame on the right."""

    NOTE = 11

    def __init__(self, block, width, drawing):
        Flowable.__init__(self)
        self.block, self.drawing = block, drawing
        self.draw_w, self.draw_h = block["w"] * mm, block["h"] * mm
        self.width, self.height = width, self.draw_h + self.NOTE
        self.hAlign = "CENTER"

    def wrap(self, avail_width, avail_height):
        return self.width, self.height

    def draw(self):
        c = self.canv
        painter = painter_for(c, self.drawing)
        c.saveState()
        c.setStrokeColor(RULE)
        c.setLineWidth(0.5)
        c.rect(0, self.NOTE, self.width, self.draw_h, stroke=1, fill=0)
        c.setFont("DejaVu", 7.2)
        c.setFillColor(MUTED)
        c.drawRightString(self.width, 2.5, self.block["scale"])
        c.translate((self.width - self.draw_w) / 2, self.NOTE)
        c.setLineCap(0)
        c.setLineJoin(1)
        for s in self.block["shapes"]:
            painter.shape(s)
        c.restoreState()
