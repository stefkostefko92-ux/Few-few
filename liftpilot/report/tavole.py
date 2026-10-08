#!/usr/bin/env python3
"""Tavole di progetto: paints the drawing set laid out by src/lib/tavole (JSON on stdin) as a PDF on stdout.
Painter only: every position, size, word and colour arrives computed; paper millimetres, origin bottom-left, y up.

Fonts: DejaVu Sans (fonts.py), condensed lettering by horizontal scaling; the halo under a lettering is the outline of its
glyphs stroked in the paper's colour (glyphs.py), so each word is in the PDF once. The concrete speckle is the document's
tile, drawn once as a form and repeated inside a clipping path. Works with ReportLab 3.6 (Debian bookworm) and later.
"""
import base64
import io
import json
import math
import sys

from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

import fonts
from glyphs import Outlines
from images import decodable

K = 72 / 25.4  # points per millimetre

_OUTLINES = {}


def outlines(font):
    """The glyph outlines of a registered font (fonts.py), read once."""
    if font not in _OUTLINES:
        _OUTLINES[font] = Outlines(fonts.path_of(font))
    return _OUTLINES[font]


class Painter:
    def __init__(self, c, doc):
        self.c = c
        self.palette = {k: colors.HexColor(v) for k, v in doc["palette"].items()}
        self.cond = doc["cond"]
        self.patterns = doc["patterns"]
        self.forms = set()
        # the glyph forms of the halos drawn (glyph_form)
        self.halos = set()
        # the logos by name: the company's ("logo") and the client's ("client"); one that does not decode stays out
        raw = {k: base64.b64decode(v["data"]) for k, v in doc.get("images", {}).items()}
        self.images = {k: ImageReader(io.BytesIO(data)) for k, data in raw.items() if decodable(data)}

    # --- strokes and paths -------------------------------------------------------------------------------------
    def stroke_style(self, s):
        c = self.c
        c.setStrokeColor(self.palette[s["ink"]])
        c.setLineWidth(s["w"] * K)
        dash = s.get("dash")
        c.setDash([d * K for d in dash] if dash else [])

    def path(self, pts, closed):
        p = self.c.beginPath()
        p.moveTo(pts[0][0] * K, pts[0][1] * K)
        for x, y in pts[1:]:
            p.lineTo(x * K, y * K)
        if closed:
            p.close()
        return p

    def fill(self, f, path, bbox):
        c = self.c
        if f["k"] == "solid":
            c.setFillColor(self.palette[f["ink"]])
            c.drawPath(path, stroke=0, fill=1)
            return
        # pattern: the tile as a form, repeated over the bounding box inside the clipping path
        pid = f["id"]
        tile = self.patterns[pid]
        if pid not in self.forms:
            self.make_form(pid, tile)
        c.saveState()
        c.clipPath(path, stroke=0, fill=0)
        x0, y0, x1, y1 = bbox
        w, h = tile["w"], tile["h"]
        y = math.floor(y0 / h) * h
        while y < y1:
            x = math.floor(x0 / w) * w
            while x < x1:
                c.saveState()
                c.translate(x * K, y * K)
                c.doForm(pid)
                c.restoreState()
                x += w
            y += h
        c.restoreState()

    def make_form(self, pid, tile):
        c = self.c
        c.beginForm(pid, lowerx=0, lowery=0, upperx=tile["w"] * K, uppery=tile["h"] * K)
        for s in tile["shapes"]:
            self.shape(s)
        c.endForm()
        self.forms.add(pid)

    # --- lettering ---------------------------------------------------------------------------------------------
    def text(self, s):
        c = self.c
        font = "DejaVu-Bold" if s.get("bold") else "DejaVu"
        size = s["size"] * K
        scale = self.cond if s.get("cond") else 1.0
        width = stringWidth(s["text"], font, size) * scale
        dx = {"l": 0, "c": -width / 2, "r": -width}[s.get("align", "l")]
        c.saveState()
        c.translate(s["at"][0] * K, s["at"][1] * K)
        if s.get("angle"):
            c.rotate(s["angle"])
        # the halo: the letters' outlines stroked in the paper's colour under them, a path (the words are in the PDF once)
        if s.get("halo"):
            self.halo(s["text"], font, size, scale, dx)
        t = c.beginText()
        t.setTextOrigin(dx, 0)
        t.setFont(font, size)
        t.setHorizScale(scale * 100)
        t.setFillColor(self.palette[s.get("ink", "ink")])
        t.textOut(s["text"])
        c.drawText(t)
        c.restoreState()

    def halo(self, text, font, size, scale, dx):
        """The outlines of `text` as the text object sets it (each glyph at its advance, scaled horizontally), stroked
        0,9 mm wide in the paper's colour with round joins, in the current coordinates (the text's origin). Each glyph at
        a size is drawn once, as a form, and placed where it recurs (the sheets repeat few signs at few sizes)."""
        c, g, pen = self.c, outlines(font), 0.0
        for ch in text:
            name = self.glyph_form(g, font, g.glyph(ch), size, scale)
            if name:
                c.saveState()
                c.translate(dx + pen * scale, 0)
                c.doForm(name)
                c.restoreState()
            pen += stringWidth(ch, font, size)

    def glyph_form(self, g, font, gid, size, scale):
        """The form of a glyph's halo at a size (origin on the baseline at the glyph's start); None for an empty glyph."""
        name = "H%s_%d_%d_%d" % ("b" if font.endswith("Bold") else "r", gid, round(size * 1000), round(scale * 1000))
        if name in self.forms:
            return name if name in self.halos else None
        self.forms.add(name)
        contours = g.contours(gid)
        if not contours:
            return None
        k = size / g.upm
        at = lambda q: (q[0] * k * scale, q[1] * k)
        xs = [at(q)[0] for cnt in contours for seg in cnt for q in seg[1:]]
        ys = [at(q)[1] for cnt in contours for seg in cnt for q in seg[1:]]
        m = 0.6 * K
        c = self.c
        c.beginForm(name, lowerx=min(xs) - m, lowery=min(ys) - m, upperx=max(xs) + m, uppery=max(ys) + m)
        p = c.beginPath()
        for contour in contours:
            cur = None
            for seg in contour:
                if seg[0] == "M":
                    cur = at(seg[1])
                    p.moveTo(*cur)
                elif seg[0] == "L":
                    cur = at(seg[1])
                    p.lineTo(*cur)
                else:
                    q, e = at(seg[1]), at(seg[2])
                    p.curveTo(cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1]),
                              e[0] + 2 / 3 * (q[0] - e[0]), e[1] + 2 / 3 * (q[1] - e[1]), e[0], e[1])
                    cur = e
            p.close()
        c.setStrokeColor(self.palette["paper"])
        c.setLineWidth(0.9 * K)
        c.setLineJoin(1)
        c.setLineCap(1)
        c.setDash([])
        c.drawPath(p, stroke=1, fill=0)
        c.endForm()
        self.halos.add(name)
        return name

    def image(self, s):
        img = self.images.get(s["ref"])
        if not img:
            return
        b = s["box"]
        iw, ih = img.getSize()
        bw, bh = b["x1"] - b["x0"], b["y1"] - b["y0"]
        k = min(bw / iw, bh / ih)
        w, h = iw * k, ih * k
        self.c.drawImage(img, (b["x0"] + (bw - w) / 2) * K, (b["y0"] + (bh - h) / 2) * K, w * K, h * K, mask="auto")

    # --- dispatch ----------------------------------------------------------------------------------------------
    def shape(self, s):
        c, t = self.c, s["t"]
        if t == "line":
            self.stroke_style(s["s"])
            c.line(s["a"][0] * K, s["a"][1] * K, s["b"][0] * K, s["b"][1] * K)
        elif t == "path":
            pts = s["pts"]
            if len(pts) < 2:
                return
            p = self.path(pts, s["closed"])
            if s.get("fill"):
                xs, ys = [q[0] for q in pts], [q[1] for q in pts]
                self.fill(s["fill"], p, (min(xs), min(ys), max(xs), max(ys)))
                p = self.path(pts, s["closed"])
            if s.get("s"):
                self.stroke_style(s["s"])
                c.drawPath(p, stroke=1, fill=0)
        elif t == "circle":
            x, y, r = s["c"][0] * K, s["c"][1] * K, s["r"] * K
            if s.get("fill"):
                f = s["fill"]
                if f["k"] == "solid":
                    c.setFillColor(self.palette[f["ink"]])
                    c.circle(x, y, r, stroke=0, fill=1)
            if s.get("s"):
                self.stroke_style(s["s"])
                c.circle(x, y, r, stroke=1, fill=0)
        elif t == "arc":
            self.stroke_style(s["s"])
            x, y, r = s["c"][0] * K, s["c"][1] * K, s["r"] * K
            c.arc(x - r, y - r, x + r, y + r, s["a0"], s["a1"] - s["a0"])
        elif t == "text":
            self.text(s)
        elif t == "image":
            self.image(s)
        else:
            raise ValueError("unknown shape " + t)


# Printed under the frame of every sheet of the PDF, outside the drawing (and its hash): what the sheets are and who
# answers for them.
NOTICE = ("Elaborato generato con LiftPilot (software di Carbon Stealth VCC): da verificare e firmare dal tecnico incaricato, "
          "che ne risponde; quote e dati da confermare in sito e sui documenti dei costruttori.")


def main():
    fonts.register()
    doc = json.load(sys.stdin)
    out = io.BytesIO()
    first = doc["pages"][0]
    c = canvas.Canvas(out, pagesize=(first["w"] * K, first["h"] * K), pageCompression=1)
    meta = doc["meta"]
    c.setTitle(meta["title"])
    c.setAuthor(meta["author"])
    c.setSubject(meta["subject"])
    c.setCreator("LiftPilot · Carbon Stealth VCC")
    painter = Painter(c, doc)
    for page in doc["pages"]:
        c.setPageSize((page["w"] * K, page["h"] * K))
        c.setLineCap(0)
        c.setLineJoin(1)
        for s in page["shapes"]:
            painter.shape(s)
        c.setFont("DejaVu", 5.2)
        c.setFillColorRGB(0.38, 0.38, 0.38)
        c.drawString(8 * K, 3.2 * K, NOTICE)
        c.showPage()
    c.save()
    sys.stdout.buffer.write(out.getvalue())


if __name__ == "__main__":
    main()
