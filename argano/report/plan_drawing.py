"""Plan of the shaft in the relazione: the drawing items built by src/lib/report/shaft.ts (plan millimetres, y up like
the page) at the largest standard scale that fits the frame, walls hatched at 45°, texts on a paper halo so that they
stay readable over the lines. Layout only, like relazione.py: the words arrive written, the scale note has {n}.
"""
import math

from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import Flowable

SCALES = (10, 20, 25, 50, 100, 200)  # ISO 5455, plus the 1:25 of the lift layout drawings
MIN_TEXT_PT = 5.2
HATCH_MM = 60

PAPER = colors.white
INK = colors.HexColor("#121829")
INK2 = colors.HexColor("#3b4a73")
MUTED = colors.HexColor("#5a6480")
RULE = colors.HexColor("#d6dce6")
ACCENT = colors.HexColor("#1d3271")
FILL = {"car": colors.HexColor("#e4e9f5"), "cw": colors.HexColor("#e9ebf0"), "steel": colors.HexColor("#a9b1c2"), "door": colors.HexColor("#dde4f4")}
HATCH = (colors.HexColor("#9aa3b5"), 0.35)
# stroke colour and width [pt] by layer
STROKE = {"MURI": (INK2, 0.5), "VANO": (INK, 1.0), "CABINA": (ACCENT, 0.6), "PORTE": (ACCENT, 0.45), "GUIDE": (MUTED, 0.4),
          "CONTRAPPESO": (MUTED, 0.45), "QUOTE": (MUTED, 0.3), "TESTI": (INK, 0.4)}


class Plan(Flowable):
    """Frame with the drawing to scale, and the scale under the frame on the right."""

    PAD = 3 * mm
    NOTE = 11

    def __init__(self, block, width):
        Flowable.__init__(self)
        b = block["bounds"]
        self.items = block["items"]
        self.min_x, self.min_y = b["minX"], b["minY"]
        w, h = b["maxX"] - b["minX"], b["maxY"] - b["minY"]
        room_w, room_h = width - 2 * self.PAD, block["maxHeight"] * mm
        self.n = next((n for n in SCALES if w * mm / n <= room_w and h * mm / n <= room_h), SCALES[-1])
        self.k = mm / self.n  # points per millimetre of the plan
        self.draw_w, self.draw_h = w * self.k, h * self.k
        self.width, self.height = width, self.draw_h + 2 * self.PAD + self.NOTE
        self.scale = block["scale"].replace("{n}", str(self.n))
        self.hAlign = "CENTER"  # full frame width like the tables, which run over the frame padding

    def wrap(self, avail_width, avail_height):
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.saveState()
        c.setStrokeColor(RULE)
        c.setLineWidth(0.5)
        c.rect(0, self.NOTE, self.width, self.draw_h + 2 * self.PAD, stroke=1, fill=0)
        c.setFont("DejaVu", 7.2)
        c.setFillColor(MUTED)
        c.drawRightString(self.width, 2.5, self.scale)
        c.translate((self.width - self.draw_w) / 2 - self.min_x * self.k, self.NOTE + self.PAD - self.min_y * self.k)
        c.scale(self.k, self.k)
        c.setLineJoin(1)
        c.setLineCap(1)
        for it in self.items:
            if it["k"] == "poly":
                self.poly(it)
            elif it["k"] == "line":
                self.stroke(it["layer"])
                c.line(it["a"][0], it["a"][1], it["b"][0], it["b"][1])
        for it in self.items:  # texts last, over every line
            if it["k"] == "text":
                self.text(it)
        c.restoreState()

    def path(self, pts, closed):
        p = self.canv.beginPath()
        p.moveTo(pts[0][0], pts[0][1])
        for x, y in pts[1:]:
            p.lineTo(x, y)
        if closed:
            p.close()
        return p

    def stroke(self, layer):
        color, width = STROKE.get(layer, (INK, 0.4))
        self.canv.setStrokeColor(color)
        self.canv.setLineWidth(width / self.k)

    def poly(self, it):
        c, pts, fill = self.canv, it["pts"], it.get("fill")
        if fill == "wall":
            self.hatch(pts)
        elif fill in FILL:
            c.setFillColor(FILL[fill])
            c.drawPath(self.path(pts, True), stroke=0, fill=1)
        self.stroke(it["layer"])
        c.drawPath(self.path(pts, it["closed"]), stroke=1, fill=0)

    def hatch(self, pts):
        c = self.canv
        c.saveState()
        c.clipPath(self.path(pts, True), stroke=0, fill=0)
        c.setStrokeColor(HATCH[0])
        c.setLineWidth(HATCH[1] / self.k)
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        y0, y1 = min(ys), max(ys)
        # lines x = y + o on one grid for all the walls, so that the hatch runs on from a wall to the next
        o = math.floor((min(xs) - y1) / HATCH_MM) * HATCH_MM
        while o <= max(xs) - y0:
            c.line(y0 + o, y0, y1 + o, y1)
            o += HATCH_MM
        c.restoreState()

    def text(self, it):
        c = self.canv
        bold = it["layer"] == "TESTI"
        font = "DejaVu-Bold" if bold else "DejaVu"
        size = max(it["h"], MIN_TEXT_PT / self.k)
        width = c.stringWidth(it["text"], font, size)
        dx = {"l": 0, "c": -width / 2, "r": -width}[it["align"]]
        c.saveState()
        c.translate(it["at"][0], it["at"][1])
        if it["angle"]:
            c.rotate(math.degrees(it["angle"]))
        c.setFont(font, size)
        c.setStrokeColor(PAPER)
        c.setLineWidth(1.8 / self.k)
        c.drawString(dx, 0, it["text"], mode=1)
        c.setFillColor(INK if bold else INK2)
        c.drawString(dx, 0, it["text"], mode=0)
        c.restoreState()
