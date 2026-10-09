# -*- coding: utf-8 -*-
"""Генератор на книгата „Бобов дол — Хроника на един град“ (второ, коригирано издание).

Пуска се с:   python3 build_book.py            # чисто издание + екземпляр за проверка
              python3 build_book.py --clean    # само чистото издание
Резултат:     out/Bobov-dol-Hronika.pdf               — чисто (за четене/печат)
              out/Bobov-dol-Hronika-ZA-PROVERKA.pdf    — със жълто маркирани места,
                                                          които авторът трябва да потвърди

Нужни пакети: reportlab, pillow; по желание pyphen (хифенация), pypdfium2 (само за проверки).
"""

import io
import os
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A5
from reportlab.platypus import (
    BaseDocTemplate, CondPageBreak, Frame, KeepTogether, NextPageTemplate, PageBreak,
    PageTemplate, Paragraph, Spacer,
)

import typo
from typo import (
    W, H, GOLD, FRAME_X, FRAME_Y, FRAME_W, FRAME_H, FRAME_PAD,
    Ornament, Tracked, TocMark, NoHeader, NoFolio, EndMarker, BookDoc, make_styles,
    make_toc, kv_table, lead_paragraph, para, plain, draw_tracked,
)
from art import Illustration, Photo, PHOTO_CREDITS, cover_page, back_cover_page
from content_a import PREDGOVOR, PART1, PART2, PART3
from content_b import PART4, PART5, PART6
from content_c import PART7, PART8, EPILOG, CHISLA, ZA_AVTORA, IZTOCHNICI

BOOK_HDR = 'БОБОВ ДОЛ · ХРОНИКА НА ЕДИН ГРАД'
OUT = 'out'


# ── Колонтитули и рамка ────────────────────────────────────────────────────

def inner_decor(canvas, doc):
    pg = canvas.getPageNumber()
    noheader = getattr(canvas, '_noheader', False)
    nofolio = getattr(canvas, '_nofolio', False)
    canvas._noheader = canvas._nofolio = False
    canvas.saveState()
    # двойна рамка
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(0.8)
    x0, y0, x1, y1 = 38, 46, W - 38, H - 62
    canvas.rect(x0, y0, x1 - x0, y1 - y0)
    canvas.setLineWidth(0.25)
    canvas.rect(x0 + 3.2, y0 + 3.2, x1 - x0 - 6.4, y1 - y0 - 6.4)
    canvas.setFillColor(GOLD)
    d = 2.4
    for (cx, cy) in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
        p = canvas.beginPath()
        p.moveTo(cx, cy - d); p.lineTo(cx + d, cy); p.lineTo(cx, cy + d); p.lineTo(cx - d, cy)
        p.close()
        canvas.drawPath(p, fill=1, stroke=0)
    # колонтитул: четни страници — заглавие на книгата; нечетни — текущата глава
    if not noheader:
        hdr = (doc.chapter_title or BOOK_HDR) if pg % 2 == 1 else BOOK_HDR
        draw_tracked(canvas, W / 2, H - 41, hdr.upper(), 'Book-Italic', 7.4, 1.1,
                     colors.HexColor('#5a4a2a'))
        canvas.setStrokeColor(GOLD)
        canvas.setLineWidth(0.5)
        canvas.line(W / 2 - 74, H - 47, W / 2 - 8, H - 47)
        canvas.line(W / 2 + 8, H - 47, W / 2 + 74, H - 47)
        canvas.setFillColor(GOLD)
        p = canvas.beginPath()
        p.moveTo(W / 2, H - 47 - 2.2); p.lineTo(W / 2 + 2.2, H - 47)
        p.lineTo(W / 2, H - 47 + 2.2); p.lineTo(W / 2 - 2.2, H - 47)
        p.close()
        canvas.drawPath(p, fill=1, stroke=0)
    if not nofolio:
        canvas.setFont('Book-Italic', 9)
        canvas.setFillColor(colors.HexColor('#5a4a2a'))
        canvas.drawCentredString(W / 2, 29, str(pg))
    canvas.restoreState()


def blank_decor(canvas, doc):
    pass


# ── Преобразуване на блоковете в елементи ──────────────────────────────────
STARTERS = ('part', 'chapter', 'display_title')
PHOTO_W = 300
ILLUS = {'etymology': (300, 168), 'defter': (300, 214), 'mine_section': (300, 200)}
NO_INDENT_AFTER = {'h2', 'kv', 'img', 'photo', 'caption', 'quote', 'bigword', 'motto',
                   'part', 'chapter', 'display_title', 'sign'}


def flows_for(blocks, st):
    """Блокове → списък от елементи. Първият абзац след заглавие е без отстъп."""
    out = []
    prev = None
    skip = False
    for i, b in enumerate(blocks):
        if skip:
            skip = False
            continue
        kind = b[0]
        if kind == 'part':
            _, tag, title, sub = b
            out += [PageBreak(), NoHeader(), NoFolio(),
                    TocMark(0, '<b>%s</b> — <i>%s</i>' % (tag, title), short='%s — %s' % (tag, title)),
                    Spacer(1, 138),
                    Tracked(tag.upper(), 'Book-Medium', 9.2, GOLD, 4.2, after=8),
                    Ornament(120), Spacer(1, 8),
                    para(title, st['parttitle'], hyphenate=False),
                    para(sub, st['partsub'], hyphenate=False),
                    Ornament(120)]
        elif kind == 'chapter':
            _, rn, title, sub = b
            out += [PageBreak(), NoHeader(),
                    TocMark(1, '%s.&nbsp;&nbsp;%s' % (rn, title), short='%s. %s' % (rn, title)),
                    Spacer(1, 30), Ornament(92),
                    Tracked('ГЛАВА', 'Book-Medium', 9.2, GOLD, 4.6, before=4, after=1),
                    para(rn, st['roman'], hyphenate=False),
                    para(title, st['chtitle'], hyphenate=False)]
            if sub:
                out.append(para(sub, st['chsub'], hyphenate=False))
            out += [Ornament(92), Spacer(1, 12)]
        elif kind == 'display_title':
            _, title, sub = b
            out += [PageBreak(), TocMark(0, title, short=title), Spacer(1, 18),
                    para(title, st['disp'], hyphenate=False)]
            if sub:
                out.append(para(sub, st['chsub'], hyphenate=False))
            out += [Ornament(104), Spacer(1, 12)]
        elif kind == 'lead':
            out.append(lead_paragraph(b[1], st))
        elif kind == 'p':
            style = st['flush'] if prev in NO_INDENT_AFTER else st['body']
            out.append(para(b[1], style))
        elif kind == 'h2':
            # подзаглавие + поне 2 реда след него; следващият абзац може да се разцепи
            out += [CondPageBreak(60), para(b[1], st['h2'], hyphenate=False)]
        elif kind == 'quote':
            out.append(KeepTogether([para(b[1], st['quote']), para(b[2], st['attrib'])]))
        elif kind == 'kv':
            out.append(KeepTogether([Spacer(1, 5), kv_table(b[1], st), Spacer(1, 8)]))
        elif kind == 'img':
            name = b[1]
            iw, ih = ILLUS.get(name, (300, 180))
            group = [Spacer(1, 6), Illustration(name, iw, ih)]
            if i + 1 < len(blocks) and blocks[i + 1][0] == 'caption':
                group += [para(blocks[i + 1][1], st['caption']), Spacer(1, 8)]
                skip = True
            out.append(KeepTogether(group))
        elif kind == 'photo':
            fn = b[1]
            width = b[2] if len(b) > 2 and isinstance(b[2], (int, float)) else PHOTO_W
            group = [Spacer(1, 6), Photo(fn, width)]
            if i + 1 < len(blocks) and blocks[i + 1][0] == 'caption':
                group.append(para(blocks[i + 1][1], st['caption']))
                skip = True
            credit = PHOTO_CREDITS.get(fn)
            if credit:
                group.append(Paragraph(credit, st['credit']))
            out.append(KeepTogether(group))
        elif kind == 'caption':
            out.append(para(b[1], st['caption']))
        elif kind == 'bigword':
            out.append(para(b[1], st['bigword'], hyphenate=False))
        elif kind == 'sign':
            sig = para(b[1] + '<br/>' + b[2], st['sign'], hyphenate=False)
            last = out.pop() if out else None
            out.append(KeepTogether([last, sig] if last is not None else [sig]))
        elif kind == 'src':
            out.append(para('•&nbsp;' + b[1], st['src']))
        elif kind == 'motto':
            out += [para(b[1], st['motto'], hyphenate=False),
                    para(b[2], st['motto_attr'], hyphenate=False)]
        elif kind == 'finis':
            last = out.pop() if out else None
            grp = [Spacer(1, 10), Ornament(124), para(b[1], st['finis'], hyphenate=False),
                   Spacer(1, 4), Ornament(124)]
            out.append(KeepTogether(([last] if last is not None else []) + grp))
        elif kind == 'vspace':
            out.append(Spacer(1, b[1]))
        prev = kind
    return out


def split_units(blocks):
    units, cur = [], []
    for b in blocks:
        if b[0] in STARTERS and cur:
            units.append(cur)
            cur = []
        cur.append(b)
    if cur:
        units.append(cur)
    return units


def unit_name(blocks):
    b = blocks[0]
    if b[0] == 'part':
        return b[1]
    if b[0] == 'chapter':
        return 'Гл. %s' % b[1]
    if b[0] == 'display_title':
        return b[1]
    return '%s: %s' % (b[0], plain(str(b[1]))[:30])


# ── Подгонване на страниците ───────────────────────────────────────────────
# За всяка глава се търси най-добрата подредба: къде да застане илюстрацията/снимката
# (ако не се побира, остава бяло поле) и колко да е междуредието (±3 %), така че
# страниците да са плътни, а последната страница на главата да не е „сирак“.
CANDS = [1.0, 0.985, 1.015, 0.97, 1.03]
CANDS_WIDE = [0.955, 1.045, 0.94]
GOOD_FILL = 0.14   # последната страница: ≥ ~6 реда
FULL_PAGE = 0.86   # страница, приключила по-рано, се смята за „дупка“
FLOAT_STOP = ('part', 'chapter', 'display_title', 'img', 'photo', 'kv')


def measure(blocks, k):
    st = make_styles(k)
    flows = flows_for(blocks, st)
    while flows and isinstance(flows[0], PageBreak):
        flows.pop(0)
    mk = EndMarker()
    fills = []

    def on_end(canv, doc_):
        fills.append((typo.FRAME_TOP - doc_.frame._y) / float(typo.FRAME_TOP - typo.FRAME_BOTTOM))

    doc = BaseDocTemplate(io.BytesIO(), pagesize=A5)
    doc.addPageTemplates([PageTemplate(id='B', onPageEnd=on_end, frames=[Frame(
        FRAME_X, FRAME_Y, FRAME_W, FRAME_H, leftPadding=0, rightPadding=0,
        topPadding=FRAME_PAD, bottomPadding=FRAME_PAD)])])
    doc.build(flows + [mk])
    last = mk.fill if mk.fill is not None else 1.0
    return doc.page, last, fills[:-1]


def score(pages, last, gaps, k, shifts):
    s = sum((FULL_PAGE - g) * 3.0 for g in gaps if g < FULL_PAGE)
    if pages > 1 and last < GOOD_FILL:
        s += (GOOD_FILL - last) * 4
    return s + abs(k - 1.0) * 4 + shifts * 0.02


def move_group(blocks, i, shift):
    """Мести илюстрацията/снимката (с подписа) на `shift` абзаца: >0 напред, <0 назад."""
    n = 2 if i + 1 < len(blocks) and blocks[i + 1][0] == 'caption' else 1
    grp, rest = blocks[i:i + n], blocks[:i] + blocks[i + n:]
    pos, cnt = i, 0
    if shift > 0:
        while pos < len(rest) and cnt < shift:
            if rest[pos][0] in FLOAT_STOP:
                break
            if rest[pos][0] in ('p', 'lead'):
                cnt += 1
            pos += 1
    else:
        while pos > 0 and cnt < -shift:
            if rest[pos - 1][0] in FLOAT_STOP or rest[pos - 1][0] == 'lead':
                break
            pos -= 1
            if rest[pos][0] == 'p':
                cnt += 1
    return rest[:pos] + grp + rest[pos:]


def tune(blocks, log):
    """→ (подредени блокове, k): най-ниска оценка от търсенето."""
    name = unit_name(blocks)
    if blocks[0][0] == 'part':
        return blocks, 1.0
    best = {'score': None}

    def ev(bl, k, cost):
        pages, last, gaps = measure(bl, k)
        sc = score(pages, last, gaps, k, 0) + cost
        if best['score'] is None or sc < best['score']:
            best.update(score=sc, blocks=bl, k=k, info=(pages, last, gaps))
        return sc

    ev(blocks, 1.0, 0)
    if best['score'] > 0.05:
        for g in [b for b in blocks if b[0] in ('img', 'photo')]:
            cur = best['blocks']
            if g not in cur:
                continue
            i = cur.index(g)
            for sh in (-3, -2, -1, 1, 2, 3, 4, 5, 6):
                ev(move_group(cur, i, sh), 1.0, abs(sh) * 0.02)
            if g[0] == 'photo' and best['score'] > 0.05:
                cur = best['blocks']
                gi = next((x for x, b in enumerate(cur) if b[0] == 'photo' and b[1] == g[1]), None)
                if gi is not None:
                    for w in (270, 240, 210):
                        cand = list(cur)
                        cand[gi] = ('photo', g[1], w)
                        ev(cand, 1.0, (PHOTO_W - w) / 300.0 * 0.5)
    if best['score'] > 0.05:
        for k in CANDS[1:]:
            ev(best['blocks'], k, 0)
    if best['score'] > 0.09:          # още не е добре → по-широк диапазон (рядко)
        for k in CANDS_WIDE:
            ev(best['blocks'], k, 0)
    pages, last, gaps = best['info']
    holes = sum(1 for g in gaps if g < FULL_PAGE)
    log('  %-26s k=%.3f стр.=%d  последна=%3.0f%%  дупки=%d  оценка=%.2f' %
        (name, best['k'], pages, last * 100, holes, best['score']))
    return best['blocks'], best['k']


# ── Начални страници ───────────────────────────────────────────────────────

def front_matter(st):
    s = []
    s += [NextPageTemplate('Blank'), Spacer(1, 1), PageBreak()]           # 1. корица
    s += [NextPageTemplate('Body'), Spacer(1, 1), PageBreak()]            # 2. празна
    # 3. авантитул
    s += [NoHeader(), NoFolio(), Spacer(1, 176),
          para('БОБОВ ДОЛ', typo.ParagraphStyle('ht', parent=st['disp'], fontSize=29, leading=33),
               hyphenate=False),
          Spacer(1, 4), Ornament(86), Spacer(1, 6),
          para('Хроника на един град', st['partsub'], hyphenate=False), PageBreak()]
    # 4. импресум
    small = typo.ParagraphStyle('impn', parent=st['imprint'], fontSize=8.8, leading=12.2)
    s += [NoHeader(), NoFolio(), Spacer(1, 188)]
    for ln in ('<i>Бобов дол — Хроника на един град</i>',
               'Второ издание — преработено и допълнено', '',
               'Автор: <b>Стефан Любомиров Костадинов</b>', 'Родом от Бобов дол', '',
               '© 2026, Carbon Stealth VCC', 'Всички права запазени.'):
        s.append(para(ln if ln else '&nbsp;', st['imprint'], hyphenate=False))
    s += [Spacer(1, 12),
          para('Тази книга е съставена въз основа на публично достъпни исторически '
               'източници, общински архиви, енциклопедични издания и устни предания от '
               'рода на автора. Фактите са проверени към пролетта на 2026 г. '
               'Фотографиите са от Уикимедия Общомедия и се използват по свободните си '
               'лицензи (виж „Източници и признателност“); картата е по данни на '
               'OpenStreetMap (© участници в OpenStreetMap, ODbL); гербът е пресъздаден '
               'по официалното описание на Община Бобов дол; схемите и украсите са '
               'изработени за това издание. Шрифт: EB&nbsp;Garamond (SIL OFL).', small),
          PageBreak()]
    # 5. посвещение
    s += [NoHeader(), NoFolio(), Spacer(1, 150)]
    for ln in ('На Бобов дол —', '&nbsp;', 'на дядо ми, когото не познавах;', 'взе го мината.',
               '&nbsp;', 'На баба ми Василка —', 'четиридесет и две години',
               'главен счетоводител в рудник „Миньор“,', 'която ми разказа всичко.', '&nbsp;',
               'На миньорите, които останаха,', 'и на тези, които си тръгнаха —',
               'но винаги се връщат у дома.'):
        s.append(para(ln, st['ded'], hyphenate=False))
    s += [Spacer(1, 22), Ornament(64), PageBreak()]
    # 6. епиграф
    s += [NoHeader(), NoFolio(), Spacer(1, 190),
          para('„Историята на Бобов дол е по-дълга и богата от тази на сегашни областни '
               'центрове, унесени в себелюбието си.“', st['quote']),
          para('— „Ден Нюз“, 2010 г.', st['attrib'])]
    return s


def toc_pages(st):
    return [PageBreak(), NoHeader(), NoFolio(),
            TocMark(0, 'Съдържание', short='Съдържание', header=False, toc=False),
            Spacer(1, 14), para('Съдържание', st['disp'], hyphenate=False), Ornament(104),
            Spacer(1, 8), make_toc(st),
            PageBreak(), NoHeader(), NoFolio(), Spacer(1, 6), make_toc(st, second=True)]


def plate(title, ill, iw, ih, caption, st, extra_top=0):
    """Страница-табло: (заглавие), илюстрация и (подпис), вертикално по средата."""
    cap = [para(caption, st['caption'])] if caption else []
    block_h = (22 if title else 0) + ih + (6 + 48 if caption else 0)
    top = max(0, (FRAME_H - block_h) / 2.0 - 14 + extra_top)
    out = [PageBreak(), NoHeader(), Spacer(1, top)]
    if title:
        out.append(Tracked(title.upper(), 'Book-Medium', 9.2, GOLD, 4.0, after=10))
    out.append(Illustration(ill, iw, ih))
    return out + cap


# ── Сглобяване ────────────────────────────────────────────────────────────

def book_units():
    parts = [PREDGOVOR, PART1, PART2, PART3, PART4, PART5, PART6, PART7, PART8]
    units = []
    for p in parts:
        units += split_units(p)
    return units


def tail_units():
    out = []
    for p in (EPILOG,):
        out += split_units(p)
    return out


def build(review=False, ks=None, pad_blank=False, log=print):
    typo.REVIEW['on'] = review
    name = 'Bobov-dol-Hronika-ZA-PROVERKA.pdf' if review else 'Bobov-dol-Hronika.pdf'
    os.makedirs(OUT, exist_ok=True)
    doc = BookDoc(
        os.path.join(OUT, name), pagesize=A5,
        title='Бобов дол — Хроника на един град',
        author='Стефан Л. Костадинов',
        subject='История на град Бобов дол — второ, коригирано издание',
        keywords='Бобов дол, история, хроника, миньори, Кюстендилска област, Carbon Stealth',
        creator='Carbon Stealth VCC · ReportLab',
    )
    frame = Frame(FRAME_X, FRAME_Y, FRAME_W, FRAME_H, id='inner', leftPadding=0,
                  rightPadding=0, topPadding=FRAME_PAD, bottomPadding=FRAME_PAD)
    full = Frame(0, 0, W, H, id='full', leftPadding=0, rightPadding=0, topPadding=0,
                 bottomPadding=0)
    doc.addPageTemplates([
        PageTemplate(id='Cover', frames=[full], onPage=cover_page),
        PageTemplate(id='Blank', frames=[full], onPage=blank_decor),
        PageTemplate(id='Body', frames=[frame], onPageEnd=inner_decor),
        PageTemplate(id='Back', frames=[full], onPage=back_cover_page),
    ])
    st = make_styles(1.0)
    story = front_matter(st)
    story += toc_pages(st)

    def unit_flows(u):
        bl, k = ks[unit_name(u)] if ks else (u, 1.0)
        return flows_for(bl, make_styles(k))

    units = book_units()
    # предговор, после таблата (герб, карта), после частите
    pre, rest = units[0], units[1:]
    story += unit_flows(pre)
    story += plate('Герб', 'gerb', 280, 300,
                   'Гербът на Бобов дол — полукръгъл щит с крепостната корона на „Царичина“. '
                   'Трите светкавици на червено поле символизират електропроизводството; '
                   'кръстосаните чукове — минния труд; зъбното колело — ремонта на машините; '
                   'житният клас — земеделието.', st)
    story += plate(None, 'map', 300, 392,
                   'Община Бобов дол обхваща 206,188 km² и включва 18 населени места — града и '
                   '17 села. Граница и селища: © участници в OpenStreetMap (ODbL).', st)
    for u in rest:
        story += unit_flows(u)
    for u in tail_units():
        story += unit_flows(u)
    story += plate(None, 'timeline', 300, 436, None, st)
    for blocks in (CHISLA, ZA_AVTORA, IZTOCHNICI):
        for u in split_units(blocks):
            story += unit_flows(u)
    if pad_blank:
        story += [NextPageTemplate('Blank'), PageBreak(), Spacer(1, 1)]
        story += [NextPageTemplate('Back'), PageBreak(), Spacer(1, 1)]
    else:
        story += [NextPageTemplate('Back'), PageBreak(), Spacer(1, 1)]
    doc.multiBuild(story)
    return doc.page


def all_units():
    units = book_units() + tail_units()
    for blocks in (CHISLA, ZA_AVTORA, IZTOCHNICI):
        units += split_units(blocks)
    return units


def main():
    clean_only = '--clean' in sys.argv
    log = print
    log('Подгонване на страниците (последната страница на всяка глава)…')
    ks = {}
    for u in all_units():
        ks[unit_name(u)] = tune(u, log)
    pad = False
    pages = build(False, ks, pad, log)
    if pages % 2 == 1:
        log('Нечетен брой страници (%d) → добавям празна страница преди задната корица' % pages)
        pad = True
        pages = build(False, ks, pad, log)
    log('OK: %d страници → %s/Bobov-dol-Hronika.pdf' % (pages, OUT))
    if not clean_only:
        build(True, ks, pad, log)
        log('OK: екземпляр за проверка → %s/Bobov-dol-Hronika-ZA-PROVERKA.pdf' % OUT)


if __name__ == '__main__':
    main()
