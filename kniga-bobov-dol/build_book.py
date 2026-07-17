# -*- coding: utf-8 -*-
"""Генератор на книгата „Бобов дол — Хроника на един град“ (второ, коригирано издание).

Пуска се с:  python3 build_book.py
Резултат:    out/Bobov-dol-Hronika.pdf
"""

import os

from reportlab.lib.pagesizes import A5
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT, TA_LEFT
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak,
    NextPageTemplate, Flowable, Table, TableStyle, KeepTogether,
)

from content_a import PREDGOVOR, PART1, PART2, PART3
from content_b import PART4, PART5, PART6
from content_c import PART7, PART8, EPILOG, CHISLA, ZA_AVTORA, IZTOCHNICI

W, H = A5

# ── Цветове ────────────────────────────────────────────────────────────────
GOLD = colors.HexColor('#8a6d3b')
DARKRED = colors.HexColor('#7b1f1f')
INK = colors.HexColor('#1c1a17')
PARCH = colors.HexColor('#efe6cf')
PARCH2 = colors.HexColor('#e6dabb')
BROWN = colors.HexColor('#4a3a22')
NIGHT1 = colors.HexColor('#0b1020')
NIGHT2 = colors.HexColor('#141c33')
MOUNT = colors.HexColor('#1a2440')
CREAM = colors.HexColor('#efe3b8')

# ── Шрифтове ───────────────────────────────────────────────────────────────
FD = '/usr/share/fonts/truetype/liberation'
pdfmetrics.registerFont(TTFont('Book', f'{FD}/LiberationSerif-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Book-Bold', f'{FD}/LiberationSerif-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Book-Italic', f'{FD}/LiberationSerif-Italic.ttf'))
pdfmetrics.registerFont(TTFont('Book-BoldItalic', f'{FD}/LiberationSerif-BoldItalic.ttf'))
registerFontFamily('Book', normal='Book', bold='Book-Bold',
                   italic='Book-Italic', boldItalic='Book-BoldItalic')

# ── Стилове ────────────────────────────────────────────────────────────────
S = {}
S['body'] = ParagraphStyle('body', fontName='Book', fontSize=9.4, leading=13.4,
                           alignment=TA_JUSTIFY, firstLineIndent=13, spaceAfter=4.5,
                           textColor=INK)
S['lead'] = ParagraphStyle('lead', parent=S['body'], firstLineIndent=0)
S['h2'] = ParagraphStyle('h2', fontName='Book-Bold', fontSize=11, leading=14,
                         spaceBefore=8, spaceAfter=3.5, textColor=INK,
                         keepWithNext=1)
S['quote'] = ParagraphStyle('quote', fontName='Book-Italic', fontSize=9.4, leading=13.2,
                            leftIndent=22, rightIndent=14, spaceBefore=5, spaceAfter=1,
                            alignment=TA_LEFT, textColor=INK)
S['attrib'] = ParagraphStyle('attrib', fontName='Book-Italic', fontSize=8.6, leading=11,
                             alignment=TA_RIGHT, rightIndent=14, spaceAfter=6,
                             textColor=colors.HexColor('#5a4a2a'))
S['caption'] = ParagraphStyle('caption', fontName='Book-Italic', fontSize=8.4, leading=11.2,
                              alignment=TA_CENTER, spaceBefore=4, spaceAfter=7,
                              leftIndent=8, rightIndent=8,
                              textColor=colors.HexColor('#4a4a44'))
S['parttag'] = ParagraphStyle('parttag', fontName='Book-Italic', fontSize=12.5,
                              alignment=TA_CENTER, textColor=GOLD, spaceAfter=10)
S['parttitle'] = ParagraphStyle('parttitle', fontName='Book-Bold', fontSize=20, leading=24,
                                alignment=TA_CENTER, textColor=INK, spaceAfter=5)
S['partsub'] = ParagraphStyle('partsub', fontName='Book-Italic', fontSize=11,
                              alignment=TA_CENTER, textColor=INK, spaceAfter=12)
S['glava'] = ParagraphStyle('glava', fontName='Book', fontSize=11, alignment=TA_CENTER,
                            textColor=GOLD, spaceBefore=6, spaceAfter=2)
S['roman'] = ParagraphStyle('roman', fontName='Book-Bold', fontSize=38, leading=42,
                            alignment=TA_CENTER, textColor=INK, spaceAfter=6)
S['chtitle'] = ParagraphStyle('chtitle', fontName='Book-Bold', fontSize=17.5, leading=21,
                              alignment=TA_CENTER, textColor=INK, spaceAfter=3)
S['chsub'] = ParagraphStyle('chsub', fontName='Book-Italic', fontSize=10.5,
                            alignment=TA_CENTER, textColor=INK, spaceAfter=10)
S['disp'] = ParagraphStyle('disp', fontName='Book-Bold', fontSize=21, leading=25,
                           alignment=TA_CENTER, textColor=INK, spaceAfter=4)
S['bigword'] = ParagraphStyle('bigword', fontName='Book-Bold', fontSize=19,
                              alignment=TA_CENTER, spaceBefore=8, spaceAfter=8,
                              textColor=INK)
S['sign'] = ParagraphStyle('sign', fontName='Book-Italic', fontSize=9.6, leading=13.5,
                           alignment=TA_RIGHT, rightIndent=8, spaceBefore=10,
                           textColor=INK)
S['toc1'] = ParagraphStyle('toc1', fontName='Book-Bold', fontSize=9.6, leading=13.5,
                           spaceBefore=6, textColor=INK)
S['toc2'] = ParagraphStyle('toc2', fontName='Book', fontSize=9.4, leading=13.2,
                           leftIndent=10, textColor=INK)
S['src'] = ParagraphStyle('src', fontName='Book', fontSize=9.0, leading=12.4,
                          leftIndent=12, firstLineIndent=-8, spaceAfter=3.5,
                          bulletIndent=0, textColor=INK)
S['finis'] = ParagraphStyle('finis', fontName='Book-Italic', fontSize=12,
                            alignment=TA_CENTER, spaceBefore=18, textColor=GOLD)
S['ded'] = ParagraphStyle('ded', fontName='Book-Italic', fontSize=10.6, leading=16,
                          alignment=TA_CENTER, textColor=INK)
S['motto'] = ParagraphStyle('motto', fontName='Book-Italic', fontSize=9.8,
                            leading=14, alignment=TA_CENTER, spaceBefore=26,
                            leftIndent=26, rightIndent=26, textColor=INK)
S['motto_attr'] = ParagraphStyle('motto_attr', fontName='Book', fontSize=8.6,
                                 alignment=TA_CENTER, spaceBefore=3,
                                 textColor=GOLD)
S['imprint'] = ParagraphStyle('imprint', fontName='Book', fontSize=8.8, leading=12.4,
                              textColor=INK, spaceAfter=3)
S['kvl'] = ParagraphStyle('kvl', fontName='Book-BoldItalic', fontSize=8.6, leading=11,
                          textColor=INK)
S['kvv'] = ParagraphStyle('kvv', fontName='Book', fontSize=8.8, leading=11.2,
                          textColor=INK)


# ── Орнамент ───────────────────────────────────────────────────────────────
class Ornament(Flowable):
    """Хоризонтална линия с ромб в средата."""

    def __init__(self, width=120, space=8):
        super().__init__()
        self.w, self.sp = width, space
        self.width, self.height = width, space * 2

    def wrap(self, aw, ah):
        self._aw = aw
        return aw, self.height

    def draw(self):
        c = self.canv
        cx = self._aw / 2.0
        cy = self.height / 2.0
        c.setStrokeColor(GOLD)
        c.setLineWidth(0.7)
        gap = 7
        c.line(cx - self.w / 2, cy, cx - gap, cy)
        c.line(cx + gap, cy, cx + self.w / 2, cy)
        c.setFillColor(GOLD)
        d = 2.6
        p = c.beginPath()
        p.moveTo(cx, cy - d)
        p.lineTo(cx + d, cy)
        p.lineTo(cx, cy + d)
        p.lineTo(cx - d, cy)
        p.close()
        c.drawPath(p, fill=1, stroke=0)


# ── Илюстрации (векторни, чисти — без „петна“) ────────────────────────────
def _parchment(c, x, y, w, h):
    c.setFillColor(PARCH)
    c.setStrokeColor(BROWN)
    c.setLineWidth(0.8)
    c.rect(x, y, w, h, fill=1, stroke=1)
    c.setLineWidth(0.4)
    c.rect(x + 4, y + 4, w - 8, h - 8, fill=0, stroke=1)


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

    # — етимология: шушулка и долина —
    def d_etymology(self, c, w, h):
        _parchment(c, 0, 0, w, h)
        c.setFillColor(BROWN)
        c.setFont('Book-Bold', 9.5)
        c.drawString(14, h - 20, 'Произход на името')
        c.setFont('Book-Italic', 7.5)
        c.drawString(14, h - 31, 'Бобов дол — долина с форма на бобово зърно')
        # шушулка
        cx1, cy1 = w * 0.27, h * 0.48
        c.setFillColor(colors.HexColor('#3f5d33'))
        c.setStrokeColor(colors.HexColor('#2c421f'))
        c.setLineWidth(0.8)
        c.ellipse(cx1 - 52, cy1 - 17, cx1 + 52, cy1 + 17, fill=1, stroke=1)
        c.setFillColor(colors.HexColor('#c9b98a'))
        for i in range(4):
            bx = cx1 - 33 + i * 22
            c.circle(bx, cy1, 6.5, fill=1, stroke=1)
        # долина
        cx2, cy2 = w * 0.72, h * 0.48
        c.setFillColor(colors.HexColor('#7c9464'))
        c.setStrokeColor(colors.HexColor('#5a7046'))
        c.ellipse(cx2 - 58, cy2 - 26, cx2 + 58, cy2 + 26, fill=1, stroke=1)
        c.setFillColor(colors.HexColor('#a9bd8d'))
        c.ellipse(cx2 - 44, cy2 - 16, cx2 + 44, cy2 + 16, fill=1, stroke=1)
        c.setFillColor(DARKRED)
        for dx, dy in ((-18, 2), (-6, -5), (6, 4), (16, -2), (0, 8), (-12, 9)):
            c.rect(cx2 + dx, cy2 + dy, 3.4, 3.4, fill=1, stroke=0)
        c.setFillColor(BROWN)
        c.setFont('Book-Italic', 7.6)
        c.drawCentredString(cx1, cy1 - 34, 'Бобово зърно в шушулка')
        c.drawCentredString(cx2, cy2 - 40, 'Долината на Бобов дол')
        c.setFont('Book', 6.8)
        c.drawCentredString(w / 2, 12, '„Името на града идва от долината с форма на бобово зърно.“ — Българска енциклопедия')

    # — Разметаница, 987 —
    def d_razmetanitsa(self, c, w, h):
        c.setStrokeColor(BROWN)
        c.setLineWidth(0.8)
        # небе — здрач на ленти
        bands = ['#8d7a5e', '#9b8265', '#a98a6a', '#b5926e']
        bh = h * 0.55 / len(bands)
        for i, col in enumerate(bands):
            c.setFillColor(colors.HexColor(col))
            c.rect(0, h * 0.45 + i * bh, w, bh + 0.5, fill=1, stroke=0)
        # слънце
        c.setFillColor(colors.HexColor('#b23a2a'))
        c.circle(w * 0.84, h * 0.82, 15, fill=1, stroke=0)
        # планини
        c.setFillColor(colors.HexColor('#6e5f49'))
        p = c.beginPath()
        p.moveTo(0, h * 0.45)
        pts = [(0.10, 0.62), (0.22, 0.50), (0.35, 0.66), (0.50, 0.52),
               (0.63, 0.64), (0.78, 0.50), (0.90, 0.60), (1.0, 0.48)]
        for fx, fy in pts:
            p.lineTo(w * fx, h * fy)
        p.lineTo(w, h * 0.45)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
        # поле
        c.setFillColor(colors.HexColor('#8a7350'))
        c.rect(0, 0, w, h * 0.45, fill=1, stroke=0)
        # ловен дворец
        bx, by = w * 0.62, h * 0.30
        c.setFillColor(CREAM)
        c.rect(bx, by, 34, 18, fill=1, stroke=1)
        c.setFillColor(DARKRED)
        p = c.beginPath()
        p.moveTo(bx - 3, by + 18)
        p.lineTo(bx + 17, by + 30)
        p.lineTo(bx + 37, by + 18)
        p.close()
        c.drawPath(p, fill=1, stroke=1)
        c.setLineWidth(0.9)
        c.line(bx + 17, by + 30, bx + 17, by + 38)
        c.setFillColor(DARKRED)
        p = c.beginPath()
        p.moveTo(bx + 17, by + 38)
        p.lineTo(bx + 26, by + 35.5)
        p.lineTo(bx + 17, by + 33)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
        # войски — два отряда фигурки
        c.setFillColor(colors.HexColor('#2e2418'))
        for gx in (w * 0.14, w * 0.34):
            for i in range(6):
                fx = gx + (i % 3) * 8
                fy = h * 0.14 + (i // 3) * 10
                c.circle(fx, fy + 5, 1.6, fill=1, stroke=0)
                c.setLineWidth(0.9)
                c.line(fx, fy + 3.4, fx, fy - 2)
                c.line(fx + 2.5, fy - 2, fx + 2.5, fy + 8)
        # надпис
        c.setFillColor(colors.HexColor('#241c12'))
        c.rect(8, h - 24, 150, 16, fill=1, stroke=0)
        c.setFillColor(CREAM)
        c.setFont('Book-Bold', 8)
        c.drawString(13, h - 18, 'Разметаница, 14 юни 987 г.')
        c.setFont('Book-Italic', 6.4)
        c.drawString(13, h - 23.4, '— гибелта на Арон —')
        c.setStrokeColor(BROWN)
        c.setLineWidth(0.8)
        c.rect(0, 0, w, h, fill=0, stroke=1)

    # — дефтер 1576 —
    def d_defter(self, c, w, h):
        _parchment(c, 0, 0, w, h)
        c.setFillColor(BROWN)
        c.setFont('Book-Italic', 7.4)
        c.drawString(14, h - 16, 'Стилизирана художествена възстановка — османски данъчен дефтер')
        c.setFont('Book-Bold', 11)
        c.drawString(14, h - 31, 'Кюстендилски санджак · 984 г. по Хиджра (≈ 1576 сл. Хр.)')
        # орнаментален „ръкописен“ ред
        c.setStrokeColor(BROWN)
        c.setLineWidth(0.7)
        y = h - 48
        import math
        p = c.beginPath()
        p.moveTo(16, y)
        for i in range(1, 90):
            xx = 16 + i * (w - 32) / 90.0
            p.lineTo(xx, y + 3.0 * math.sin(i * 0.9) * (0.4 + 0.6 * ((i * 7) % 3) / 2.0))
        c.drawPath(p, fill=0, stroke=1)
        # таблица — редове без застъпване
        rows = [
            ('Санджак', 'Кюстендил'),
            ('Еялет', 'Румелия'),
            ('Име на село', 'БОБОДОЛ'),
            ('Ханета (домакинства)', 'няколко десетки'),
            ('Земя', 'зърно, тютюн и ливади'),
            ('Годишен данък (харач)', '≈ 1 300 акчета'),
        ]
        ty = h - 66
        rh = 15
        lw = 108
        c.setLineWidth(0.5)
        for i, (k, v) in enumerate(rows):
            yy = ty - i * rh
            c.setFillColor(PARCH2 if i % 2 == 0 else PARCH)
            c.rect(16, yy - rh + 3, w - 32, rh, fill=1, stroke=1)
            c.setFillColor(BROWN)
            c.setFont('Book-Bold', 7.8)
            c.drawString(21, yy - 7, k)
            c.setFont('Book' if v != 'БОБОДОЛ' else 'Book-Bold', 8.2)
            c.drawString(21 + lw, yy - 7, v)
            c.line(16 + lw, yy - rh + 3, 16 + lw, yy + 3)
        # печат
        c.setStrokeColor(colors.HexColor('#8c2f24'))
        cx, cy = w / 2, ty - len(rows) * rh - 26
        for r in range(3, 20, 2):
            c.setLineWidth(0.45)
            c.circle(cx, cy, r, fill=0, stroke=1)
        c.setFillColor(BROWN)
        c.setFont('Book-Italic', 6.8)
        c.drawCentredString(w / 2, 10,
                            'Възстановка. Оригиналните дефтери се съхраняват в Османския архив в Истанбул.')

    # — миньорски разрез —
    def d_mine_section(self, c, w, h):
        c.setStrokeColor(BROWN)
        c.setLineWidth(0.8)
        # небе
        c.setFillColor(colors.HexColor('#c7b98f'))
        c.rect(0, h * 0.78, w, h * 0.22, fill=1, stroke=0)
        # земни пластове
        layers = [('#8a6f4b', 0.70, 'почвен слой'),
                  ('#6e5638', 0.56, 'пясъчник'),
                  ('#55432c', 0.40, 'скална основа'),
                  ('#3a2e20', 0.0, '')]
        prev = 0.78
        for col, top, lbl in layers:
            c.setFillColor(colors.HexColor(col))
            c.rect(0, h * top, w, h * (prev - top), fill=1, stroke=0)
            if lbl:
                c.setFillColor(colors.HexColor('#e8dcC0'))
                c.setFont('Book-Italic', 6.4)
                c.drawString(w * 0.66, h * (top + (prev - top) / 2) - 2, lbl)
            prev = top
        # шахта + надшахтна кула
        sx = w * 0.30
        c.setStrokeColor(colors.HexColor('#171310'))
        c.setLineWidth(2.2)
        c.line(sx, h * 0.08, sx, h * 0.78)
        c.setLineWidth(1.0)
        p = c.beginPath()
        p.moveTo(sx - 12, h * 0.78)
        p.lineTo(sx, h * 0.97)
        p.lineTo(sx + 12, h * 0.78)
        c.drawPath(p, fill=0, stroke=1)
        c.circle(sx, h * 0.955, 3.2, fill=0, stroke=1)
        # въглищни пластове (галерии)
        c.setFillColor(colors.HexColor('#14100c'))
        seams = [(0.30, 'пласт „Гребикал“'), (0.20, 'Чеганска синклинала')]
        for fy, lbl in seams:
            c.rect(w * 0.08, h * fy, w * 0.84, 7, fill=1, stroke=0)
            c.setFillColor(colors.HexColor('#e0b64e'))
            c.setFont('Book-Bold', 6.6)
            c.drawString(w * 0.40, h * fy + 8.5, '◂ ' + lbl)
            c.setFillColor(colors.HexColor('#14100c'))
        c.setFillColor(BROWN)
        c.setFont('Book-Bold', 8)
        c.setFillColor(colors.HexColor('#2c2318'))
        c.drawString(10, h - 13, 'Подземен разрез')
        c.setFont('Book-Italic', 6.4)
        c.drawString(10, h - 21, 'на миньорски забой')
        c.setStrokeColor(BROWN)
        c.setLineWidth(0.8)
        c.rect(0, 0, w, h, fill=0, stroke=1)

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

    # — карта на общината —
    def d_map(self, c, w, h):
        _parchment(c, 0, 0, w, h)
        c.setFillColor(BROWN)
        c.setFont('Book-Bold', 10.5)
        c.drawCentredString(w / 2, h - 20, 'КАРТА НА ОБЩИНА БОБОВ ДОЛ')
        c.setFont('Book-Italic', 7)
        c.drawCentredString(w / 2, h - 30, '— 18 населени места в полите на Конявската планина —')
        # планински вериги (север)
        c.setStrokeColor(colors.HexColor('#87755a'))
        c.setLineWidth(0.9)
        for i in range(7):
            mx = 22 + i * (w - 44) / 6.0
            p = c.beginPath()
            p.moveTo(mx - 8, h - 52)
            p.lineTo(mx, h - 42)
            p.lineTo(mx + 8, h - 52)
            c.drawPath(p, fill=0, stroke=1)
        c.setFont('Book', 7)
        c.setFillColor(BROWN)
        c.drawCentredString(w * 0.16, h - 62, '↑ Радомир')
        c.drawString(10, h * 0.56, '← Кюстендил')
        c.drawRightString(w - 10, h * 0.62, 'Дупница →')
        # реки
        c.setStrokeColor(colors.HexColor('#4a6f96'))
        c.setLineWidth(1.0)
        p = c.beginPath()
        p.moveTo(w * 0.18, h * 0.28)
        p.curveTo(w * 0.34, h * 0.34, w * 0.44, h * 0.42, w * 0.58, h * 0.50)
        p.curveTo(w * 0.72, h * 0.56, w * 0.84, h * 0.58, w * 0.95, h * 0.60)
        c.drawPath(p, fill=0, stroke=1)
        # връх Колош
        c.setFillColor(colors.HexColor('#6b5537'))
        p = c.beginPath()
        p.moveTo(w * 0.10, h * 0.40)
        p.lineTo(w * 0.145, h * 0.50)
        p.lineTo(w * 0.19, h * 0.40)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
        c.setFont('Book', 6.4)
        c.drawCentredString(w * 0.145, h * 0.36, 'в. Колош (1314 м)')
        # селища: (fx, fy, име, дясно?)
        vills = [
            (0.38, 0.81, 'Голям Върбовник', 0), (0.56, 0.78, 'Мламолово', 0),
            (0.32, 0.73, 'Мали Върбовник', 0), (0.20, 0.66, 'Горна Козница', 0),
            (0.66, 0.70, 'Коркина', 0), (0.56, 0.60, 'Новоселяне', 0),
            (0.72, 0.60, 'Мало село', 0), (0.60, 0.52, 'Големо село', 1),
            (0.78, 0.50, 'Паничарево', 0), (0.70, 0.42, 'Долистово', 0),
            (0.60, 0.38, 'Блато', 0), (0.52, 0.30, 'Шатрово', 0),
            (0.28, 0.34, 'Голема Фуча', 0), (0.22, 0.26, 'Мала Фуча', 0),
            (0.40, 0.24, 'Бабино', 0), (0.48, 0.18, 'Бабинска река', 0),
            (0.62, 0.14, 'Локвата', 0),
        ]
        c.setFont('Book', 5.8)
        for fx, fy, name, right in vills:
            c.setFillColor(colors.HexColor('#3c3222'))
            c.circle(w * fx, h * fy, 1.7, fill=1, stroke=0)
            if right:
                c.drawRightString(w * fx - 4, h * fy - 2, name)
            else:
                c.drawString(w * fx + 4, h * fy - 2, name)
        # градът
        c.setFillColor(DARKRED)
        c.rect(w * 0.44 - 3.4, h * 0.665 - 3.4, 6.8, 6.8, fill=1, stroke=0)
        c.setFont('Book-Bold', 7.4)
        c.setFillColor(INK)
        c.drawCentredString(w * 0.44, h * 0.695, 'БОБОВ ДОЛ')
        # легенда
        c.setFillColor(PARCH2)
        c.setStrokeColor(BROWN)
        c.setLineWidth(0.6)
        c.rect(12, 12, 118, 42, fill=1, stroke=1)
        c.setFillColor(DARKRED)
        c.rect(18, 42, 5, 5, fill=1, stroke=0)
        c.setFillColor(colors.HexColor('#3c3222'))
        c.circle(20.5, 33, 1.7, fill=1, stroke=0)
        c.setStrokeColor(colors.HexColor('#4a6f96'))
        c.line(16, 22, 26, 22)
        c.setFillColor(BROWN)
        c.setFont('Book', 6.2)
        c.drawString(29, 42.5, 'град Бобов дол')
        c.drawString(29, 31, 'село от общината')
        c.drawString(29, 20, 'река')
        # роза на ветровете
        cx, cy = w - 34, 34
        c.setStrokeColor(DARKRED)
        c.setLineWidth(1.0)
        c.line(cx, cy - 14, cx, cy + 14)
        c.line(cx - 14, cy, cx + 14, cy)
        c.setFillColor(BROWN)
        c.setFont('Book-Bold', 7)
        c.drawCentredString(cx, cy + 17, 'С')
        c.drawCentredString(cx, cy - 23, 'Ю')
        c.drawCentredString(cx - 20, cy - 2.4, 'З')
        c.drawCentredString(cx + 20, cy - 2.4, 'И')

    # — времева линия (в правилен хронологичен ред) —
    def d_timeline(self, c, w, h):
        _parchment(c, 0, 0, w, h)
        c.setFillColor(BROWN)
        c.setFont('Book-Bold', 10.5)
        c.drawCentredString(w / 2, h - 18, 'Времева линия на Бобов дол')
        c.setFont('Book-Italic', 6.6)
        c.drawCentredString(w / 2, h - 27, '— основни събития от праисторията до днес —')
        entries = [
            ('II хил. пр. Хр.', 'Траките', 'скални ниши в Дуралинко'),
            ('987 г. (14 юни)', 'Разметаница', 'Самуил погубва брат си Арон'),
            ('XII век', 'Византия', 'укреплението на връх Колош'),
            ('1576 г.', 'Първо име', '„Бободол“ в османски дефтер'),
            ('1822 г.', 'Свети Никола', 'възрожденската църква'),
            ('1836 г.', 'Ами Буе', 'открива въглищния басейн'),
            ('1881 г.', 'Училище', 'първото училище в селото'),
            ('1891 г.', 'Първата мина', '1 530 тона — начало на въгледобива'),
            ('1917 г.', 'Теснолинейка', 'жп линия Дупница – Бобов дол'),
            ('1967 г.', 'Град', 'Указ № 788; празник — 27 октомври'),
            ('1969–1975', 'ТЕЦ', '630 MW; 200-метров комин'),
            ('1980-те', 'Златни години', '7 300 миньори; 2 млн т годишно'),
            ('1989 г.', 'Преходът', 'разграбване; масова миграция'),
            ('2018 г.', 'Край под земята', 'закрит последният подземен рудник'),
            ('2024 г.', 'Днес', '4 023 жители; 18 населени места'),
        ]
        cx = w / 2
        top = h - 40
        bot = 16
        c.setStrokeColor(BROWN)
        c.setLineWidth(1.2)
        c.line(cx, bot, cx, top)
        n = len(entries)
        step = (top - bot) / float(n)
        bw = w / 2 - 26
        for i, (yr, ttl, sub) in enumerate(entries):
            yy = top - i * step - step / 2
            left = (i % 2 == 1)
            bx = cx - 14 - bw if left else cx + 14
            c.setFillColor(PARCH2)
            c.setStrokeColor(BROWN)
            c.setLineWidth(0.6)
            c.rect(bx, yy - 11, bw, 24, fill=1, stroke=1)
            c.setFillColor(DARKRED)
            c.setFont('Book-Bold', 7.2)
            c.drawString(bx + 5, yy + 4.5, yr + '  ·  ' + ttl)
            c.setFillColor(BROWN)
            c.setFont('Book-Italic', 6.2)
            c.drawString(bx + 5, yy - 5, sub)
            c.setFillColor(DARKRED)
            c.circle(cx, yy + 1, 2.4, fill=1, stroke=0)
            c.setLineWidth(0.6)
            c.line(cx - 14 if left else cx, yy + 1, cx if left else cx + 14, yy + 1)


# ── Фотография с рамка ─────────────────────────────────────────────────────
from reportlab.lib.utils import ImageReader

PHOTO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'photos')


class Photo(Flowable):
    def __init__(self, filename, width=300):
        super().__init__()
        self.path = os.path.join(PHOTO_DIR, filename)
        img = ImageReader(self.path)
        iw, ih = img.getSize()
        self.width = width
        self.height = width * ih / float(iw)
        self._img = img

    def wrap(self, aw, ah):
        self._aw = aw
        return aw, self.height

    def draw(self):
        c = self.canv
        x0 = (self._aw - self.width) / 2.0
        c.drawImage(self._img, x0, 0, self.width, self.height,
                    preserveAspectRatio=True)
        c.setStrokeColor(BROWN)
        c.setLineWidth(0.9)
        c.rect(x0, 0, self.width, self.height, fill=0, stroke=1)


# ── Страници: рамка, колонтитул, номер ────────────────────────────────────
BOOK_HDR = 'БОБОВ ДОЛ · ХРОНИКА НА ЕДИН ГРАД'
AUTH_HDR = 'СТЕФАН Л. КОСТАДИНОВ'


class NoHeader(Flowable):
    width = height = 0

    def wrap(self, aw, ah):
        return 0, 0

    def draw(self):
        self.canv._noheader = True


def inner_decor(canvas, doc):
    pg = canvas.getPageNumber()
    noheader = getattr(canvas, '_noheader', False)
    canvas._noheader = False
    canvas.saveState()
    # рамка
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(0.8)
    canvas.rect(38, 46, W - 76, H - 46 - 62)
    # колонтитул
    if not noheader:
        hdr = AUTH_HDR if pg % 2 == 1 else BOOK_HDR
        canvas.setFont('Book-Italic', 7.6)
        canvas.setFillColor(colors.HexColor('#5a4a2a'))
        canvas.drawCentredString(W / 2, H - 40, hdr)
        canvas.setStrokeColor(GOLD)
        canvas.setLineWidth(0.6)
        canvas.line(W / 2 - 70, H - 48, W / 2 - 8, H - 48)
        canvas.line(W / 2 + 8, H - 48, W / 2 + 70, H - 48)
        canvas.setFillColor(GOLD)
        d = 2.2
        p = canvas.beginPath()
        p.moveTo(W / 2, H - 48 - d)
        p.lineTo(W / 2 + d, H - 48)
        p.lineTo(W / 2, H - 48 + d)
        p.lineTo(W / 2 - d, H - 48)
        p.close()
        canvas.drawPath(p, fill=1, stroke=0)
    # номер
    canvas.setFont('Book-Italic', 8.4)
    canvas.setFillColor(colors.HexColor('#5a4a2a'))
    canvas.drawCentredString(W / 2, 30, f'— {pg} —')
    canvas.restoreState()


def _night_sky(canvas, seed=7):
    canvas.setFillColor(NIGHT1)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)
    canvas.setFillColor(NIGHT2)
    canvas.rect(0, 0, W, H * 0.55, fill=1, stroke=0)
    # звезди — детерминистично
    canvas.setFillColor(colors.HexColor('#cfd6e8'))
    x = seed
    for i in range(90):
        x = (x * 48271) % 2147483647
        sx = (x % 1000) / 1000.0 * W
        x = (x * 48271) % 2147483647
        sy = (x % 1000) / 1000.0 * H
        x = (x * 48271) % 2147483647
        r = 0.4 + (x % 100) / 100.0 * 0.8
        canvas.circle(sx, sy, r, fill=1, stroke=0)


def cover_page(canvas, doc):
    canvas.saveState()
    _night_sky(canvas, 7)
    # планини
    canvas.setFillColor(MOUNT)
    p = canvas.beginPath()
    p.moveTo(0, H * 0.30)
    for fx, fy in ((0.12, 0.42), (0.25, 0.33), (0.40, 0.46), (0.55, 0.34),
                   (0.70, 0.44), (0.85, 0.32), (1.0, 0.40)):
        p.lineTo(W * fx, H * fy)
    p.lineTo(W, 0)
    p.lineTo(0, 0)
    p.close()
    canvas.drawPath(p, fill=1, stroke=0)
    # луна
    canvas.setFillColor(colors.HexColor('#e9c97e'))
    canvas.circle(W * 0.20, H * 0.52, 20, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor('#f4dfa8'))
    canvas.circle(W * 0.20, H * 0.52, 14, fill=1, stroke=0)
    # комин с дим
    canvas.setFillColor(colors.HexColor('#0a0d18'))
    canvas.rect(W * 0.72 - 4, H * 0.18, 8, H * 0.22, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor('#39415a'))
    for i in range(7):
        canvas.setFillAlpha(0.55 - i * 0.06)
        canvas.circle(W * 0.72 + i * 3, H * 0.40 + 8 + i * 11, 5 + i * 2.2, fill=1, stroke=0)
    canvas.setFillAlpha(1)
    # светлинки на града
    canvas.setFillColor(colors.HexColor('#e0b64e'))
    x = 13
    for i in range(26):
        x = (x * 48271) % 2147483647
        sx = W * 0.18 + (x % 1000) / 1000.0 * W * 0.55
        x = (x * 48271) % 2147483647
        sy = H * 0.10 + (x % 1000) / 1000.0 * H * 0.05
        canvas.rect(sx, sy, 1.6, 1.6, fill=1, stroke=0)
    # заглавие
    canvas.setFillColor(CREAM)
    canvas.setFont('Book-Bold', 33)
    canvas.drawCentredString(W / 2, H * 0.80, 'БОБОВ  ДОЛ')
    canvas.setFont('Book-Italic', 13.5)
    canvas.drawCentredString(W / 2, H * 0.735, 'Хроника на един град')
    canvas.setFont('Book', 9.5)
    canvas.setFillColor(colors.HexColor('#cbd2e4'))
    canvas.drawCentredString(W / 2, H * 0.70, 'От траките до нашето време')
    canvas.setFillColor(GOLD)
    canvas.setFont('Book', 9)
    canvas.drawCentredString(W / 2, H * 0.655, '·  MMXXVI  ·')
    # орнаменти
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(0.8)
    for yy in (H * 0.865, H * 0.09):
        canvas.line(W * 0.22, yy, W * 0.44, yy)
        canvas.line(W * 0.56, yy, W * 0.78, yy)
        canvas.setFillColor(GOLD)
        d = 2.6
        p = canvas.beginPath()
        p.moveTo(W / 2, yy - d)
        p.lineTo(W / 2 + d, yy)
        p.lineTo(W / 2, yy + d)
        p.lineTo(W / 2 - d, yy)
        p.close()
        canvas.drawPath(p, fill=1, stroke=0)
    canvas.setFillColor(CREAM)
    canvas.setFont('Book', 11)
    canvas.drawCentredString(W / 2, H * 0.045, 'Стефан Л. Костадинов')
    canvas.restoreState()


def back_cover_page(canvas, doc):
    canvas.saveState()
    _night_sky(canvas, 23)
    canvas.setFillColor(MOUNT)
    p = canvas.beginPath()
    p.moveTo(0, H * 0.16)
    for fx, fy in ((0.2, 0.22), (0.45, 0.14), (0.7, 0.20), (1.0, 0.13)):
        p.lineTo(W * fx, H * fy)
    p.lineTo(W, 0)
    p.lineTo(0, 0)
    p.close()
    canvas.drawPath(p, fill=1, stroke=0)
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(0.7)
    canvas.line(W * 0.14, H * 0.90, W * 0.86, H * 0.90)
    canvas.setFillColor(colors.HexColor('#d9dee c'.replace(' ', '')))
    canvas.setFont('Book-Italic', 9.6)
    lines = [
        'Тази книга е за едно място.',
        '',
        'За долината с форма на бобово зърно,',
        'където траки са издълбали скални ниши,',
        'цар Самуил е пролял братска кръв,',
        'а хиляди миньори са слизали под земята',
        'всеки ден — за хляба на децата си.',
        '',
        'От първото записване на името',
        '„Бободол“ в османски дефтер от 1576 г.',
        'до днешните 4 023 жители —',
        'това е хрониката на Бобов дол:',
        'град, който не се предава.',
    ]
    yy = H * 0.845
    for ln in lines:
        if ln:
            canvas.drawCentredString(W / 2, yy, ln)
        yy -= 15.5
    canvas.setFillColor(colors.HexColor('#e9c97e'))
    canvas.setFont('Book-Bold', 14)
    canvas.drawCentredString(W / 2, yy - 8, '„Помни ме, както аз помня теб.“')
    canvas.setFillColor(colors.HexColor('#aeb6ca'))
    canvas.setFont('Book-Italic', 8.4)
    canvas.drawCentredString(W / 2, yy - 24, '— Стефан Л. Костадинов')
    canvas.setStrokeColor(GOLD)
    canvas.line(W * 0.30, H * 0.12, W * 0.70, H * 0.12)
    canvas.setFillColor(GOLD)
    canvas.setFont('Book-Bold', 9.5)
    canvas.drawCentredString(W / 2, H * 0.095, 'Carbon Stealth VCC')
    canvas.setFillColor(colors.HexColor('#aeb6ca'))
    canvas.setFont('Book', 8)
    canvas.drawCentredString(W / 2, H * 0.072, 'Бобов дол · Милано · 2026')
    canvas.restoreState()


def blank_decor(canvas, doc):
    pass


# ── Сглобяване на историята ───────────────────────────────────────────────
def para(txt, style):
    return Paragraph(txt, style)


def lead_par(txt):
    first, rest = txt[0], txt[1:]
    return Paragraph(
        f'<font size="14" color="#7b1f1f"><b>{first}</b></font>{rest}', S['lead'])


def kv_table(rows):
    data = [[para(k + ':', S['kvl']), para(v, S['kvv'])] for k, v in rows]
    t = Table(data, colWidths=[95, W - 76 - 18 - 20 - 95])
    style = [
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, 0), (-1, -2), 0.4, colors.HexColor('#cbbb92')),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f6efdd')),
    ]
    t.setStyle(TableStyle(style))
    return t


def blocks_to_flow(blocks, story):
    skip_next = False
    for i, b in enumerate(blocks):
        if skip_next:
            skip_next = False
            continue
        kind = b[0]
        if kind == 'part':
            _, tag, title, sub = b
            story.append(PageBreak())
            story.append(Spacer(1, 150))
            story.append(para(tag, S['parttag']))
            story.append(Ornament(110))
            story.append(Spacer(1, 6))
            story.append(para(title, S['parttitle']))
            story.append(para(sub, S['partsub']))
            story.append(Ornament(110))
        elif kind == 'chapter':
            _, rn, title, sub = b
            story.append(PageBreak())
            story.append(Spacer(1, 26))
            story.append(Ornament(90))
            story.append(para('Г &nbsp;Л &nbsp;А &nbsp;В &nbsp;А', S['glava']))
            story.append(para(rn, S['roman']))
            story.append(para(title, S['chtitle']))
            if sub:
                story.append(para(sub, S['chsub']))
            story.append(Ornament(90))
            story.append(Spacer(1, 10))
        elif kind == 'display_title':
            _, title, sub = b
            story.append(PageBreak())
            story.append(Spacer(1, 16))
            story.append(para(title, S['disp']))
            if sub:
                story.append(para(sub, S['chsub']))
            story.append(Ornament(100))
            story.append(Spacer(1, 10))
        elif kind == 'lead':
            story.append(lead_par(b[1]))
        elif kind == 'p':
            story.append(para(b[1], S['body']))
        elif kind == 'h2':
            story.append(para(b[1], S['h2']))
        elif kind == 'quote':
            story.append(para(b[1], S['quote']))
            story.append(para(b[2], S['attrib']))
        elif kind == 'kv':
            story.append(Spacer(1, 4))
            story.append(kv_table(b[1]))
            story.append(Spacer(1, 6))
        elif kind == 'img':
            name = b[1]
            sizes = {'etymology': (300, 150), 'razmetanitsa': (300, 175),
                     'defter': (300, 215), 'mine_section': (300, 185)}
            iw, ih = sizes.get(name, (300, 180))
            group = [Spacer(1, 6), Illustration(name, iw, ih)]
            if i + 1 < len(blocks) and blocks[i + 1][0] == 'caption':
                group.append(para(blocks[i + 1][1], S['caption']))
                skip_next = True
            story.append(KeepTogether(group))
        elif kind == 'photo':
            group = [Spacer(1, 6), Photo(b[1], 295)]
            if i + 1 < len(blocks) and blocks[i + 1][0] == 'caption':
                group.append(para(blocks[i + 1][1], S['caption']))
                skip_next = True
            story.append(KeepTogether(group))
        elif kind == 'caption':
            story.append(para(b[1], S['caption']))
        elif kind == 'bigword':
            story.append(para(b[1], S['bigword']))
        elif kind == 'sign':
            story.append(para(b[1] + '<br/>' + b[2], S['sign']))
        elif kind == 'src':
            story.append(para('•&nbsp;' + b[1], S['src']))
        elif kind == 'motto':
            story.append(para(b[1], S['motto']))
            story.append(para(b[2], S['motto_attr']))
        elif kind == 'finis':
            story.append(Spacer(1, 10))
            story.append(Ornament(120))
            story.append(para(b[1], S['finis']))
            story.append(Spacer(1, 4))
            story.append(Ornament(120))
        elif kind == 'vspace':
            story.append(Spacer(1, b[1]))
    return story


def toc_flow(story):
    story.append(PageBreak())
    story.append(Spacer(1, 12))
    story.append(para('Съдържание', S['disp']))
    story.append(Ornament(100))
    story.append(Spacer(1, 10))
    story.append(para('Предговор от автора', S['toc2']))
    toc = [
        ('ЧАСТ ПЪРВА · <i>Земята преди името</i>', [
            'I. Конявска планина и долината с форма на боб',
            'II. Траките: скалните ниши на Дуралинко',
            'III. Под сянката на Византия — връх Колош']),
        ('ЧАСТ ВТОРА · <i>Раждането на името</i>', [
            'IV. 987 година: царска кръв в Разметаница',
            'V. Османското мълчание и дефтерът от 1576',
            'VI. Бободол — етимология на едно име']),
        ('ЧАСТ ТРЕТА · <i>Зората на въглищата</i>', [
            'VII. Ами Буе — французинът и черното злато',
            'VIII. 1891: Първата мина',
            'IX. Теснолинейката от 1917 година']),
        ('ЧАСТ ЧЕТВЪРТА · <i>Възраждане</i>', [
            'X. Църквата „Свети Никола“ (1822)',
            'XI. Училище, читалище, кооперация',
            'XII. Войните и ехо от долината']),
        ('ЧАСТ ПЕТА · <i>Социалистическият град</i>', [
            'XIII. Октомври 1967: Село става град',
            'XIV. ТЕЦ „Бобов дол“ — 200-метровият комин',
            'XV. Никарагуанците и вавилонското време',
            'XVI. Квартал Миньор и 7 300 работници']),
        ('ЧАСТ ШЕСТА · <i>Падането</i>', [
            'XVII. 1989: Разграбените мини',
            'XVIII. Миграция — Италия, Испания, забравата',
            'XIX. Бобов дол днес']),
        ('ЧАСТ СЕДМА · <i>Осемнайсет огнища</i>', [
            'XX. Селата на общината']),
        ('ЧАСТ ОСМА · <i>Утре</i>', [
            'XXI. Какво дължим на Бобов дол',
            'XXII. Визия за Бобов дол']),
    ]
    for head, items in toc:
        story.append(para(head, S['toc1']))
        for it in items:
            story.append(para(it, S['toc2']))
    story.append(Spacer(1, 6))
    for it in ('Епилог', 'Бобов дол в числа', 'За автора',
               'Източници и признателност'):
        story.append(para(it, S['toc2']))
    return story


def build():
    os.makedirs('out', exist_ok=True)
    doc = BaseDocTemplate(
        'out/Bobov-dol-Hronika.pdf', pagesize=A5,
        title='Бобов дол — Хроника на един град',
        author='Стефан Л. Костадинов',
        subject='История на град Бобов дол — второ, коригирано издание',
    )
    inner_frame = Frame(48, 54, W - 96, H - 54 - 66, id='inner',
                        leftPadding=0, rightPadding=0, topPadding=4, bottomPadding=4)
    full_frame = Frame(0, 0, W, H, id='full')
    doc.addPageTemplates([
        PageTemplate(id='Cover', frames=[full_frame], onPage=cover_page),
        PageTemplate(id='Blank', frames=[full_frame], onPage=blank_decor),
        PageTemplate(id='Body', frames=[inner_frame], onPageEnd=inner_decor),
        PageTemplate(id='Back', frames=[full_frame], onPage=back_cover_page),
    ])

    story = []
    # 1. корица
    story.append(NextPageTemplate('Blank'))
    story.append(Spacer(1, 1))
    story.append(PageBreak())
    # 2. празна
    story.append(NextPageTemplate('Body'))
    story.append(Spacer(1, 1))
    story.append(PageBreak())
    # 3. авантитул (без колонтитул)
    story.append(NoHeader())
    story.append(Spacer(1, 170))
    story.append(para('БОБОВ ДОЛ', ParagraphStyle(
        'ht', parent=S['disp'], fontSize=25, leading=29)))
    story.append(Spacer(1, 4))
    story.append(Ornament(80))
    story.append(Spacer(1, 6))
    story.append(para('Хроника на един град', S['partsub']))
    story.append(PageBreak())
    # 4. импресум
    story.append(NoHeader())
    story.append(Spacer(1, 210))
    for ln in ('<i>Бобов дол — Хроника на един град</i>',
               'Второ издание — преработено и допълнено',
               '', 'Автор: <b>Стефан Любомиров Костадинов</b>',
               'Родом от Бобов дол', '',
               '© 2026, Carbon Stealth VCC', 'Всички права запазени.'):
        story.append(para(ln if ln else '&nbsp;', S['imprint']))
    story.append(Spacer(1, 14))
    story.append(para(
        'Тази книга е съставена въз основа на публично достъпни исторически '
        'източници, общински архиви, енциклопедични издания и устни предания '
        'от рода на автора. Фактите са проверени към пролетта на 2026 г. '
        'Илюстрациите, картите и декоративните елементи са оригинално '
        'създадени за това издание.', ParagraphStyle(
            'impn', parent=S['imprint'], fontSize=8.2, leading=11.4)))
    story.append(PageBreak())
    # 5. посвещение
    story.append(NoHeader())
    story.append(Spacer(1, 150))
    for ln in ('На Бобов дол —', '&nbsp;',
               'на дядо ми, когото не познавах;', 'взе го мината.', '&nbsp;',
               'На баба ми Василка —', 'четиридесет и две години',
               'главен счетоводител в рудник „Миньор“,',
               'която ми разказа всичко.', '&nbsp;',
               'На миньорите, които останаха,',
               'и на тези, които си тръгнаха —', 'но винаги се връщат у дома.'):
        story.append(para(ln, S['ded']))
    story.append(Spacer(1, 22))
    story.append(Ornament(60))
    story.append(PageBreak())
    # 6. епиграфи
    story.append(NoHeader())
    story.append(Spacer(1, 130))
    story.append(para('„Историята на Бобов дол е по-дълга и богата от тази на '
                      'сегашни областни центрове, унесени в себелюбието си.“', S['quote']))
    story.append(para('— „Ден Нюз“, 2010 г.', S['attrib']))
    story.append(Spacer(1, 22))
    story.append(para('„Ако сте от онези, които разказват вицове за миньорската '
                      'община, преди да се засмеете на поредната шега, прочетете '
                      'за славното минало на Бобовдолско.“', S['quote']))
    story.append(para('— писано преди 15 години; вярно и днес.', S['attrib']))
    # 7+. предговор
    blocks_to_flow(PREDGOVOR, story)
    # съдържание
    toc_flow(story)
    # герб
    story.append(PageBreak())
    story.append(Spacer(1, 8))
    story.append(para('Герб', S['parttag']))
    story.append(Spacer(1, 4))
    story.append(Illustration('gerb', 280, 300))
    story.append(para('Гербът на Бобов дол — полукръгъл щит с крепостната '
                      'корона на „Царичина“. Трите светкавици на червено поле '
                      'символизират електропроизводството; кръстосаните '
                      'чукове — минния труд; зъбното колело — ремонта на '
                      'машините; житният клас — земеделието.', S['caption']))
    # карта
    story.append(PageBreak())
    story.append(Spacer(1, 8))
    story.append(para('Карта на общината', S['parttag']))
    story.append(Spacer(1, 4))
    story.append(Illustration('map', 300, 300))
    story.append(para('Община Бобов дол обхваща 206,188 km² и включва 18 '
                      'населени места — града и 17 села. На запад се издига връх '
                      'Колош (1314 м); на изток — Гологлавският рид; в средата — '
                      'равнината Разметаница.', S['caption']))
    # части
    for part in (PART1, PART2, PART3, PART4, PART5, PART6, PART7, PART8):
        blocks_to_flow(part, story)
    # епилог
    blocks_to_flow(EPILOG, story)
    # времева линия
    story.append(PageBreak())
    story.append(NoHeader())
    story.append(Spacer(1, 2))
    story.append(Illustration('timeline', 300, 435))
    # приложение „Бобов дол в числа“, за автора, източници
    blocks_to_flow(CHISLA, story)
    blocks_to_flow(ZA_AVTORA, story)
    blocks_to_flow(IZTOCHNICI, story)
    # задна корица
    story.append(NextPageTemplate('Back'))
    story.append(PageBreak())
    story.append(Spacer(1, 1))

    doc.build(story)
    print('OK:', doc.page, 'страници → out/Bobov-dol-Hronika.pdf')


if __name__ == '__main__':
    build()
