# -*- coding: utf-8 -*-
"""Типография на книгата: шрифтове, стилове, хифенация, drop-cap, съдържание.

Шрифт: EB Garamond (SIL OFL 1.1), вложен във `fonts/`.
Хифенация: `pyphen` (bg_BG) — вмъква меки тирета; без pyphen текстът пак се
подрежда, само без пренасяне на думи.
"""

import os
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A5
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import registerFontFamily, stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Flowable, KeepTogether, Paragraph, Spacer, Table, TableStyle,
)
from reportlab.platypus.flowables import ParagraphAndImage
from reportlab.platypus.tableofcontents import TableOfContents

try:  # по желание: пакетът не е нужен за да тръгне билдът
    import pyphen
    _HYPH = pyphen.Pyphen(lang='bg_BG', left=2, right=3)
except Exception:  # pragma: no cover
    _HYPH = None

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = A5

# ── Цветове ────────────────────────────────────────────────────────────────
GOLD = colors.HexColor('#8a6d3b')
GOLD_L = colors.HexColor('#b99a5b')
DARKRED = colors.HexColor('#7b1f1f')
INK = colors.HexColor('#1c1a17')
INK2 = colors.HexColor('#4a3f2c')
PARCH = colors.HexColor('#efe6cf')
PARCH2 = colors.HexColor('#e6dabb')
BROWN = colors.HexColor('#4a3a22')
NIGHT1 = colors.HexColor('#0b1020')
NIGHT2 = colors.HexColor('#141c33')
MOUNT = colors.HexColor('#1a2440')
CREAM = colors.HexColor('#efe3b8')

# ── Шрифтове ───────────────────────────────────────────────────────────────
# ВАЖНО: вътрешните PostScript имена на файловете са уникални (виж fonts/README.md),
# иначе ReportLab слива теглата в едно.
_FD = os.path.join(HERE, 'fonts')
for _name, _file in (('Book', 'EBG-Regular.ttf'), ('Book-Medium', 'EBG-Medium.ttf'),
                     ('Book-Bold', 'EBG-Bold.ttf'), ('Book-Italic', 'EBG-Italic.ttf'),
                     ('Book-BoldItalic', 'EBG-BoldItalic.ttf')):
    pdfmetrics.registerFont(TTFont(_name, os.path.join(_FD, _file)))
registerFontFamily('Book', normal='Book', bold='Book-Bold',
                   italic='Book-Italic', boldItalic='Book-BoldItalic')

# ── Рамка на текстовия блок ────────────────────────────────────────────────
FRAME_X, FRAME_Y = 48, 56
FRAME_W, FRAME_H = W - 96, H - 56 - 68
FRAME_PAD = 4
FRAME_TOP = FRAME_Y + FRAME_H - FRAME_PAD
FRAME_BOTTOM = FRAME_Y + FRAME_PAD


# ── Стилове ────────────────────────────────────────────────────────────────
def make_styles(k=1.0):
    """Всички стилове; `k` леко мащабира междуредието и разстоянията (подгонване)."""
    L = 14.7 * k
    s = {'k': k}
    s['body'] = ParagraphStyle(
        'body', fontName='Book', fontSize=10.6, leading=L, alignment=TA_JUSTIFY,
        firstLineIndent=13, spaceAfter=0, textColor=INK, allowWidows=0,
        allowOrphans=0)
    s['flush'] = ParagraphStyle('flush', parent=s['body'], firstLineIndent=0)
    s['lead'] = ParagraphStyle('lead', parent=s['body'], firstLineIndent=0)
    s['h2'] = ParagraphStyle(
        'h2', fontName='Book-Bold', fontSize=11.6, leading=15 * k, spaceBefore=11 * k,
        spaceAfter=4 * k, textColor=INK, alignment=TA_LEFT)
    s['quote'] = ParagraphStyle(
        'quote', fontName='Book-Italic', fontSize=10.6, leading=14.4 * k, leftIndent=14,
        rightIndent=8, spaceBefore=5 * k, spaceAfter=1, alignment=TA_LEFT, textColor=INK,
        allowWidows=0)
    s['attrib'] = ParagraphStyle(
        'attrib', fontName='Book-Italic', fontSize=9.2, leading=12 * k, alignment=TA_RIGHT,
        rightIndent=8, spaceAfter=7 * k, textColor=INK2)
    s['caption'] = ParagraphStyle(
        'caption', fontName='Book-Italic', fontSize=9, leading=11.8, alignment=TA_CENTER,
        spaceBefore=5, spaceAfter=0, leftIndent=6, rightIndent=6,
        textColor=colors.HexColor('#4a4a44'), allowWidows=0)
    s['credit'] = ParagraphStyle(
        'credit', fontName='Book', fontSize=7.8, leading=10, alignment=TA_CENTER,
        spaceBefore=1.5, spaceAfter=8 * k, textColor=GOLD)
    s['partsub'] = ParagraphStyle(
        'partsub', fontName='Book-Italic', fontSize=12, leading=15, alignment=TA_CENTER,
        textColor=INK2, spaceAfter=12)
    s['parttitle'] = ParagraphStyle(
        'parttitle', fontName='Book-Medium', fontSize=25, leading=29, alignment=TA_CENTER,
        textColor=INK, spaceAfter=5)
    s['roman'] = ParagraphStyle(
        'roman', fontName='Book', fontSize=50, leading=54, alignment=TA_CENTER,
        textColor=DARKRED, spaceAfter=4, spaceBefore=2)
    s['chtitle'] = ParagraphStyle(
        'chtitle', fontName='Book-Medium', fontSize=21, leading=25, alignment=TA_CENTER,
        textColor=INK, spaceAfter=4)
    s['chsub'] = ParagraphStyle(
        'chsub', fontName='Book-Italic', fontSize=11.4, leading=14.5, alignment=TA_CENTER,
        textColor=INK2, spaceAfter=10)
    s['disp'] = ParagraphStyle(
        'disp', fontName='Book-Medium', fontSize=24, leading=28, alignment=TA_CENTER,
        textColor=INK, spaceAfter=4)
    s['bigword'] = ParagraphStyle(
        'bigword', fontName='Book-Medium', fontSize=21, leading=26, alignment=TA_CENTER,
        spaceBefore=8, spaceAfter=8, textColor=INK)
    s['sign'] = ParagraphStyle(
        'sign', fontName='Book-Italic', fontSize=10.4, leading=14.4, alignment=TA_RIGHT,
        rightIndent=8, spaceBefore=10, textColor=INK)
    s['src'] = ParagraphStyle(
        'src', fontName='Book', fontSize=9.6, leading=12.9 * k, leftIndent=12,
        firstLineIndent=-8, spaceAfter=3.2 * k, textColor=INK, allowWidows=0)
    s['finis'] = ParagraphStyle(
        'finis', fontName='Book-Italic', fontSize=13, alignment=TA_CENTER, spaceBefore=16,
        textColor=GOLD)
    s['ded'] = ParagraphStyle(
        'ded', fontName='Book-Italic', fontSize=11.4, leading=17, alignment=TA_CENTER,
        textColor=INK)
    s['motto'] = ParagraphStyle(
        'motto', fontName='Book-Italic', fontSize=11, leading=15, alignment=TA_CENTER,
        spaceBefore=26, leftIndent=26, rightIndent=26, textColor=INK)
    s['motto_attr'] = ParagraphStyle(
        'motto_attr', fontName='Book', fontSize=8.8, alignment=TA_CENTER, spaceBefore=4,
        textColor=GOLD)
    s['imprint'] = ParagraphStyle(
        'imprint', fontName='Book', fontSize=9.6, leading=13.4, textColor=INK, spaceAfter=3)
    s['kvl'] = ParagraphStyle(
        'kvl', fontName='Book-BoldItalic', fontSize=9.4, leading=12, textColor=INK)
    s['kvv'] = ParagraphStyle(
        'kvv', fontName='Book', fontSize=9.6, leading=12, textColor=INK)
    # съдържание
    s['toc0'] = ParagraphStyle(
        'toc0', fontName='Book-Bold', fontSize=10, leading=13.4, spaceBefore=9,
        textColor=INK)
    s['toc1'] = ParagraphStyle(
        'toc1', fontName='Book', fontSize=10, leading=13.4, leftIndent=14, textColor=INK)
    return s


# ── Помощни за текста ──────────────────────────────────────────────────────
_TOKEN = re.compile(r'(<[^>]+>|&[A-Za-z#0-9]+;)')
_HWORD = re.compile(r'[а-яА-ЯёЁa-zA-Z]{7,}')
_ONE_LETTER = re.compile(r'(?<![\w\xad])([вВсСиИаАоОуУкК]) (?=\S)')
_UNIT = re.compile(
    r'(?<=\d) (?=(?:г\b|км|м\b|м²|м³|km|MW|MWh|т\b|тона|тонове|души|домакинства|'
    r'декара|хектара|%|акчета|лева|евро|години|годишно|kcal|мм|mm|сл\.|пр\.))')
_THOUSANDS = re.compile(r'(?<=\d) (?=\d{3}(?!\d))')


def _plain_map(text, fn):
    parts = _TOKEN.split(text)
    for i in range(0, len(parts), 2):
        parts[i] = fn(parts[i])
    return ''.join(parts)


def _hyphenate_word(m):
    w = m.group(0)
    if w.isupper():  # ЗАГЛАВНИ думи не се пренасят
        return w
    return _HYPH.inserted(w, hyphen='\xad')


def prepare(text, hyphenate=True):
    """Типографска подготовка: nbsp, хифенация, ² и ³ от прав шрифт."""
    # EB Garamond Italic няма ² и ³ → винаги от прав шрифт (иначе остава празно квадратче)
    text = text.replace('²', '<font name="Book">²</font>').replace('³', '<font name="Book">³</font>')

    def fn(t):
        t = _UNIT.sub('\xa0', t)
        t = _THOUSANDS.sub('\xa0', t)
        t = _ONE_LETTER.sub('\\1\xa0', t)
        if hyphenate and _HYPH:
            t = _HWORD.sub(_hyphenate_word, t)
        return t
    return _plain_map(text, fn)


REVIEW = {'on': False}


def draft_markup(text):
    """<draft>…</draft> = чернова на ИИ от името на автора → маркира се при --review."""
    if REVIEW['on']:
        return (text.replace('<draft>', '<font backColor="#fff0a0">')
                .replace('</draft>', '</font>'))
    return text.replace('<draft>', '').replace('</draft>', '')


def para(txt, style, hyphenate=True):
    return Paragraph(prepare(draft_markup(txt), hyphenate), style)


def plain(txt):
    return re.sub(r'<[^>]+>', '', txt).replace('&nbsp;', ' ')


# ── Орнамент ───────────────────────────────────────────────────────────────
class Ornament(Flowable):
    """Тънка линия с ромб и две точки в средата, избледняваща към краищата."""

    def __init__(self, width=120, space=8, color=GOLD):
        super().__init__()
        self.w, self.sp, self.color = width, space, color
        self.width, self.height = width, space * 2

    def wrap(self, aw, ah):
        self._aw = aw
        return aw, self.height

    def draw(self):
        c = self.canv
        cx, cy = self._aw / 2.0, self.height / 2.0
        c.saveState()
        c.setStrokeColor(self.color)
        c.setFillColor(self.color)
        gap = 9
        steps = 14
        for side in (-1, 1):
            for i in range(steps):
                a = 1.0 - i / float(steps)
                x0 = cx + side * (gap + (self.w / 2.0 - gap) * i / steps)
                x1 = cx + side * (gap + (self.w / 2.0 - gap) * (i + 1) / steps)
                c.setStrokeAlpha(max(0.12, a))
                c.setLineWidth(0.7)
                c.line(x0, cy, x1, cy)
        c.setStrokeAlpha(1)
        d = 2.8
        p = c.beginPath()
        p.moveTo(cx, cy - d)
        p.lineTo(cx + d, cy)
        p.lineTo(cx, cy + d)
        p.lineTo(cx - d, cy)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
        c.circle(cx - 6.5, cy, 0.9, fill=1, stroke=0)
        c.circle(cx + 6.5, cy, 0.9, fill=1, stroke=0)
        c.restoreState()


class Tracked(Flowable):
    """Центриран текст с разредка (малки/главни букви) — за „ГЛАВА“, „ЧАСТ“ и пр."""

    def __init__(self, text, font='Book-Medium', size=9, color=GOLD, tracking=3.0,
                 before=0, after=0):
        super().__init__()
        self.text, self.font, self.size = text, font, size
        self.color, self.tracking = color, tracking
        self.before, self.after = before, after

    def wrap(self, aw, ah):
        self._aw = aw
        self.height = self.size * 1.25 + self.before + self.after
        return aw, self.height

    def draw(self):
        c = self.canv
        tw = stringWidth(self.text, self.font, self.size) + self.tracking * (len(self.text) - 1)
        c.saveState()           # Tc (разредка) се пази в графичното състояние
        t = c.beginText((self._aw - tw) / 2.0, self.after + self.size * 0.28)
        t.setFont(self.font, self.size)
        t.setFillColor(self.color)
        t.setCharSpace(self.tracking)
        t.textOut(self.text)
        c.drawText(t)
        c.restoreState()


def draw_tracked(canvas, x, y, text, font, size, tracking, color, align='center'):
    tw = stringWidth(text, font, size) + tracking * (len(text) - 1)
    if align == 'center':
        x = x - tw / 2.0
    elif align == 'right':
        x = x - tw
    canvas.saveState()          # Tc (разредка) се пази в графичното състояние
    t = canvas.beginText(x, y)
    t.setFont(font, size)
    t.setFillColor(color)
    t.setCharSpace(tracking)
    t.textOut(text)
    canvas.drawText(t)
    canvas.restoreState()


# ── Drop-cap ───────────────────────────────────────────────────────────────
class _Cap(Flowable):
    def __init__(self, ch, font, size, color, height, baseline):
        super().__init__()
        self.ch, self.font, self.size, self.color = ch, font, size, color
        self.cw = stringWidth(ch, font, size) + 2
        self.ch_h, self.base = height, baseline

    def wrap(self, aw, ah):
        return self.cw, self.ch_h

    def draw(self):
        c = self.canv
        c.setFillColor(self.color)
        c.setFont(self.font, self.size)
        c.drawString(0, self.base, self.ch)


def lead_paragraph(text, st):
    """Първи абзац на глава.

    ≥ 200 знака  → drop-cap през 3 реда, обвит от текста;
    130–199      → drop-cap през 2 реда;
    по-кратък    → центриран курсивен ред (без голяма буква — не се побира).
    """
    t = prepare(draft_markup(text))
    n = len(plain(text))
    body = st['lead']
    if not t[0].isalpha() or n < 130:
        return Paragraph(t, typo_short_lead(st))
    lines = 3 if n >= 200 else 2
    L = body.leading
    font = 'Book-Medium'
    capH = pdfmetrics.getFont(font).face.capHeight / 1000.0
    body_cap = pdfmetrics.getFont('Book').face.capHeight / 1000.0 * body.fontSize
    size = ((lines - 1) * L + body_cap) / capH
    h_i = lines * L - 1.5
    base = h_i - (body.fontSize + (lines - 1) * L)
    first, rest = t[0], t[1:]
    cap = _Cap(first.upper() if first.islower() else first, font, size, DARKRED, h_i, base)
    return ParagraphAndImage(Paragraph(rest, body), cap, xpad=3.5, ypad=0, side='left')


def typo_short_lead(st):
    return ParagraphStyle('shortlead', parent=st['lead'], fontName='Book-Italic', fontSize=12,
                          leading=17, alignment=TA_CENTER, textColor=INK2, spaceAfter=8,
                          leftIndent=14, rightIndent=14)


# ── Бележки за съдържание и контури ───────────────────────────────────────
class TocMark(Flowable):
    """Невидим маркер: записва ред в съдържанието + контур (bookmark) на PDF-а."""

    def __init__(self, level, text, short=None, header=True, toc=True):
        super().__init__()
        self.level, self.text, self.short = level, text, short or plain(text)
        self.header, self.toc = header, toc

    def wrap(self, aw, ah):
        return 0, 0

    def draw(self):
        pass


class NoHeader(Flowable):
    def wrap(self, aw, ah):
        return 0, 0

    def draw(self):
        self.canv._noheader = True


class NoFolio(Flowable):
    def wrap(self, aw, ah):
        return 0, 0

    def draw(self):
        self.canv._nofolio = True


class EndMarker(Flowable):
    """Измерва докъде е стигнал текстът на последната страница (за подгонването)."""

    def __init__(self):
        super().__init__()
        self.fill = None

    def wrap(self, aw, ah):
        return 0, 0

    def draw(self):
        y = self.canv.absolutePosition(0, 0)[1]
        self.fill = (FRAME_TOP - y) / float(FRAME_TOP - FRAME_BOTTOM)


class BookDoc(BaseDocTemplate):
    """Документ с автоматично съдържание, контури и бягащ колонтитул по глава."""

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self._tocn = 0
        self.chapter_title = ''
        self._bucket = 0

    def beforeDocument(self):
        # всеки проход на multiBuild започва от нула — иначе ключовете на отметките
        # се менят и съдържанието никога не се „стабилизира“
        self._tocn = 0
        self.chapter_title = ''
        self._bucket = 0

    def afterFlowable(self, f):
        if isinstance(f, TocMark):
            key = 'toc%d' % self._tocn
            self._tocn += 1
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(f.short, key, f.level, closed=0)
            if f.toc:
                if f.level == 0 and f.short.startswith('Част пета'):
                    self._bucket = 1            # втората страница на съдържанието
                self.notify('TOCEntry2' if self._bucket else 'TOCEntry',
                            (f.level, f.text, self.page, key))
            if f.header:
                self.chapter_title = f.short


class TableOfContents2(TableOfContents):
    """Втора половина на съдържанието — слуша за „TOCEntry2“."""

    def notify(self, kind, stuff):
        if kind == 'TOCEntry2':
            self.addEntry(*stuff)


def make_toc(st, second=False):
    toc = (TableOfContents2 if second else TableOfContents)()
    toc.levelStyles = [st['toc0'], st['toc1']]
    toc.dotsMinLevel = 0
    toc.rightColumnWidth = 24
    toc.tableStyle = TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0.8), ('BOTTOMPADDING', (0, 0), (-1, -1), 0.8)])
    return toc


# ── Таблица „ключ — стойност“ ──────────────────────────────────────────────
def kv_table(rows, st):
    pad = 3.1 * st['k'] ** 4        # при по-стегнато подгонване и таблицата се стяга
    data = [[Paragraph(prepare(draft_markup(k)) + ':', st['kvl']),
             Paragraph(prepare(draft_markup(v)), st['kvv'])] for k, v in rows]
    t = Table(data, colWidths=[116, FRAME_W - 116])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), pad),
        ('BOTTOMPADDING', (0, 0), (-1, -1), pad),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, 0), (-1, -2), 0.35, colors.HexColor('#cbbb92')),
        ('LINEABOVE', (0, 0), (-1, 0), 0.9, GOLD),
        ('LINEBELOW', (0, -1), (-1, -1), 0.9, GOLD),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f7f1e1')),
    ]))
    return t
