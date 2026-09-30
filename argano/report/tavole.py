#!/usr/bin/env python3
"""Tavole di progetto: paints the drawing set laid out by src/lib/tavole (JSON on stdin) as a PDF on stdout.
Painter only: every position, size, word and colour arrives computed; paper millimetres, origin bottom-left, y up.

Fonts: DejaVu Sans (fonts.py), condensed lettering by horizontal scaling. The concrete speckle is the document's tile,
drawn once as a form and repeated inside a clipping path. Works with ReportLab 3.6 (Debian bookworm) and later.
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

K = 72 / 25.4  # points per millimetre


class Painter:
    def __init__(self, c, doc):
        self.c = c
        self.palette = {k: colors.HexColor(v) for k, v in doc["palette"].items()}
        self.cond = doc["cond"]
        self.patterns = doc["patterns"]
        self.forms = set()
        logo = doc.get("images", {}).get("logo")
        self.logo = ImageReader(io.BytesIO(base64.b64decode(logo["data"]))) if logo else None

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
        # the text rendering mode belongs to the graphics state: each pass in its own q/Q, so the halo's stroke mode
        # does not leak into the letters (a new text object assumes mode 0 and does not set it)
        for mode in ((1, 0) if s.get("halo") else (0,)):
            c.saveState()
            c.translate(s["at"][0] * K, s["at"][1] * K)
            if s.get("angle"):
                c.rotate(s["angle"])
            t = c.beginText()
            t.setTextOrigin(dx, 0)
            t.setFont(font, size)
            t.setHorizScale(scale * 100)
            if mode == 1:
                t.setTextRenderMode(1)
                c.setStrokeColor(self.palette["paper"])
                c.setLineWidth(0.9 * K)
                c.setLineJoin(1)
            else:
                t.setFillColor(self.palette[s.get("ink", "ink")])
            t.textOut(s["text"])
            c.drawText(t)
            c.restoreState()

    def image(self, s):
        if not self.logo:
            return
        b = s["box"]
        iw, ih = self.logo.getSize()
        bw, bh = b["x1"] - b["x0"], b["y1"] - b["y0"]
        k = min(bw / iw, bh / ih)
        w, h = iw * k, ih * k
        self.c.drawImage(self.logo, (b["x0"] + (bw - w) / 2) * K, (b["y0"] + (bh - h) / 2) * K, w * K, h * K, mask="auto")

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
    c.setCreator("Argano · Carbon Stealth VCC")
    painter = Painter(c, doc)
    for page in doc["pages"]:
        c.setPageSize((page["w"] * K, page["h"] * K))
        c.setLineCap(0)
        c.setLineJoin(1)
        for s in page["shapes"]:
            painter.shape(s)
        c.showPage()
    c.save()
    sys.stdout.buffer.write(out.getvalue())


if __name__ == "__main__":
    main()
