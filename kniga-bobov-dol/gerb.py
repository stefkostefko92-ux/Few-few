# -*- coding: utf-8 -*-
"""Оригиналният герб на Бобов дол, пресъздаден векторно по официалното изображение.

Растерът-оригинал (gerb_src/Bobov.dol-coat-of-arms.png, Wikimedia Commons, 132 × 190 px, обществено
достояние) е твърде малък за печат. Затова: силуетът (корона + щит), полетата и светкавиците са
чиста геометрия, измерена пиксел по пиксел по оригинала; зъбното колело, дъгата, чуковете и
житният клас в долното поле са трасирани от растера (gerb_data.py, потрас); надписът
„БОБОВ ДОЛ“ е с шрифт (в оригинала е 5 px висок). Виж gerb_src/ за изходния файл и скрипта.
"""

import os

from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

import gerb_data as G

GOLD = colors.HexColor('#fdd000')
RED = colors.HexColor('#d90f14')
BLUE = colors.HexColor('#0a1e96')

_FONT = 'GerbSansBold'
pdfmetrics.registerFont(TTFont(_FONT, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                  'fonts', 'LiberationSans-Bold.ttf')))

W0, H0 = 132.0, 190.0
ASPECT = W0 / H0
CX = 66.5                       # ос на симетрия (в пиксели на оригинала)
KAPPA = 0.5523

# светкавица със стрела (средната от три еднакви), x: центрирана около CX
BOLT = [(61.9, 65.0), (69.8, 65.0), (66.2, 76.8), (76.6, 76.8), (77.0, 77.6), (70.6, 97.2),
        (74.8, 98.3), (74.8, 99.7), (70.4, 101.2), (65.5, 104.8), (62.1, 102.5), (60.4, 98.4),
        (63.6, 97.9), (64.9, 96.5), (67.7, 83.3), (55.4, 83.0)]
BOLT_DX = 24.5

# (x, y) на лявата половина на короната и щита, от центъра на горния зъбер надолу-наляво
_LEFT_PTS = [(53.4, 7.9), (51.6, 9.6), (51.6, 19.0), (45.0, 19.0), (45.0, 20.0), (41.0, 20.0),
             (40.0, 9.9), (9.8, 18.7), (10.2, 20.2), (17.9, 39.5)]


def _mirror(pt):
    return (2 * CX - pt[0], pt[1])


def _silhouette(c, X, Y):
    """Корона + щит: ляво → дясно по горния ръб, после надолу по дясната страна и дъгата."""
    p = c.beginPath()
    # горен ръб от центъра на средния зъбер наляво…
    left = _LEFT_PTS
    # …но пътят върви по часовниковата стрелка: започваме отляво-горе и обикаляме
    cw = list(reversed(left[1:]))                 # от тялото нагоре по лявата страна до средния зъбер
    p.moveTo(X(left[0][0]), Y(left[0][1]))
    # ляв ръб на щита, надолу към дъгата
    p.moveTo(X(left[-1][0]), Y(left[-1][1]))
    for pt in reversed(left[1:-1]):
        p.lineTo(X(pt[0]), Y(pt[1]))
    p.lineTo(X(left[0][0]), Y(left[0][1]))
    # горен край на средния зъбер и дясна страна (огледално)
    p.lineTo(X(2 * CX - left[0][0]), Y(left[0][1]))
    for pt in left[1:]:
        m = _mirror(pt)
        p.lineTo(X(m[0]), Y(m[1]))
    # дясна страна надолу до началото на дъгата
    ex, ey, a, b = CX, 133.5, 48.6, 46.7
    p.lineTo(X(ex + a), Y(ey))
    p.curveTo(X(ex + a), Y(ey + b * KAPPA), X(ex + a * KAPPA), Y(ey + b), X(ex), Y(ey + b))
    p.curveTo(X(ex - a * KAPPA), Y(ey + b), X(ex - a), Y(ey + b * KAPPA), X(ex - a), Y(ey))
    p.close()
    # бялата „дъга“ под короната — дупка (even-odd)
    lens = [(44.0, 39.0), (45.4, 38.1), (48.0, 37.4), (51.0, 37.0), (82.0, 37.0), (85.0, 37.4),
            (87.6, 38.1), (89.0, 39.0)]
    p.moveTo(X(lens[0][0]), Y(lens[0][1]))
    for pt in lens[1:]:
        p.lineTo(X(pt[0]), Y(pt[1]))
    p.close()
    return p


def _lower_field(c, X, Y):
    x0, x1, ytop = 22.0, 111.0, 112.5
    ex, ey, a, b = CX, 133.5, 44.5, 41.8
    p = c.beginPath()
    p.moveTo(X(x0), Y(ytop))
    p.lineTo(X(x1), Y(ytop))
    p.lineTo(X(x1), Y(ey))
    p.curveTo(X(ex + a), Y(ey + b * KAPPA), X(ex + a * KAPPA), Y(ey + b), X(ex), Y(ey + b))
    p.curveTo(X(ex - a * KAPPA), Y(ey + b), X(ex - a), Y(ey + b * KAPPA), X(x0), Y(ey))
    p.close()
    return p


def _rect(c, X, Y, x0, y0, x1, y1):
    p = c.beginPath()
    p.moveTo(X(x0), Y(y0)); p.lineTo(X(x1), Y(y0)); p.lineTo(X(x1), Y(y1)); p.lineTo(X(x0), Y(y1)); p.close()
    return p


def draw_gerb(c, x, y, height, outline=None):
    """Герб с долна лява точка (x, y) и зададена височина; ширината е height × ASPECT."""
    s = height / H0
    X = lambda u: x + u * s
    Y = lambda v: y + (H0 - v) * s
    c.saveState()
    # 1) злато: корона + щит (даже и по надпис/черта)
    sil = _silhouette(c, X, Y)
    c.setFillColor(GOLD)
    if outline is not None:
        c.setStrokeColor(outline)
        c.setLineWidth(max(0.2, height * 0.0035))
        c.drawPath(sil, fill=1, stroke=1, fillMode=0)
    else:
        c.drawPath(sil, fill=1, stroke=0, fillMode=0)
    # 2) лента и червено поле
    c.setFillColor(BLUE)
    c.drawPath(_rect(c, X, Y, 22.0, 43.8, 111.0, 56.2), fill=1, stroke=0)
    c.setFillColor(RED)
    c.drawPath(_rect(c, X, Y, 22.0, 61.0, 111.0, 108.0), fill=1, stroke=0)
    # 3) светкавиците (злато върху червеното)
    c.setFillColor(GOLD)
    for dx in (-BOLT_DX, 0.0, BOLT_DX):
        p = c.beginPath()
        p.moveTo(X(BOLT[0][0] + dx), Y(BOLT[0][1]))
        for q in BOLT[1:]:
            p.lineTo(X(q[0] + dx), Y(q[1]))
        p.close()
        c.drawPath(p, fill=1, stroke=0)
    # 4) долното поле: синьо, отгоре — златните орнаменти (клип по полето)
    field = _lower_field(c, X, Y)
    c.setFillColor(BLUE)
    c.drawPath(field, fill=1, stroke=0)
    c.saveState()
    c.clipPath(field, stroke=0, fill=0)
    gp = c.beginPath()
    for curve in G.ORNAMENTS:
        gp.moveTo(X(curve['start'][0]), Y(curve['start'][1]))
        for seg in curve['segs']:
            if seg[0] == 'L':
                gp.lineTo(X(seg[1]), Y(seg[2]))
            else:
                gp.curveTo(X(seg[1]), Y(seg[2]), X(seg[3]), Y(seg[4]), X(seg[5]), Y(seg[6]))
        gp.close()
    c.setFillColor(GOLD)
    c.drawPath(gp, fill=1, stroke=0, fillMode=0)
    c.restoreState()
    # 5) надписът „БОБОВ ДОЛ“ върху синята лента
    size = 11.2 * s
    text = 'БОБОВ ДОЛ'
    tw = pdfmetrics.stringWidth(text, _FONT, size)
    target = 79.0 * s
    c.setFillColor(GOLD)
    t = c.beginText()
    t.setFont(_FONT, size)
    t.setHorizScale(100.0 * target / tw)
    t.setTextOrigin(X(CX) - target / 2.0, Y(54.4))
    t.textOut(text)
    c.drawText(t)
    c.restoreState()
