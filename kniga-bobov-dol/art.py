# -*- coding: utf-8 -*-
"""Илюстрации, корица и снимки за книгата (векторно, без външни картинки).

Картата е по реални данни на OpenStreetMap (виж geo_data.py); всичко останало е
рисувано в код. Използват се градиенти и прозрачност на ReportLab.
"""

import math
import os

from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Flowable

from typo import (W, H, GOLD, GOLD_L, DARKRED, INK, INK2, PARCH, PARCH2, BROWN, NIGHT1,
                  NIGHT2, MOUNT, CREAM, draw_tracked)

HEX = colors.HexColor


# ── Помощни за рисуване ────────────────────────────────────────────────────
def lin_grad(c, x0, y0, x1, y1, stops):
    c.linearGradient(x0, y0, x1, y1, [HEX(s[1]) for s in stops], [s[0] for s in stops],
                     extend=True)


def clip_rect(c, x, y, w, h):
    p = c.beginPath()
    p.rect(x, y, w, h)
    c.clipPath(p, stroke=0, fill=0)


def smooth_path(c, pts, close=False, tension=0.5):
    """Гладка крива (Catmull–Rom → Безие) през точките; връща path."""
    p = c.beginPath()
    n = len(pts)
    p.moveTo(*pts[0])
    rng = range(n) if close else range(n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n] if (close or i > 0) else pts[0]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if (close or i + 2 < n) else pts[-1]
        c1 = (p1[0] + (p2[0] - p0[0]) * tension / 3.0 * 2, p1[1] + (p2[1] - p0[1]) * tension / 3.0 * 2)
        c2 = (p2[0] - (p3[0] - p1[0]) * tension / 3.0 * 2, p2[1] - (p3[1] - p1[1]) * tension / 3.0 * 2)
        p.curveTo(c1[0], c1[1], c2[0], c2[1], p2[0], p2[1])
    if close:
        p.close()
    return p


def diamond(c, x, y, d, fill=1):
    p = c.beginPath()
    p.moveTo(x, y - d)
    p.lineTo(x + d, y)
    p.lineTo(x, y + d)
    p.lineTo(x - d, y)
    p.close()
    c.drawPath(p, fill=fill, stroke=0)


def card(c, x, y, w, h, inset=4.5):
    """Пергаментна карта: нежен градиент, двоен кант, ъглови ромбове."""
    c.saveState()
    clip_rect(c, x, y, w, h)
    lin_grad(c, x, y + h, x, y, [(0, '#f4ecd6'), (0.55, '#eee3c6'), (1, '#e5d7b3')])
    c.restoreState()
    c.setStrokeColor(BROWN)
    c.setLineWidth(0.9)
    c.rect(x, y, w, h, fill=0, stroke=1)
    c.setLineWidth(0.35)
    c.setStrokeColor(GOLD)
    c.rect(x + inset, y + inset, w - 2 * inset, h - 2 * inset, fill=0, stroke=1)
    c.setFillColor(GOLD)
    for (px, py) in ((x + inset, y + inset), (x + w - inset, y + inset),
                     (x + inset, y + h - inset), (x + w - inset, y + h - inset)):
        diamond(c, px, py, 2.0)


class Illustration(Flowable):
    def __init__(self, name, width=300, height=200):
        super().__init__()
        self.name = name
        self.width, self.height = width, height

    def wrap(self, aw, ah):
        self._aw = aw
        return aw, self.height

    def draw(self):
        c = self.canv
        x0 = (self._aw - self.width) / 2.0
        c.saveState()
        c.translate(x0, 0)
        getattr(self, 'd_' + self.name)(c, self.width, self.height)
        c.restoreState()

    # ── етимология: бобова шушулка → бобовидна долина ──────────────────────
    def d_etymology(self, c, w, h):
        card(c, 0, 0, w, h)
        draw_tracked(c, w / 2, h - 21, 'ПРОИЗХОД НА ИМЕТО', 'Book-Medium', 9.4, 2.4, BROWN)
        c.setFont('Book-Italic', 8.6)
        c.setFillColor(INK2)
        c.drawCentredString(w / 2, h - 33, 'Бобов дол — долина с форма на бобово зърно')

        # шушулка (вляво)
        cx, cy = w * 0.25, h * 0.46
        pod = [(cx - 62, cy - 8), (cx - 34, cy + 14), (cx + 8, cy + 18), (cx + 46, cy + 9),
               (cx + 66, cy - 6), (cx + 44, cy - 15), (cx + 4, cy - 17), (cx - 36, cy - 12)]
        c.saveState()
        c.setFillColor(HEX('#4a6b3a'))
        c.setStrokeColor(HEX('#2c421f'))
        c.setLineWidth(0.9)
        c.drawPath(smooth_path(c, pod, close=True), fill=1, stroke=1)
        c.setFillColor(HEX('#6e8f55'))
        c.setStrokeColor(HEX('#3b5a2b'))
        inner = [(cx - 50, cy - 7), (cx - 28, cy + 8), (cx + 6, cy + 11), (cx + 40, cy + 5),
                 (cx + 54, cy - 5), (cx + 38, cy - 9), (cx + 4, cy - 10), (cx - 30, cy - 8)]
        c.drawPath(smooth_path(c, inner, close=True), fill=1, stroke=0)
        for i, bx in enumerate((cx - 32, cx - 10, cx + 12, cx + 34)):
            by = cy + 1.5 - 0.1 * (bx - cx) * 0.2
            c.setFillColor(HEX('#2f4a22'))
            c.ellipse(bx - 8.2, by - 6.6, bx + 8.2, by + 6.6, fill=1, stroke=0)
            c.setFillColor(HEX('#d8c98e'))
            c.setStrokeColor(HEX('#8c7a3e'))
            c.setLineWidth(0.5)
            c.ellipse(bx - 7, by - 5.6, bx + 7, by + 5.6, fill=1, stroke=1)
            c.setFillColor(HEX('#f1e6b4'))
            c.ellipse(bx - 4.6, by + 0.6, bx + 1.2, by + 4.2, fill=1, stroke=0)
            c.setFillColor(HEX('#7a6a30'))
            c.ellipse(bx + 3.2, by - 1.0, bx + 5.4, by + 0.9, fill=1, stroke=0)
        # стръкче
        c.setStrokeColor(HEX('#2c421f'))
        c.setLineWidth(1.2)
        c.line(cx + 66, cy - 6, cx + 76, cy - 12)
        c.restoreState()

        # знак „=“
        c.setFillColor(GOLD)
        c.setFont('Book-Medium', 22)
        c.drawCentredString(w * 0.5, h * 0.46 - 6, '≈')

        # долина: контури на релефа с форма на боб (вдясно)
        vx, vy = w * 0.75, h * 0.46

        def bean(scale, sx=1.0, sy=1.0):
            pts = []
            for k in range(0, 72):
                t = 2 * math.pi * k / 72.0
                notch = 1 - 0.20 * math.exp(-((t - math.pi / 2) / 0.55) ** 2)
                pts.append((vx + math.cos(t) * 56 * scale * sx, vy + math.sin(t) * 25 * scale * sy * notch))
            return pts
        shades = ['#aebf8f', '#b9c99b', '#c6d3a8', '#d2dcb5', '#dde4c4']
        for i, sc in enumerate((1.0, 0.82, 0.64, 0.46, 0.30)):
            c.setFillColor(HEX(shades[i]))
            c.setStrokeColor(HEX('#6f8556'))
            c.setLineWidth(0.5 if i else 0.9)
            p = c.beginPath()
            pts = bean(sc)
            p.moveTo(*pts[0])
            for q in pts[1:]:
                p.lineTo(*q)
            p.close()
            c.drawPath(p, fill=1, stroke=1)
        # къщи на града в долината
        c.setFillColor(DARKRED)
        for dx, dy in ((-9, 2), (-3, -3), (4, 3), (10, -1), (0, 7), (-13, -2)):
            c.rect(vx + dx, vy + dy, 3.2, 3.2, fill=1, stroke=0)
        # подписи
        c.setFillColor(BROWN)
        c.setFont('Book-Italic', 8.8)
        c.drawCentredString(cx + 2, cy - 36, 'Бобова шушулка със зърна')
        c.drawCentredString(vx, cy - 36, 'Долината на Бобов дол')
        c.setFont('Book', 7.4)
        c.setFillColor(INK2)
        c.drawCentredString(w / 2, 14, '„Името на града идва от долината с форма на бобово зърно.“ — Българска енциклопедия')

    # ── дефтерът от 1576 г. ───────────────────────────────────────────────
    def d_defter(self, c, w, h):
        card(c, 0, 0, w, h)
        # шарка по горния и долния кант
        c.setFillColor(GOLD_L)
        for xx in range(16, int(w) - 12, 9):
            diamond(c, xx, h - 11, 1.5)
            diamond(c, xx, 11, 1.5)
        c.setFont('Book-Italic', 8.2)
        c.setFillColor(INK2)
        c.drawCentredString(w / 2, h - 27, 'Стилизирана художествена възстановка — османски данъчен дефтер')
        c.setFillColor(BROWN)
        c.setFont('Book-Medium', 11.2)
        c.drawCentredString(w / 2, h - 43, 'Кюстендилски санджак · 984 г. по Хиджра (≈ 1576)')
        c.setStrokeColor(GOLD)
        c.setLineWidth(0.6)
        c.line(w * 0.2, h - 50, w * 0.8, h - 50)
        # таблица
        rows = [('Санджак', 'Кюстендил'), ('Еялет', 'Румелия'), ('Име на село', 'БОБОДОЛ'),
                ('Ханета (домакинства)', 'няколко десетки'), ('Земя', 'зърно, тютюн и ливади'),
                ('Годишен данък (харач)', '≈ 1 300 акчета')]
        x0, x1 = 24, w - 24
        lw = 116
        rh = 16.5
        ty = h - 58
        for i, (k, v) in enumerate(rows):
            top = ty - i * rh
            c.setFillColor(HEX('#e8dcba') if i % 2 == 0 else HEX('#f1e8cf'))
            c.rect(x0, top - rh, x1 - x0, rh, fill=1, stroke=0)
            c.setFillColor(BROWN)
            c.setFont('Book-BoldItalic', 8.6)
            c.drawString(x0 + 6, top - rh + 5.2, k)
            c.setFont('Book-Bold' if v == 'БОБОДОЛ' else 'Book', 9.4)
            c.drawString(x0 + lw + 6, top - rh + 5.2, v)
        c.setStrokeColor(HEX('#a89868'))
        c.setLineWidth(0.4)
        c.rect(x0, ty - len(rows) * rh, x1 - x0, len(rows) * rh, fill=0, stroke=1)
        c.line(x0 + lw, ty, x0 + lw, ty - len(rows) * rh)
        for i in range(1, len(rows)):
            c.line(x0, ty - i * rh, x1, ty - i * rh)
        # червен печат
        sx, sy = w - 52, 40
        c.setFillColor(HEX('#8c2f24'))
        c.setStrokeColor(HEX('#8c2f24'))
        c.circle(sx, sy, 17, fill=0, stroke=1)
        c.setLineWidth(0.4)
        c.circle(sx, sy, 14, fill=0, stroke=1)
        for k in range(8):
            a = math.pi * k / 4
            c.line(sx + math.cos(a) * 5, sy + math.sin(a) * 5, sx + math.cos(a) * 12.5, sy + math.sin(a) * 12.5)
        c.circle(sx, sy, 3.4, fill=1, stroke=0)
        c.setFont('Book-Italic', 7.6)
        c.setFillColor(INK2)
        c.drawString(24, 26, 'Оригиналните дефтери се съхраняват')
        c.drawString(24, 17, 'в Османския архив в Истанбул.')

    # ── подземен разрез ────────────────────────────────────────────────────
    def d_mine_section(self, c, w, h):
        c.saveState()
        clip_rect(c, 0, 0, w, h)
        horizon = h * 0.76
        c.saveState()
        clip_rect(c, 0, horizon, w, h - horizon)
        lin_grad(c, 0, h, 0, horizon, [(0, '#8aa4b8'), (1, '#e6dcc0')])
        c.restoreState()
        # далечен хълм
        c.setFillColor(HEX('#9aa88a'))
        c.drawPath(smooth_path(c, [(-10, horizon - 2), (w * 0.2, horizon + 16), (w * 0.45, horizon + 7),
                                   (w * 0.75, horizon + 22), (w + 10, horizon + 6),
                                   (w + 10, horizon - 2), (-10, horizon - 2)]), fill=1, stroke=0)
        # пластове
        layers = [(0.76, 0.66, '#8a6f4b', 'почвен слой'), (0.66, 0.52, '#a58a5b', 'пясъчник'),
                  (0.52, 0.38, '#7d6a50', 'глинест шист'), (0.38, 0.0, '#4f4332', 'скална основа')]
        for top, bot, col, lbl in layers:
            c.saveState()
            clip_rect(c, 0, h * bot, w, h * (top - bot))
            base = HEX(col)
            lighter = colors.Color(min(1, base.red * 1.12), min(1, base.green * 1.12), min(1, base.blue * 1.12))
            c.linearGradient(0, h * top, 0, h * bot, [lighter, base], [0, 1], extend=True)
            c.restoreState()
        # текстура: точки и щрихи
        import random
        rnd = random.Random(11)
        c.setFillColor(HEX('#ffffff'))
        c.setFillAlpha(0.10)
        for _ in range(260):
            c.circle(rnd.uniform(0, w), rnd.uniform(0, h * 0.74), rnd.uniform(0.3, 0.9), fill=1, stroke=0)
        c.setFillAlpha(0.07)
        c.setFillColor(HEX('#000000'))
        for _ in range(110):
            c.circle(rnd.uniform(0, w), rnd.uniform(0, h * 0.74), rnd.uniform(0.3, 0.8), fill=1, stroke=0)
        c.setFillAlpha(1)
        # въглищни пластове
        seams = [(0.30, 6.5, 'пласт „Гребикал“'), (0.17, 6.5, 'Чеганска синклинала')]
        for fy, th, lbl in seams:
            y = h * fy
            c.setFillColor(HEX('#15110d'))
            c.drawPath(smooth_path(c, [(-4, y + 3), (w * 0.3, y - 2), (w * 0.62, y + 4), (w + 4, y)]), fill=0, stroke=0)
            c.rect(0, y - th / 2, w, th, fill=1, stroke=0)
            c.setFillColor(HEX('#3a3226'))
            c.rect(0, y + th / 2 - 1.4, w, 1.2, fill=1, stroke=0)
            c.setFillColor(HEX('#f1e2b8'))
            c.setFont('Book-Italic', 8)
            c.drawString(w * 0.62, y + th / 2 + 3.2, lbl)
        # етикети на пластовете
        c.setFillColor(HEX('#f3ead0'))
        c.setFont('Book-Italic', 8)
        c.drawString(w * 0.62, h * 0.69, 'почвен слой')
        c.drawString(w * 0.62, h * 0.575, 'пясъчник')
        c.drawString(w * 0.62, h * 0.435, 'глинест шист')
        c.restoreState()
        # шахта + надшахтна кула
        sx = w * 0.30
        c.setStrokeColor(HEX('#1a1410'))
        c.setLineWidth(2.4)
        c.line(sx, h * 0.12, sx, h * 0.80)
        # врати на галерии, греди
        c.setStrokeColor(HEX('#3d2e1c'))
        c.setLineWidth(1.3)
        for fy in (0.30, 0.17):
            y = h * fy
            for xx in (w * 0.12, w * 0.50, w * 0.80):
                c.line(xx - 5, y - 4, xx - 5, y + 4)
                c.line(xx + 5, y - 4, xx + 5, y + 4)
                c.line(xx - 6, y + 4, xx + 6, y + 4)
            # вагонетка
            c.setFillColor(HEX('#6b5a3c'))
            c.setStrokeColor(HEX('#1a1410'))
            c.setLineWidth(0.6)
            c.rect(sx + 22, y + 3.6, 15, 6, fill=1, stroke=1)
            c.setFillColor(HEX('#1a1410'))
            c.circle(sx + 25, y + 3.4, 1.7, fill=1, stroke=0)
            c.circle(sx + 34, y + 3.4, 1.7, fill=1, stroke=0)
        # копер
        c.setStrokeColor(HEX('#2b2218'))
        c.setLineWidth(1.5)
        base = h * 0.76
        tip = h * 0.965
        c.line(sx - 15, base, sx, tip)
        c.line(sx + 15, base, sx, tip)
        c.setLineWidth(0.7)
        for t in (0.25, 0.5, 0.75):
            yy = base + (tip - base) * t
            hw = 15 * (1 - t)
            c.line(sx - hw, yy, sx + hw, yy)
        c.line(sx - 15, base, sx + 7.5, base + (tip - base) * 0.5)
        c.line(sx + 15, base, sx - 7.5, base + (tip - base) * 0.5)
        c.setLineWidth(1.4)
        c.setFillColor(HEX('#d9c27a'))
        c.circle(sx, tip + 1, 4.6, fill=1, stroke=1)
        c.setLineWidth(0.5)
        for k in range(6):
            a = math.pi * k / 3
            c.line(sx, tip + 1, sx + math.cos(a) * 4.6, tip + 1 + math.sin(a) * 4.6)
        c.setFillColor(HEX('#4a3a28'))
        c.rect(sx - 24, base - 8, 14, 8, fill=1, stroke=0)
        c.rect(sx + 14, base - 6, 10, 6, fill=1, stroke=0)
        # заглавие
        c.setFillColor(HEX('#1f2a38'))
        c.setFont('Book-Medium', 9.6)
        c.drawString(12, h - 17, 'Подземен разрез')
        c.setFont('Book-Italic', 8.2)
        c.drawString(12, h - 28, 'на миньорски забой')
        c.setStrokeColor(BROWN)
        c.setLineWidth(0.9)
        c.rect(0, 0, w, h, fill=0, stroke=1)
        c.setStrokeColor(GOLD)
        c.setLineWidth(0.35)
        c.rect(3.5, 3.5, w - 7, h - 7, fill=0, stroke=1)

    # — герб (официалният герб на Бобов дол) —
    def d_gerb(self, c, w, h):
        GOLD_H = colors.HexColor('#e9b820')
        RED_H = colors.HexColor('#c01818')
        BLUE_H = colors.HexColor('#1c2f80')
        LINE_H = colors.HexColor('#3a2c10')
        cx = w / 2
        top = h * 0.66          # горен ръб на щита
        hw = w * 0.215          # полуширина на щита
        straight = h * 0.27     # прав участък на стените
        r = hw                  # радиус на полукръглото дъно
        ccy = top - straight    # център на дъгата

        def shield(inset):
            p = c.beginPath()
            p.moveTo(cx - hw + inset, top - inset)
            p.lineTo(cx + hw - inset, top - inset)
            p.lineTo(cx + hw - inset, ccy)
            p.arcTo(cx - hw + inset, ccy - (r - inset) * 2 + (r - inset),
                    cx + hw - inset, ccy + (r - inset),
                    startAng=0, extent=-180)
            p.lineTo(cx - hw + inset, top - inset)
            p.close()
            return p

        # крепостна корона („Царичина“) над щита
        c.setFillColor(GOLD_H)
        c.setStrokeColor(LINE_H)
        c.setLineWidth(1.1)
        cb = top + 2            # основа на короната
        p = c.beginPath()
        p.moveTo(cx - hw * 0.92, cb)
        p.lineTo(cx + hw * 0.92, cb)
        p.lineTo(cx + hw * 1.08, cb + h * 0.055)
        p.lineTo(cx - hw * 1.08, cb + h * 0.055)
        p.close()
        c.drawPath(p, fill=1, stroke=1)
        mtop = cb + h * 0.055
        for mx, mw_, mh_ in ((cx - hw * 0.98, hw * 0.52, h * 0.050),
                             (cx - hw * 0.30, hw * 0.60, h * 0.068),
                             (cx + hw * 0.46, hw * 0.52, h * 0.050)):
            c.rect(mx, mtop - 1, mw_, mh_ + 1, fill=1, stroke=1)
        # прозорчета в короната
        c.setFillColor(LINE_H)
        for wx in (cx - hw * 0.42, cx + hw * 0.30):
            c.rect(wx, mtop + 1.5, hw * 0.12, h * 0.016, fill=1, stroke=0)

        # щит: златен кант + синьо поле
        c.setFillColor(GOLD_H)
        c.setLineWidth(1.4)
        c.drawPath(shield(0), fill=1, stroke=1)
        c.setFillColor(BLUE_H)
        c.drawPath(shield(hw * 0.075), fill=1, stroke=0)
        ins = hw * 0.075

        # червено поле в средата
        red_top = top - h * 0.075
        red_bot = top - h * 0.26
        c.setFillColor(RED_H)
        c.rect(cx - hw + ins, red_bot, (hw - ins) * 2, red_top - red_bot,
               fill=1, stroke=0)

        # надпис БОБОВ ДОЛ върху синята лента
        c.setFillColor(GOLD_H)
        c.setFont('Book-Bold', hw * 0.245)
        c.drawCentredString(cx, top - h * 0.055, 'БОБОВ ДОЛ')

        # три светкавици върху червеното поле
        bw = hw * 0.13
        for bx in (cx - hw * 0.52, cx, cx + hw * 0.52):
            ty = red_top - h * 0.022
            by = red_bot + h * 0.030
            midy = (ty + by) / 2
            p = c.beginPath()
            p.moveTo(bx - bw * 0.2, ty)
            p.lineTo(bx + bw, ty)
            p.lineTo(bx + bw * 0.25, midy + h * 0.008)
            p.lineTo(bx + bw * 0.95, midy + h * 0.008)
            p.lineTo(bx - bw * 0.1, by)
            p.lineTo(bx + bw * 0.18, midy - h * 0.004)
            p.lineTo(bx - bw * 0.55, midy - h * 0.004)
            p.close()
            c.drawPath(p, fill=1, stroke=0)
            # връх-стрелка
            p = c.beginPath()
            p.moveTo(bx - bw * 0.75, by + h * 0.012)
            p.lineTo(bx + bw * 0.30, by + h * 0.012)
            p.lineTo(bx - bw * 0.45, by - h * 0.030)
            p.close()
            c.drawPath(p, fill=1, stroke=0)

        # зъбно колело (долу вляво)
        gx, gy = cx - hw * 0.44, ccy - r * 0.42
        grad = hw * 0.36
        import math
        for ang in range(60, 300, 30):
            a = math.radians(ang)
            tx = gx + math.cos(a) * grad
            ty = gy + math.sin(a) * grad
            c.saveState()
            c.translate(tx, ty)
            c.rotate(ang)
            c.setFillColor(GOLD_H)
            c.rect(-grad * 0.09, -grad * 0.13, grad * 0.26, grad * 0.26,
                   fill=1, stroke=0)
            c.restoreState()
        c.setFillColor(GOLD_H)
        c.circle(gx, gy, grad, fill=1, stroke=0)
        c.setFillColor(BLUE_H)
        c.circle(gx, gy, grad * 0.62, fill=1, stroke=0)

        # кръстосани чукове (в средата на долното поле)
        hx, hy = cx + hw * 0.10, ccy - r * 0.28
        for ang in (-42, 42):
            c.saveState()
            c.translate(hx, hy)
            c.rotate(ang)
            c.setFillColor(GOLD_H)
            c.setStrokeColor(BLUE_H)
            c.setLineWidth(0.8)
            c.rect(-hw * 0.045, -hw * 0.52, hw * 0.09, hw * 0.74,
                   fill=1, stroke=1)                      # дръжка
            c.rect(-hw * 0.16, hw * 0.22, hw * 0.32, hw * 0.24,
                   fill=1, stroke=1)                      # глава
            c.restoreState()

        # житен клас (долу вдясно, изцяло в синьото поле)
        sx0, sy0 = cx + hw * 0.46, red_bot - r * 0.10
        sx1, sy1 = cx + hw * 0.58, ccy - r * 0.62
        c.setStrokeColor(GOLD_H)
        c.setLineWidth(1.4)
        p = c.beginPath()
        p.moveTo(sx0, sy0)
        p.curveTo(sx0 + hw * 0.08, sy0 - r * 0.18,
                  sx1 + hw * 0.03, sy1 + r * 0.18, sx1, sy1)
        c.drawPath(p, fill=0, stroke=1)
        c.setFillColor(GOLD_H)
        for i in range(5):
            t = i / 4.0
            zx = sx0 + (sx1 - sx0) * t + hw * 0.04 * math.sin(t * 3)
            zy = sy0 + (sy1 - sy0) * t
            for side in (-1, 1):
                c.saveState()
                c.translate(zx, zy)
                c.rotate(side * 38)
                c.ellipse(-hw * 0.028, -hw * 0.085, hw * 0.028, hw * 0.085,
                          fill=1, stroke=0)
                c.restoreState()

    # ── карта на общината (реални данни на OpenStreetMap) ─────────────────
    def d_map(self, c, w, h):
        from geo_data import BOUNDARY, SETTLEMENTS, KOLOSH, NEIGHBOURS
        card(c, 0, 0, w, h)
        draw_tracked(c, w / 2, h - 23, 'КАРТА НА ОБЩИНА БОБОВ ДОЛ', 'Book-Medium', 10.2, 2.4, BROWN)
        c.setFont('Book-Italic', 8.6)
        c.setFillColor(INK2)
        c.drawCentredString(w / 2, h - 35, '18 населени места в полите на Конявската планина')

        lons = [p[0] for p in BOUNDARY]
        lats = [p[1] for p in BOUNDARY]
        lon_min, lon_max, lat_min, lat_max = min(lons), max(lons), min(lats), max(lats)
        kx = math.cos(math.radians((lat_min + lat_max) / 2))
        ax, ay, aw, ah = 40, 34, w - 80, h - 34 - 54
        S = min(aw / ((lon_max - lon_min) * kx), ah / (lat_max - lat_min))
        mw, mh = (lon_max - lon_min) * kx * S, (lat_max - lat_min) * S
        ox, oy = ax + (aw - mw) / 2, ay + (ah - mh) / 2

        def P(lat, lon):
            return ox + (lon - lon_min) * kx * S, oy + (lat - lat_min) * S

        # мрежа (градуси/минути)
        c.setStrokeColor(HEX('#cdbf99'))
        c.setLineWidth(0.3)
        c.setDash(1, 2)
        c.setFont('Book', 6.4)
        c.setFillColor(HEX('#8a7a52'))
        for lon in (22.90, 22.95, 23.00, 23.05):
            x, _ = P(lat_min, lon)
            c.line(x, ay - 4, x, ay + ah + 4)
            c.drawCentredString(x, ay - 11, "%d°%02d′" % (int(lon), round((lon - int(lon)) * 60)))
        for lat in (42.25, 42.30, 42.35, 42.40):
            _, y = P(lat, lon_min)
            c.line(ax - 4, y, ax + aw + 4, y)
            c.drawRightString(ax - 7, y - 2, "%d°%02d′" % (int(lat), round((lat - int(lat)) * 60)))
        c.setDash()
        # граница на общината
        pts = [P(la, lo) for lo, la in BOUNDARY]
        c.saveState()
        p = c.beginPath()
        p.moveTo(*pts[0])
        for q in pts[1:]:
            p.lineTo(*q)
        p.close()
        c.setFillColor(HEX('#e3e6c3'))
        c.setStrokeColor(HEX('#efe6cf'))
        c.setLineWidth(6)
        c.drawPath(p, fill=0, stroke=1)
        c.setLineWidth(0.1)
        c.drawPath(p, fill=1, stroke=0)
        clip = c.beginPath()
        clip.moveTo(*pts[0])
        for q in pts[1:]:
            clip.lineTo(*q)
        clip.close()
        c.clipPath(clip, stroke=0, fill=0)
        # лек „релеф“: градиент в долината и по-тъмни краища
        lin_grad(c, ox, oy + mh, ox, oy, [(0, '#c9d2a4'), (0.5, '#e6e8c8'), (1, '#d3d9ae')])
        c.restoreState()
        c.setStrokeColor(HEX('#6d5c36'))
        c.setLineWidth(1.0)
        c.setDash(4, 2)
        c.drawPath(p, fill=0, stroke=1)
        c.setDash()

        # връх Колош
        kx_, ky_ = P(*KOLOSH)
        c.setFillColor(HEX('#7a6a46'))
        c.setStrokeColor(HEX('#4a3a22'))
        c.setLineWidth(0.5)
        t = c.beginPath()
        t.moveTo(kx_ - 4.5, ky_ - 3)
        t.lineTo(kx_, ky_ + 4.5)
        t.lineTo(kx_ + 4.5, ky_ - 3)
        t.close()
        c.drawPath(t, fill=1, stroke=1)
        c.setFillColor(BROWN)
        c.setFont('Book-Italic', 7.4)
        c.drawString(kx_ + 7, ky_ - 1, 'в. Колош · 1314 м')

        # селища
        placed = []

        def box(x, y, text, size, anchor):
            tw = c.stringWidth(text, 'Book', size)
            if anchor == 'l':
                return (x, y - 1.5, x + tw, y + size * 0.8)
            if anchor == 'r':
                return (x - tw, y - 1.5, x, y + size * 0.8)
            return (x - tw / 2, y - 1.5, x + tw / 2, y + size * 0.8)

        def overlaps(a, b):
            m = 1.6   # малък отстъп между етикетите
            return not (a[2] + m < b[0] or b[2] + m < a[0] or a[3] + m < b[1] or b[3] + m < a[1])

        dots = {n: P(*ll) for n, ll in SETTLEMENTS.items()}
        for x, y in dots.values():
            placed.append((x - 3, y - 3, x + 3, y + 3))
        placed.append((kx_ - 5, ky_ - 4, kx_ + 70, ky_ + 6))
        order = ['Бобов дол'] + sorted([n for n in SETTLEMENTS if n != 'Бобов дол'])
        for n in order:
            x, y = dots[n]
            town = n == 'Бобов дол'
            size = 9.2 if town else 7.6
            font = 'Book-Bold' if town else 'Book'
            text = n.upper() if town else n
            c.setFont(font, size)
            cands = [('l', 5, -2.4), ('r', -5, -2.4), ('l', 4, 4.5), ('l', 4, -9), ('r', -4, 4.5),
                     ('r', -4, -9), ('m', 0, 6), ('m', 0, -10), ('l', 9, 8), ('r', -9, -12)]
            for anchor, dx, dy in cands:
                b = box(x + dx, y + dy, text, size, anchor)
                if (b[0] < ox - 12 or b[2] > ox + mw + 12 or b[1] < oy - 6 or b[3] > oy + mh + 6):
                    continue
                if any(overlaps(b, q) for q in placed):
                    continue
                placed.append(b)
                c.setFillColor(HEX('#2a1d0d') if not town else DARKRED)
                if anchor == 'l':
                    c.drawString(x + dx, y + dy, text)
                elif anchor == 'r':
                    c.drawRightString(x + dx, y + dy, text)
                else:
                    c.drawCentredString(x + dx, y + dy, text)
                break
            if town:
                c.setFillColor(colors.white)
                c.rect(x - 4.4, y - 4.4, 8.8, 8.8, fill=1, stroke=0)
                c.setFillColor(DARKRED)
                c.rect(x - 3.4, y - 3.4, 6.8, 6.8, fill=1, stroke=0)
            else:
                c.setFillColor(colors.white)
                c.circle(x, y, 3.0, fill=1, stroke=0)
                c.setFillColor(HEX('#3b2a14'))
                c.circle(x, y, 2.0, fill=1, stroke=0)

        # съседни градове — стрелки по посоката (от Бобов дол)
        tx, ty = dots['Бобов дол']
        lat_t, lon_t = SETTLEMENTS['Бобов дол']
        names = {'Дупница': ('Дупница · 20 км', 'below'), 'Перник': ('Перник · 38 км', 'right'),
                 'Кюстендил': ('Кюстендил', 'below'), 'Радомир': ('Радомир', 'left')}
        c.setStrokeColor(GOLD)
        c.setFillColor(GOLD)
        c.setLineWidth(0.9)
        top_lim = oy + mh + 14
        for name, (la, lo) in NEIGHBOURS.items():
            ang = math.atan2(la - lat_t, (lo - lon_t) * kx)
            ex, ey = math.cos(ang), math.sin(ang)
            tmax = 1e9
            for lim, comp, o in ((ax - 4, ex, tx), (ax + aw + 4, ex, tx),
                                 (ay - 4, ey, ty), (top_lim, ey, ty)):
                if abs(comp) > 1e-6:
                    tt = (lim - o) / comp
                    if tt > 0:
                        tmax = min(tmax, tt)
            bx, by = tx + ex * tmax, ty + ey * tmax
            sx_, sy_ = bx - ex * 16, by - ey * 16
            c.line(sx_, sy_, bx, by)
            hd = 3.4
            hp = c.beginPath()
            hp.moveTo(bx, by)
            hp.lineTo(bx - ex * hd * 1.7 + ey * hd, by - ey * hd * 1.7 - ex * hd)
            hp.lineTo(bx - ex * hd * 1.7 - ey * hd, by - ey * hd * 1.7 + ex * hd)
            hp.close()
            c.drawPath(hp, fill=1, stroke=0)
            lbl, side = names[name]
            c.setFillColor(BROWN)
            c.setFont('Book-Italic', 8)
            tw = c.stringWidth(lbl, 'Book-Italic', 8)
            if side == 'right':
                c.drawString(bx + 5, by - 6, lbl)
            elif side == 'left':
                c.drawRightString(bx - 5, by - 6, lbl)
            elif name == 'Дупница':
                c.drawString(min(bx - tw / 2, w - tw - 10), by - 11, lbl)
            else:
                c.drawString(max(8, bx - tw / 2 - 6), by - 11, lbl)
            c.setFillColor(GOLD)

        # мащаб и север
        km = S / 111.2
        bx0, by0 = ax + 2, 38
        c.setStrokeColor(BROWN)
        c.setLineWidth(1.0)
        c.line(bx0, by0, bx0 + 5 * km, by0)
        c.line(bx0, by0 - 2.5, bx0, by0 + 2.5)
        c.line(bx0 + 5 * km, by0 - 2.5, bx0 + 5 * km, by0 + 2.5)
        c.setFillColor(BROWN)
        c.setFont('Book', 7)
        c.drawString(bx0, by0 + 4, '0')
        c.drawString(bx0 + 5 * km - 4, by0 + 4, '5 км')
        nx, ny = w - 28, 24
        c.setStrokeColor(BROWN)
        c.setFillColor(BROWN)
        c.setLineWidth(0.9)
        c.line(nx, ny - 8, nx, ny + 9)
        hp = c.beginPath()
        hp.moveTo(nx, ny + 12)
        hp.lineTo(nx - 3.2, ny + 5)
        hp.lineTo(nx + 3.2, ny + 5)
        hp.close()
        c.drawPath(hp, fill=1, stroke=0)
        c.setFont('Book-Bold', 8)
        c.drawCentredString(nx, ny + 15, 'С')
        # легенда и авторство
        c.setFont('Book', 6.6)
        c.setFillColor(INK2)
        c.drawCentredString(w / 2 + 6, 11.5, 'Граница и селища: © участници в OpenStreetMap (ODbL)')

    # ── времева линия ────────────────────────────────────────────────────
    def d_timeline(self, c, w, h):
        card(c, 0, 0, w, h)
        draw_tracked(c, w / 2, h - 24, 'ВРЕМЕВА ЛИНИЯ НА БОБОВ ДОЛ', 'Book-Medium', 10.2, 2.4, BROWN)
        c.setFont('Book-Italic', 8.6)
        c.setFillColor(INK2)
        c.drawCentredString(w / 2, h - 36, 'основни събития от праисторията до днес')
        events = [
            ('II хил. пр. Хр.', 'Траките', 'скални ниши в Дуралинко'),
            ('987 г.', 'Разметаница', 'Самуил погубва брат си Арон'),
            ('XII в.', 'Византия', 'укреплението на връх Колош'),
            ('1576 г.', 'Първото име', '„Бободол“ в османски дефтер'),
            ('1822 г.', 'Свети Никола', 'възрожденската църква'),
            ('1836 г.', 'Ами Буе', 'открива въглищния басейн'),
            ('1881 г.', 'Училище', 'първото училище в селото'),
            ('1891 г.', 'Първата мина', '1 530 тона през първата година'),
            ('1917 г.', 'Теснолинейката', 'жп линия Дупница — Бобов дол'),
            ('1967 г.', 'Град', 'Указ № 788; празник — 27 октомври'),
            ('1969–1975', 'ТЕЦ „Бобов дол“', '630 MW; 200-метров комин'),
            ('1980-те', 'Златни години', '7 300 миньори; 2 млн. т годишно'),
            ('1989 г.', 'Преходът', 'разграбване и масова миграция'),
            ('2018 г.', 'Край под земята', 'спира последният подземен рудник'),
            ('2024 г.', 'Днес', '4 023 жители; 18 населени места'),
        ]
        top = h - 56
        bot = 22
        pitch = (top - bot) / float(len(events))
        sx = 98
        c.setStrokeColor(GOLD)
        c.setLineWidth(1.1)
        c.line(sx, top + 6, sx, bot - 2)
        for i, (d, t, n) in enumerate(events):
            y = top - i * pitch - pitch / 2 + 2
            c.setFillColor(HEX('#f4ecd6'))
            c.setStrokeColor(DARKRED)
            c.setLineWidth(1.2)
            c.circle(sx, y, 3.6, fill=1, stroke=1)
            c.setFillColor(DARKRED)
            c.circle(sx, y, 1.3, fill=1, stroke=0)
            c.setFont('Book-Medium', 9.6)
            c.drawRightString(sx - 10, y - 3, d)
            c.setFillColor(INK)
            c.setFont('Book-Bold', 9.6)
            c.drawString(sx + 10, y + 1.6, t)
            c.setFillColor(INK2)
            c.setFont('Book-Italic', 8.6)
            c.drawString(sx + 10, y - 8.2, n)
            if i < len(events) - 1:
                c.setStrokeColor(HEX('#d8caa4'))
                c.setLineWidth(0.3)
                c.line(sx + 10, y - pitch / 2 - 1.2, w - 18, y - pitch / 2 - 1.2)


# ── Снимки ─────────────────────────────────────────────────────────────────
PHOTO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'photos')

# Кредити под снимките (CC BY / CC BY-SA изискват посочване на автора и лиценза).
# Всички файлове са от Уикимедия Общомедия.
PHOTO_CREDITS = {
    'razmetanitsa.jpg': 'Снимка: Ivano Giambattista · CC0 · Уикимедия Общомедия',
    'paraklis.jpg': 'Снимка: Kiak · CC BY-SA 3.0 · Уикимедия Общомедия',
    'tec.jpg': 'Снимка: Boby Dimitrov · CC BY-SA 2.0 · Уикимедия Общомедия',
    'grad-panorama.jpg': 'Снимка: Clj · обществено достояние · Уикимедия Общомедия',
    'vagoni.jpg': 'Снимка: DemieK07 · CC BY-SA 4.0 · Уикимедия Общомедия',
    'minyor-match.jpg': 'Снимка: Biso · CC BY 3.0 · Уикимедия Общомедия',
}

# изрязване (л, г, д, дъно) като дялове от размера, и мека корекция
PHOTO_SPEC = {
    'razmetanitsa.jpg': {'crop': (0.0, 0.10, 1.0, 0.92)},
    'grad-panorama.jpg': {'crop': (0.0, 0.22, 1.0, 0.98)},
    'vagoni.jpg': {'crop': (0.0, 0.18, 1.0, 0.86), 'contrast': 1.12},
    'paraklis.jpg': {},
    'tec.jpg': {},
    'minyor-match.jpg': {'crop': (0.0, 0.10, 1.0, 1.0)},
}


class Photo(Flowable):
    """Снимка с бяло паспарту, златен кант и лека сянка."""

    MAT = 3.5

    def __init__(self, filename, width=300):
        super().__init__()
        from PIL import Image, ImageEnhance, ImageFilter, ImageOps
        spec = PHOTO_SPEC.get(filename, {})
        im = Image.open(os.path.join(PHOTO_DIR, filename)).convert('RGB')
        if spec.get('crop'):
            l, t, r, b = spec['crop']
            iw, ih = im.size
            im = im.crop((int(l * iw), int(t * ih), int(r * iw), int(b * ih)))
        im = ImageOps.autocontrast(im, cutoff=0.4)
        if spec.get('contrast'):
            im = ImageEnhance.Contrast(im).enhance(spec['contrast'])
        im = im.filter(ImageFilter.UnsharpMask(radius=1.1, percent=55, threshold=3))
        import io
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=88, optimize=True, subsampling=0)   # JPEG → малък PDF
        buf.seek(0)
        self._img = ImageReader(buf)
        iw, ih = im.size
        self.width = width
        self.img_w = width - 2 * self.MAT
        self.img_h = self.img_w * ih / float(iw)
        self.height = self.img_h + 2 * self.MAT + 3

    def wrap(self, aw, ah):
        self._aw = aw
        return aw, self.height

    def draw(self):
        c = self.canv
        x0 = (self._aw - self.width) / 2.0
        y0 = 3
        bh = self.img_h + 2 * self.MAT
        c.saveState()
        c.setFillColor(colors.black)
        for i, a in enumerate((0.05, 0.05, 0.04)):      # мека сянка
            c.setFillAlpha(a)
            c.rect(x0 + 1.5 + i, y0 - 1.5 - i, self.width, bh, fill=1, stroke=0)
        c.setFillAlpha(1)
        c.setFillColor(colors.white)
        c.setStrokeColor(GOLD)
        c.setLineWidth(0.7)
        c.rect(x0, y0, self.width, bh, fill=1, stroke=1)
        c.drawImage(self._img, x0 + self.MAT, y0 + self.MAT, self.img_w, self.img_h)
        c.setStrokeColor(HEX('#3a2e18'))
        c.setLineWidth(0.3)
        c.rect(x0 + self.MAT, y0 + self.MAT, self.img_w, self.img_h, fill=0, stroke=1)
        c.restoreState()


# ── Корица: нощен пейзаж над долината ─────────────────────────────────────
def _rng(seed):
    state = [seed]

    def r():
        state[0] = (state[0] * 48271) % 2147483647
        return state[0] / 2147483647.0
    return r


def _gerb(c, cx, y_bottom, scale):
    """Гербът (векторен) върху корицата; (cx, y_bottom) = долна средна точка."""
    gw, gh = 280 * scale, 300 * scale
    c.saveState()
    c.translate(cx - gw / 2, y_bottom)
    c.scale(scale, scale)
    Illustration('gerb', 280, 300).d_gerb(c, 280, 300)
    c.restoreState()


def _ridge(c, pts, color, base=0):
    p = smooth_path(c, pts)
    p.lineTo(pts[-1][0], base)
    p.lineTo(pts[0][0], base)
    p.close()
    c.setFillColor(HEX(color))
    c.drawPath(p, fill=1, stroke=0)


def _glow(c, x, y, r, color, a0=0.20, steps=44):
    """Мек отблясък: много тънки концентрични кръгове (без видим ръб)."""
    c.setFillColor(HEX(color))
    for i in range(steps):
        t = i / float(steps)
        c.setFillAlpha(a0 * 2.0 * t / steps)
        c.circle(x, y, r * (1 - t), fill=1, stroke=0)
    c.setFillAlpha(1)


def _tower(c, x, base, wb, wt, wwaist, h, color):
    """Хиперболична охладителна кула."""
    pts = [(x - wb / 2, base), (x - wwaist / 2, base + h * 0.62), (x - wt / 2, base + h)]
    pr = [(x + wt / 2, base + h), (x + wwaist / 2, base + h * 0.62), (x + wb / 2, base)]
    p = smooth_path(c, pts + pr)
    p.close()
    c.setFillColor(HEX(color))
    c.drawPath(p, fill=1, stroke=0)


def _scene(c, variant):
    front = variant == 'front'
    horizon = H * (0.325 if front else 0.20)
    # небе: от тъмносиньо към топъл здрач при хоризонта
    c.saveState()
    clip_rect(c, 0, 0, W, H)
    if front:
        lin_grad(c, 0, H, 0, horizon, [(0, '#04060d'), (0.40, '#0a1022'), (0.64, '#141e43'),
                                         (0.80, '#323561'), (0.90, '#6e5062'), (0.96, '#b9805a'),
                                         (1.0, '#e0a859')])
    else:
        lin_grad(c, 0, H, 0, horizon, [(0, '#04060d'), (0.55, '#0b1226'), (0.85, '#18214a'),
                                         (1.0, '#3b3a62')])
    c.restoreState()
    # звезди
    r = _rng(7 if front else 23)
    c.setFillColor(HEX('#e4e9f7'))
    keep_out = ((W * 0.08, H * 0.62, W * 0.92, H * 0.965) if front
                else (W * 0.08, H * 0.27, W * 0.92, H * 0.955))
    for i in range(210):
        sx = r() * W
        sy = horizon + (H - horizon) * (r() ** 0.8)
        if keep_out[0] < sx < keep_out[2] and keep_out[1] < sy < keep_out[3]:
            r(); r()
            continue
        fade = 0.25 + 0.75 * min(1.0, (sy - horizon) / (H - horizon))
        rad = 0.25 + r() * 0.75
        c.setFillAlpha(fade * (0.4 + 0.6 * r()))
        c.circle(sx, sy, rad, fill=1, stroke=0)
        if rad > 0.9 and r() > 0.55:
            c.setStrokeColor(HEX('#e4e9f7'))
            c.setLineWidth(0.25)
            c.line(sx - 2.4, sy, sx + 2.4, sy)
            c.line(sx, sy - 2.4, sx, sy + 2.4)
    c.setFillAlpha(1)
    if front:
        # луна с ореол
        mx, my = W * 0.80, H * 0.595
        _glow(c, mx, my, 54, '#cdd8ff', 0.30)
        c.setFillColor(HEX('#f2e7bd'))
        c.circle(mx, my, 14.5, fill=1, stroke=0)
        c.setFillColor(HEX('#e2d39c'))
        c.setFillAlpha(0.55)
        for dx, dy, rr in ((-4, 3, 3.2), (4, -3, 2.4), (-1, -5, 1.8), (5, 5, 1.6)):
            c.circle(mx + dx, my + dy, rr, fill=1, stroke=0)
        c.setFillAlpha(1)
        # топъл отблясък зад билата
        _glow(c, W * 0.5, horizon, 230, '#e09a4a', 0.34)
    # гребени
    k = 0.0 if front else -0.12
    _ridge(c, [(-10, horizon + 22), (W * 0.10, horizon + 40), (W * 0.24, horizon + 24), (W * 0.41, horizon + 52),
               (W * 0.56, horizon + 30), (W * 0.72, horizon + 46), (W * 0.88, horizon + 28), (W + 10, horizon + 42)],
           '#2e3659' if front else '#1b2342')
    _ridge(c, [(-10, horizon + 6), (W * 0.15, horizon + 26), (W * 0.30, horizon + 8), (W * 0.46, horizon + 30),
               (W * 0.62, horizon + 10), (W * 0.80, horizon + 28), (W + 10, horizon + 8)],
           '#1b2446' if front else '#121933')
    _ridge(c, [(-10, horizon - 6), (W * 0.2, horizon + 8), (W * 0.42, horizon - 2), (W * 0.66, horizon + 10),
               (W * 0.86, horizon - 2), (W + 10, horizon + 4)],
           '#0f1631' if front else '#0c1228')
    # долината: земя (градиентът се изрязва — иначе „extend“ заля цялата страница)
    c.saveState()
    clip_rect(c, 0, 0, W, horizon - 8)
    lin_grad(c, 0, horizon - 8, 0, 0, [(0, '#0e1530'), (1, '#04060d')])
    c.restoreState()
    gy = horizon - 24
    # ТЕЦ: три охладителни кули + комин
    tx = W * 0.745
    base = gy - 4
    steam = '#aab6d8'
    for i, (dx, hh) in enumerate(((-36, 54), (0, 60), (36, 54))):
        _tower(c, tx + dx, base, 38, 27, 21, hh, '#070b17')
        # топла светлина по ръба
        c.setStrokeColor(HEX('#c98b4a'))
        c.setStrokeAlpha(0.35 if front else 0.12)
        c.setLineWidth(0.6)
        c.line(tx + dx - 19, base, tx + dx - 10.5, base + hh * 0.62)
        c.setStrokeAlpha(1)
        # пара
        for j in range(6):
            c.setFillColor(HEX(steam))
            c.setFillAlpha(0.15 - j * 0.022)
            c.circle(tx + dx - 4 - j * 6.5, base + hh + 8 + j * 10, 5 + j * 2.7, fill=1, stroke=0)
    c.setFillAlpha(1)
    cx_ = tx + 66
    c.setFillColor(HEX('#070b17'))
    c.rect(cx_ - 3.4, base, 6.8, 118, fill=1, stroke=0)
    c.setFillColor(HEX('#c8cbd6'))
    c.setFillAlpha(0.55)
    for k_ in range(4):
        c.rect(cx_ - 3.4, base + 118 - 5 - k_ * 10, 6.8, 4.2, fill=1, stroke=0)
    c.setFillAlpha(1)
    c.setFillColor(HEX('#ff4d3a'))
    c.circle(cx_, base + 120, 1.9, fill=1, stroke=0)
    _glow(c, cx_, base + 120, 12, '#ff6a4a', 0.6, 8)
    c.setFillColor(HEX('#070b17'))
    c.rect(tx - 58, base - 2, 128, 13, fill=1, stroke=0)
    # копер на миньорска шахта (вляво)
    hx = W * 0.16
    c.setStrokeColor(HEX('#070b17'))
    c.setLineWidth(2.2)
    c.line(hx - 17, gy - 4, hx, gy + 52)
    c.line(hx + 17, gy - 4, hx, gy + 52)
    c.setLineWidth(1.0)
    for t in (0.3, 0.55, 0.8):
        yy = gy - 4 + 56 * t
        hw = 17 * (1 - t)
        c.line(hx - hw, yy, hx + hw, yy)
    c.setFillColor(HEX('#070b17'))
    c.circle(hx, gy + 53, 6.8, fill=1, stroke=0)
    c.setStrokeColor(HEX('#c98b4a'))
    c.setStrokeAlpha(0.5 if front else 0.15)
    c.setLineWidth(0.5)
    c.circle(hx, gy + 53, 6.8, fill=0, stroke=1)
    c.setStrokeAlpha(1)
    c.setFillColor(HEX('#070b17'))
    c.rect(hx - 34, gy - 6, 26, 12, fill=1, stroke=0)
    c.rect(hx + 12, gy - 6, 20, 9, fill=1, stroke=0)
    # градът: покриви и светещи прозорци
    r2 = _rng(41)
    for i in range(54):
        bx = W * 0.20 + r2() * W * 0.50
        by = gy - 18 + r2() * 14 - abs(bx - W * 0.45) * 0.03
        bw, bh = 5 + r2() * 8, 4 + r2() * 8
        c.setFillColor(HEX('#060a15'))
        c.rect(bx, by, bw, bh, fill=1, stroke=0)
        if r2() > 0.35:
            c.setFillColor(HEX('#f1b952'))
            c.setFillAlpha(0.55 + r2() * 0.45)
            c.rect(bx + 1.2, by + 1.4, 1.4, 1.4, fill=1, stroke=0)
            if bw > 8 and r2() > 0.4:
                c.rect(bx + bw - 3, by + bh - 3.2, 1.4, 1.4, fill=1, stroke=0)
            c.setFillAlpha(1)
    _glow(c, W * 0.46, gy - 10, 70, '#e8a64a', 0.32 if front else 0.12, 12)
    # улични светлини
    r3 = _rng(5)
    c.setFillColor(HEX('#ffd27a'))
    for i in range(34):
        c.setFillAlpha(0.5 + r3() * 0.5)
        c.rect(W * 0.18 + r3() * W * 0.56, gy - 24 - r3() * 8, 1.2, 1.2, fill=1, stroke=0)
    c.setFillAlpha(1)
    # преден план: тъмен склон
    p = smooth_path(c, [(-10, 52), (W * 0.25, 40), (W * 0.55, 56), (W * 0.82, 38), (W + 10, 50)])
    p.lineTo(W + 10, -10)
    p.lineTo(-10, -10)
    p.close()
    c.setFillColor(HEX('#04060d'))
    c.drawPath(p, fill=1, stroke=0)


def _frame(c):
    c.setStrokeColor(GOLD_L)
    c.setLineWidth(0.9)
    c.rect(17, 17, W - 34, H - 34, fill=0, stroke=1)
    c.setLineWidth(0.35)
    c.rect(21, 21, W - 42, H - 42, fill=0, stroke=1)
    c.setFillColor(GOLD_L)
    for (x, y) in ((17, 17), (W - 17, 17), (17, H - 17), (W - 17, H - 17)):
        diamond(c, x, y, 3.4)


def _orn(c, y, half=62, color=GOLD_L):
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(0.6)
    c.line(W / 2 - half, y, W / 2 - 9, y)
    c.line(W / 2 + 9, y, W / 2 + half, y)
    diamond(c, W / 2, y, 2.8)
    c.circle(W / 2 - 15, y, 0.9, fill=1, stroke=0)
    c.circle(W / 2 + 15, y, 0.9, fill=1, stroke=0)


def _engraved(c, text, x, y, size, tracking, fill, stroke, font='Book-Medium'):
    from reportlab.pdfbase.pdfmetrics import stringWidth
    tw = stringWidth(text, font, size) + tracking * (len(text) - 1)
    c.saveState()
    t = c.beginText(x - tw / 2.0, y)
    t.setFont(font, size)
    t.setCharSpace(tracking)
    t.setTextRenderMode(2)
    c.setFillColor(HEX(fill))
    c.setStrokeColor(HEX(stroke))
    c.setLineWidth(0.45)
    t.textOut(text)
    c.drawText(t)
    c.restoreState()


def cover_page(canvas, doc):
    c = canvas
    c.saveState()
    _scene(c, 'front')
    _frame(c)
    # герб, заглавие, подзаглавие
    _gerb(c, W / 2, H * 0.835, 0.255)
    _engraved(c, 'БОБОВ ДОЛ', W / 2, H * 0.755, 41, 7.5, '#f3e6bb', '#c9a255')
    _orn(c, H * 0.722)
    c.setFillColor(HEX('#eadcab'))
    c.setFont('Book-Italic', 17.5)
    c.drawCentredString(W / 2, H * 0.685, 'Хроника на един град')
    draw_tracked(c, W / 2, H * 0.652, 'ОТ ТРАКИТЕ ДО НАШЕТО ВРЕМЕ', 'Book-Medium', 8.2, 2.6,
                 HEX('#b9c0da'))
    # автор
    draw_tracked(c, W / 2, H * 0.098, 'СТЕФАН Л. КОСТАДИНОВ', 'Book-Medium', 10.6, 3.4,
                 HEX('#efe3b8'))
    _orn(c, H * 0.074, 38)
    c.setFillColor(GOLD_L)
    c.setFont('Book-Italic', 9.4)
    c.drawCentredString(W / 2, H * 0.052, 'MMXXVI')
    c.restoreState()


def back_cover_page(canvas, doc):
    c = canvas
    c.saveState()
    _scene(c, 'back')
    _frame(c)
    _orn(c, H * 0.935, 80)
    _gerb(c, W / 2, H * 0.822, 0.205)
    lines = [
        ('Тази книга е за едно място.', 'Book-Italic', 12.6, '#efe3b8'),
        None,
        ('За долината с форма на бобово зърно,', 'Book-Italic', 11.2, '#d3d9ec'),
        ('където траки са издълбали скални ниши,', 'Book-Italic', 11.2, '#d3d9ec'),
        ('цар Самуил е пролял братска кръв,', 'Book-Italic', 11.2, '#d3d9ec'),
        ('а хиляди миньори са слизали под земята', 'Book-Italic', 11.2, '#d3d9ec'),
        ('всеки ден — за хляба на децата си.', 'Book-Italic', 11.2, '#d3d9ec'),
        None,
        ('От първото записване на името', 'Book-Italic', 11.2, '#d3d9ec'),
        ('„Бободол“ в османски дефтер от 1576 г.', 'Book-Italic', 11.2, '#d3d9ec'),
        ('до днешните 4 023 жители —', 'Book-Italic', 11.2, '#d3d9ec'),
        ('това е хрониката на Бобов дол:', 'Book-Italic', 11.2, '#d3d9ec'),
        ('град, който не се предава.', 'Book-Medium', 12.6, '#efe3b8'),
    ]
    y = H * 0.775
    for ln in lines:
        if ln is None:
            y -= 11
            continue
        text, font, size, col = ln
        c.setFillColor(HEX(col))
        c.setFont(font, size)
        c.drawCentredString(W / 2, y, text)
        y -= 17
    y -= 12
    _engraved(c, '„Помни ме, както аз помня теб.“', W / 2, y, 14.6, 0.5, '#eddca4', '#b78e47',
              font='Book-Medium')
    c.setFillColor(HEX('#aeb6ca'))
    c.setFont('Book-Italic', 9.4)
    c.drawCentredString(W / 2, y - 18, '— Стефан Л. Костадинов')
    draw_tracked(c, W / 2, H * 0.082, 'CARBON STEALTH VCC', 'Book-Medium', 8.4, 2.6, GOLD_L)
    c.setFillColor(HEX('#aeb6ca'))
    c.setFont('Book-Italic', 8.4)
    c.drawCentredString(W / 2, H * 0.064, 'Бобов дол · Милано · 2026')
    c.restoreState()
