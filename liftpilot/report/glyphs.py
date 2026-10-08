"""Glyph outlines of a TrueType font, for the halo of the lettering (tavole.py): the band of paper under a text is the
outline of its letters stroked wide in the paper's colour, a path and not a second text, so the PDF holds every word once
(search and copy find it once). Reads the font file itself (the tables cmap, head, loca, glyf), no other library; simple
and composite glyphs, quadratic contours given as cubic Béziers. Font units, y up.
"""
import struct


class Outlines:
    def __init__(self, path):
        with open(path, "rb") as f:
            self.data = f.read()
        d = self.data
        n = struct.unpack(">H", d[4:6])[0]
        self.tables = {}
        for i in range(n):
            tag, _, off, length = struct.unpack(">4sIII", d[12 + 16 * i:28 + 16 * i])
            self.tables[tag.decode("latin-1")] = (off, length)
        head = self.tables["head"][0]
        self.upm = struct.unpack(">H", d[head + 18:head + 20])[0]
        long_loca = struct.unpack(">h", d[head + 50:head + 52])[0] == 1
        glyphs = struct.unpack(">H", d[self.tables["maxp"][0] + 4:self.tables["maxp"][0] + 6])[0]
        loca = self.tables["loca"][0]
        if long_loca:
            self.loca = list(struct.unpack(">%dI" % (glyphs + 1), d[loca:loca + 4 * (glyphs + 1)]))
        else:
            self.loca = [2 * x for x in struct.unpack(">%dH" % (glyphs + 1), d[loca:loca + 2 * (glyphs + 1)])]
        self.glyf = self.tables["glyf"][0]
        self.cmap = self._cmap()
        self.cache = {}

    def _cmap(self):
        """Code point → glyph of the Unicode subtable (format 4, the basic plane)."""
        d, base = self.data, self.tables["cmap"][0]
        count = struct.unpack(">H", d[base + 2:base + 4])[0]
        sub = None
        for i in range(count):
            platform, encoding, off = struct.unpack(">HHI", d[base + 4 + 8 * i:base + 12 + 8 * i])
            if (platform, encoding) in ((3, 1), (0, 3), (0, 4), (0, 1)) and struct.unpack(">H", d[base + off:base + off + 2])[0] == 4:
                sub = base + off
                break
        out = {}
        if sub is None:
            return out
        segs = struct.unpack(">H", d[sub + 6:sub + 8])[0] // 2
        ends = struct.unpack(">%dH" % segs, d[sub + 14:sub + 14 + 2 * segs])
        p = sub + 16 + 2 * segs
        starts = struct.unpack(">%dH" % segs, d[p:p + 2 * segs])
        deltas = struct.unpack(">%dh" % segs, d[p + 2 * segs:p + 4 * segs])
        ro = p + 4 * segs
        offsets = struct.unpack(">%dH" % segs, d[ro:ro + 2 * segs])
        for s in range(segs):
            for c in range(starts[s], ends[s] + 1):
                if c == 0xFFFF:
                    continue
                if offsets[s] == 0:
                    g = (c + deltas[s]) & 0xFFFF
                else:
                    at = ro + 2 * s + offsets[s] + 2 * (c - starts[s])
                    g = struct.unpack(">H", d[at:at + 2])[0]
                    g = (g + deltas[s]) & 0xFFFF if g else 0
                out[c] = g
        return out

    def glyph(self, char):
        return self.cmap.get(ord(char), 0)

    def contours(self, gid, depth=0):
        """The closed contours of a glyph: each a list of segments ('M', p) / ('L', p) / ('Q', c, p) in font units."""
        if gid in self.cache:
            return self.cache[gid]
        d = self.data
        start, end = self.glyf + self.loca[gid], self.glyf + self.loca[gid + 1]
        out = []
        if end > start and depth < 8:
            n = struct.unpack(">h", d[start:start + 2])[0]
            out = self._simple(start, n) if n >= 0 else self._composite(start, depth)
        self.cache[gid] = out
        return out

    def _simple(self, at, n):
        d = self.data
        p = at + 10
        ends = struct.unpack(">%dH" % n, d[p:p + 2 * n])
        p += 2 * n
        total = (ends[-1] + 1) if n else 0
        p += 2 + struct.unpack(">H", d[p:p + 2])[0]
        flags = []
        while len(flags) < total:
            f = d[p]
            p += 1
            flags.append(f)
            if f & 8:
                flags.extend([f] * d[p])
                p += 1
        coords = []
        for short, same in ((2, 16), (4, 32)):
            v, vals = 0, []
            for f in flags:
                if f & short:
                    delta = d[p]
                    p += 1
                    v += delta if f & same else -delta
                elif not f & same:
                    v += struct.unpack(">h", d[p:p + 2])[0]
                    p += 2
                vals.append(v)
            coords.append(vals)
        pts = list(zip(coords[0], coords[1], [bool(f & 1) for f in flags]))
        out, first = [], 0
        for e in ends:
            out.append(_quads(pts[first:e + 1]))
            first = e + 1
        return out

    def _composite(self, at, depth):
        d = self.data
        p, out = at + 10, []
        while True:
            flags, gid = struct.unpack(">HH", d[p:p + 4])
            p += 4
            if flags & 1:
                a, b = struct.unpack(">hh", d[p:p + 4])
                p += 4
            else:
                a, b = struct.unpack(">bb", d[p:p + 2])
                p += 2
            dx, dy = (a, b) if flags & 2 else (0, 0)
            m = (1.0, 0.0, 0.0, 1.0)
            if flags & 8:
                s = struct.unpack(">h", d[p:p + 2])[0] / 16384
                p += 2
                m = (s, 0.0, 0.0, s)
            elif flags & 0x40:
                sx, sy = (v / 16384 for v in struct.unpack(">hh", d[p:p + 4]))
                p += 4
                m = (sx, 0.0, 0.0, sy)
            elif flags & 0x80:
                m = tuple(v / 16384 for v in struct.unpack(">hhhh", d[p:p + 8]))
                p += 8
            tr = lambda q: (m[0] * q[0] + m[2] * q[1] + dx, m[1] * q[0] + m[3] * q[1] + dy)
            for c in self.contours(gid, depth + 1):
                out.append([(seg[0],) + tuple(tr(q) for q in seg[1:]) for seg in c])
            if not flags & 0x20:
                break
        return out


def _quads(pts):
    """A TrueType contour (points on and off the curve) as segments from its first point on the curve."""
    if not pts:
        return []
    # implied points on the curve between two off-curve points
    full = []
    for i, (x, y, on) in enumerate(pts):
        px, py, pon = pts[i - 1]
        if not on and not pon:
            full.append(((x + px) / 2, (y + py) / 2, True))
        full.append((x, y, on))
    k = next((i for i, q in enumerate(full) if q[2]), None)
    if k is None:
        return []
    ring = full[k:] + full[:k]
    segs = [("M", ring[0][:2])]
    i = 1
    while i <= len(ring):
        q = ring[i % len(ring)]
        if q[2]:
            segs.append(("L", q[:2]))
            i += 1
        else:
            nxt = ring[(i + 1) % len(ring)]
            segs.append(("Q", q[:2], nxt[:2]))
            i += 2
    return segs
