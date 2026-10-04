#!/usr/bin/env python3
"""Views of a report as pictures: every 'plan' block of the report model (JSON on stdin, the same the PDF takes) painted
as a PNG at 300 dpi, the list as JSON on stdout ([base64, ...] in the order of the blocks). The Word document carries
them (src/lib/order/docx.ts): Word has no use for the PDF's vector views.

The same painter as tavole.py, on Pillow: paper millimetres, origin bottom-left, y up; drawn at twice the resolution and
scaled down, so lines and lettering keep their edges smooth. Dashes are laid along each path, condensed lettering is
scaled horizontally, the halo is a stroke in the paper's colour under the letters. Pillow comes with ReportLab
(Debian's python3-reportlab depends on python3-pil).
"""
import base64
import io
import json
import math
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFont

FONT_DIR = os.environ.get("REPORT_FONT_DIR", "/usr/share/fonts/truetype/dejavu")
DPI, SUPER = 300, 2
K = DPI * SUPER / 25.4  # pixels per millimetre while drawing


def rgb(hex_colour):
    h = hex_colour.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


class Painter:
    def __init__(self, img, height_mm, doc, fonts, tiles=None):
        self.img, self.h = img, height_mm
        self.draw = ImageDraw.Draw(img)
        self.palette = {k: rgb(v) for k, v in doc["palette"].items()}
        self.cond = doc["cond"]
        self.doc, self.fonts = doc, fonts
        self.tiles = {} if tiles is None else tiles

    def px(self, p):
        return (p[0] * K, (self.h - p[1]) * K)

    def width(self, s):
        return max(1, int(round(s["w"] * K)))

    # --- strokes ---------------------------------------------------------------------------------------------------
    def polyline(self, pts, s):
        colour, w, dash = self.palette[s["ink"]], self.width(s), s.get("dash")
        if not dash:
            self.draw.line(pts, fill=colour, width=w, joint="curve")
            return
        pattern = [max(d * K, 0.5) for d in dash]
        k, left, on = 0, pattern[0], True
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            seg, pos = math.hypot(x1 - x0, y1 - y0), 0.0
            while seg > 0 and pos < seg:
                step = min(left, seg - pos)
                if on:
                    a, b = pos / seg, (pos + step) / seg
                    self.draw.line([(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a), (x0 + (x1 - x0) * b, y0 + (y1 - y0) * b)], fill=colour, width=w)
                pos += step
                left -= step
                if left <= 1e-9:
                    k = (k + 1) % len(pattern)
                    left, on = pattern[k], not on

    # --- fills -----------------------------------------------------------------------------------------------------
    def tile(self, pid):
        t = self.tiles.get(pid)
        if t is None:
            spec = self.doc["patterns"][pid]
            t = Image.new("RGBA", (max(1, int(round(spec["w"] * K))), max(1, int(round(spec["h"] * K)))), (0, 0, 0, 0))
            sub = Painter(t, spec["h"], self.doc, self.fonts, self.tiles)
            for s in spec["shapes"]:
                sub.shape(s)
            self.tiles[pid] = t
        return t

    def pattern_fill(self, pid, pts):
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        bx, by = int(math.floor(min(xs))), int(math.floor(min(ys)))
        bw, bh = int(math.ceil(max(xs))) - bx + 1, int(math.ceil(max(ys))) - by + 1
        if bw <= 1 or bh <= 1:
            return
        tile = self.tile(pid)
        spec = self.doc["patterns"][pid]
        tw, th = spec["w"] * K, spec["h"] * K
        layer = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
        # the tiles on the page's grid (as the PDF repeats them from its origin), y measured up from the bottom
        page_h = self.h * K
        gx = math.floor(bx / tw) * tw
        while gx < bx + bw:
            y_up = math.floor((page_h - (by + bh)) / th) * th
            while y_up < page_h - by:
                top = page_h - y_up - th
                layer.paste(tile, (int(round(gx - bx)), int(round(top - by))))
                y_up += th
            gx += tw
        mask = Image.new("L", (bw, bh), 0)
        ImageDraw.Draw(mask).polygon([(x - bx, y - by) for x, y in pts], fill=255)
        self.img.paste(layer, (bx, by), ImageChops.multiply(layer.getchannel("A"), mask))

    # --- lettering -------------------------------------------------------------------------------------------------
    def font(self, bold, size):
        key = (bold, size)
        f = self.fonts.get(key)
        if f is None:
            f = self.fonts[key] = ImageFont.truetype(os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"), size)
        return f

    def text(self, s):
        txt = s["text"]
        if not txt:
            return
        font = self.font(bool(s.get("bold")), max(1, int(round(s["size"] * K))))
        halo = int(round(0.45 * K)) if s.get("halo") else 0
        l, t, r, b = font.getbbox(txt, anchor="ls", stroke_width=halo)
        pad = 2 + halo
        tmp = Image.new("RGBA", (r - l + 2 * pad, b - t + 2 * pad), (0, 0, 0, 0))
        d, ox, oy = ImageDraw.Draw(tmp), pad - l, pad - t
        if halo:
            paper = self.palette["paper"]
            d.text((ox, oy), txt, font=font, anchor="ls", fill=paper, stroke_width=halo, stroke_fill=paper)
        d.text((ox, oy), txt, font=font, anchor="ls", fill=self.palette[s.get("ink", "ink")])
        scale = self.cond if s.get("cond") else 1.0
        if scale != 1.0:
            tmp = tmp.resize((max(1, int(round(tmp.width * scale))), tmp.height), Image.LANCZOS)
            ox *= scale
        advance = font.getlength(txt) * scale
        dx = {"l": 0.0, "c": -advance / 2, "r": -advance}[s.get("align", "l")]
        cx, cy = ox - dx, oy  # the text's origin in the picture
        angle = s.get("angle") or 0
        if angle:
            R = int(math.ceil(max(math.hypot(cx - x, cy - y) for x in (0, tmp.width) for y in (0, tmp.height)))) + 2
            big = Image.new("RGBA", (2 * R, 2 * R), (0, 0, 0, 0))
            big.paste(tmp, (int(round(R - cx)), int(round(R - cy))))
            tmp, cx, cy = big.rotate(angle, resample=Image.BICUBIC, center=(R, R)), R, R
        X, Y = self.px(s["at"])
        self.img.paste(tmp, (int(round(X - cx)), int(round(Y - cy))), tmp)

    def image(self, s):
        data = (self.doc.get("images") or {}).get(s["ref"])
        if not data:
            return
        pic = Image.open(io.BytesIO(base64.b64decode(data["data"]))).convert("RGBA")
        b = s["box"]
        bw, bh = (b["x1"] - b["x0"]) * K, (b["y1"] - b["y0"]) * K
        k = min(bw / pic.width, bh / pic.height)
        pic = pic.resize((max(1, int(pic.width * k)), max(1, int(pic.height * k))), Image.LANCZOS)
        X, Y = self.px((b["x0"], b["y1"]))
        self.img.paste(pic, (int(X + (bw - pic.width) / 2), int(Y + (bh - pic.height) / 2)), pic)

    # --- dispatch --------------------------------------------------------------------------------------------------
    def shape(self, s):
        t = s["t"]
        if t == "line":
            self.polyline([self.px(s["a"]), self.px(s["b"])], s["s"])
        elif t == "path":
            pts = [self.px(p) for p in s["pts"]]
            if len(pts) < 2:
                return
            f = s.get("fill")
            if f and len(pts) >= 3:
                if f["k"] == "solid":
                    self.draw.polygon(pts, fill=self.palette[f["ink"]])
                else:
                    self.pattern_fill(f["id"], pts)
            if s.get("s"):
                self.polyline(pts + [pts[0]] if s["closed"] else pts, s["s"])
        elif t == "circle":
            (x, y), r = self.px(s["c"]), s["r"] * K
            box = [x - r, y - r, x + r, y + r]
            f = s.get("fill")
            if f and f["k"] == "solid":
                self.draw.ellipse(box, fill=self.palette[f["ink"]])
            if s.get("s"):
                self.draw.ellipse(box, outline=self.palette[s["s"]["ink"]], width=self.width(s["s"]))
        elif t == "arc":
            (x, y), r = self.px(s["c"]), s["r"] * K
            # y up with angles counter-clockwise on paper; Pillow's run clockwise with y down
            self.draw.arc([x - r, y - r, x + r, y + r], -s["a1"], -s["a0"], fill=self.palette[s["s"]["ink"]], width=self.width(s["s"]))
        elif t == "text":
            self.text(s)
        elif t == "image":
            self.image(s)
        else:
            raise ValueError("unknown shape " + t)


def picture(block, drawing, fonts, tiles):
    w, h = block["w"], block["h"]
    img = Image.new("RGB", (max(1, int(round(w * K))), max(1, int(round(h * K)))), rgb(drawing["palette"]["paper"]))
    painter = Painter(img, h, drawing, fonts, tiles)
    for s in block["shapes"]:
        painter.shape(s)
    img = img.resize((max(1, int(round(w * DPI / 25.4))), max(1, int(round(h * DPI / 25.4)))), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True, dpi=(DPI, DPI))
    return base64.b64encode(out.getvalue()).decode("ascii")


def main():
    doc = json.load(sys.stdin)
    drawing = doc.get("drawing") or {}
    fonts, tiles = {}, {}
    out = [picture(b, drawing, fonts, tiles) for b in doc["blocks"] if b["t"] == "plan"]
    sys.stdout.write(json.dumps(out))


if __name__ == "__main__":
    main()
