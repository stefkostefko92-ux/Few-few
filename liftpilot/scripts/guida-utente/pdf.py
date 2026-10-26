#!/usr/bin/env python3
"""LiftPilot — the user guide as an A4 PDF: every page of the application and every field on it, in Italian, from the
texts in docs/guida-utente (one JSON per chapter, the order and the front matter in indice.json) and, when given, the
screenshots of a run of scripts/guida-utente/screenshot.mjs (<id>.png).

    python3 -I scripts/guida-utente/pdf.py --out guida.pdf [--shots DIR] [--admin]

--admin builds the appendix for the platform's administrator instead (the chapters listed under "admin"). Fonts:
DejaVu (report/fonts.py, REPORT_FONT_DIR); ReportLab 3.6 or later, Pillow."""
import argparse
import json
import os
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(__file__))

from reportlab.lib.units import mm  # noqa: E402
from reportlab.pdfbase import pdfmetrics  # noqa: E402
from reportlab.pdfgen import canvas  # noqa: E402
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Frame, NextPageTemplate, PageBreak,  # noqa: E402
                                PageTemplate, Paragraph, Spacer, Table, TableStyle)
from reportlab.platypus.tableofcontents import TableOfContents  # noqa: E402

import stili  # noqa: E402
from blocchi import (actions_table, callout, facts_box, fields_table, figure, glossary_table, md, para,  # noqa: E402
                     paras)
from stili import (BODY, BOTTOM, CHAPTER, CHAPTER_NO, COVER_SMALL, COVER_SUB, COVER_TITLE, DARK, DARK_2, H1, H2, H3,  # noqa: E402
                   MARGIN, MUTED, PAGE_H, PAGE_W, RULE, TOC_0, TOC_1, TOP, WIDTH)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
WORDMARK = os.path.join(ROOT, "brand", "premium", "liftpilot-wordmark.png")
EMBLEM = os.path.join(ROOT, "brand", "premium", "liftpilot-emblem.png")
CREDIT, CREDIT_URL = "Created and Designed by Carbon Stealth VCC", "https://carbonstealth.eu"


class Guide(BaseDocTemplate):
    """Chapters (level 0) and pages (level 1) go to the table of contents and to the PDF's bookmarks; the chapter
    open on a page goes to its running header."""

    def __init__(self, path, meta, **kw):
        super().__init__(path, pagesize=(PAGE_W, PAGE_H), leftMargin=MARGIN, rightMargin=MARGIN, topMargin=TOP,
                         bottomMargin=BOTTOM, title=meta["pdfTitle"], author="Carbon Stealth VCC",
                         subject=meta["subject"], keywords=meta["keywords"], creator="LiftPilot", **kw)
        body = Frame(MARGIN, BOTTOM, WIDTH, PAGE_H - TOP - BOTTOM, id="body", leftPadding=0, rightPadding=0,
                     topPadding=0, bottomPadding=0)
        self.addPageTemplates([PageTemplate(id="cover", frames=[body], onPage=cover(meta)),
                               PageTemplate(id="body", frames=[body])])
        self._n = 0

    def beforeDocument(self):
        # every pass of multiBuild names the bookmarks again from 1: the table of contents settles only if they match
        self._n = 0

    def afterFlowable(self, f):
        level = getattr(f, "toc_level", None)
        if level is None:
            return
        text, self._n = f.toc_text, self._n + 1
        key = "k%d" % self._n
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(text, key, level=level, closed=level == 0)
        self.notify("TOCEntry", (level, text, self.page, key))
        if level == 0:
            self.canv.chapter_title = text


def marked(flowable, level, text):
    flowable.toc_level, flowable.toc_text = level, text
    return flowable


def cover(meta):
    def draw(c, _doc):
        c.saveState()
        c.setFillColor(DARK)
        c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
        c.setStrokeColor(DARK_2)
        c.setLineWidth(0.5)
        for x in range(0, int(PAGE_W) + 1, int(10 * mm)):
            c.line(x, 0, x, PAGE_H)
        for y in range(0, int(PAGE_H) + 1, int(10 * mm)):
            c.line(0, y, PAGE_W, y)
        w = 128 * mm
        c.drawImage(WORDMARK, MARGIN, PAGE_H - 70 * mm, width=w, height=w * 300 / 1480, mask="auto")
        c.setStrokeColor(stili.CYAN)
        c.setLineWidth(1.2)
        c.line(MARGIN, PAGE_H - 84 * mm, MARGIN + 40 * mm, PAGE_H - 84 * mm)
        for i, (text, style, dy) in enumerate(((meta["title"], COVER_TITLE, 104), (meta["subtitle"], COVER_SUB, 118))):
            p = Paragraph(md(text), style)
            _w, h = p.wrap(WIDTH, 60 * mm)
            p.drawOn(c, MARGIN, PAGE_H - dy * mm - h + style.leading)
        p = Paragraph("<br/>".join(md(x) for x in meta["coverLines"]), COVER_SMALL)
        _w, h = p.wrap(WIDTH, 60 * mm)
        p.drawOn(c, MARGIN, 34 * mm)
        c.setFont("DejaVu", 8.4)
        c.setFillColor(stili.CYAN)
        c.drawString(MARGIN, 18 * mm, CREDIT)
        c.linkURL(CREDIT_URL, (MARGIN, 16.5 * mm, MARGIN + pdfmetrics.stringWidth(CREDIT, "DejaVu", 8.4), 21 * mm))
        c.restoreState()

    return draw


def numbered(meta):
    class NumberedCanvas(canvas.Canvas):
        """Two passes: «Pagina N di M» needs the total; the cover has neither header nor footer."""

        def __init__(self, *a, **kw):
            canvas.Canvas.__init__(self, *a, **kw)
            self._saved = []
            self.chapter_title = ""

        def showPage(self):
            self._saved.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._saved)
            # the link annotations are numbered across the document: restoring a page's state must not rewind it
            count = self._annotationCount
            for state in self._saved:
                self.__dict__.update(state)
                self._annotationCount = count
                if self._pageNumber > 1:
                    self.frame(total)
                count = self._annotationCount
                canvas.Canvas.showPage(self)
            canvas.Canvas.save(self)

        def frame(self, total):
            self.saveState()
            top = PAGE_H - 12 * mm
            self.drawImage(EMBLEM, MARGIN, top - 1.4 * mm, width=5.2 * mm, height=5.2 * mm, mask="auto")
            self.setFont("DejaVu-Bold", 7.6)
            self.setFillColor(stili.NAVY)
            self.drawString(MARGIN + 7 * mm, top, meta["header"])
            self.setFont("DejaVu", 7.6)
            self.setFillColor(MUTED)
            self.drawRightString(PAGE_W - MARGIN, top, self.chapter_title or "")
            self.setStrokeColor(RULE)
            self.setLineWidth(0.4)
            self.line(MARGIN, top - 3 * mm, PAGE_W - MARGIN, top - 3 * mm)
            y = 9 * mm
            self.line(MARGIN, y + 3.4 * mm, PAGE_W - MARGIN, y + 3.4 * mm)
            self.drawString(MARGIN, y, CREDIT)
            self.linkURL(CREDIT_URL, (MARGIN, y - 1.5 * mm, MARGIN + pdfmetrics.stringWidth(CREDIT, "DejaVu", 7.6), y + 3 * mm))
            self.drawRightString(PAGE_W - MARGIN, y, "Pagina %d di %d" % (self._pageNumber, total))
            self.restoreState()

    return NumberedCanvas


def chapter_band(no, title):
    t = Table([[Paragraph("CAPITOLO %d" % no, CHAPTER_NO)], [Paragraph(md(title), CHAPTER)]], colWidths=[WIDTH])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), DARK), ("LEFTPADDING", (0, 0), (-1, -1), 9 * mm),
                           ("TOPPADDING", (0, 0), (0, 0), 9 * mm), ("BOTTOMPADDING", (0, -1), (-1, -1), 9 * mm),
                           ("LINEBELOW", (0, -1), (-1, -1), 2, stili.CYAN)]))
    return marked(t, 0, title)


def page_story(page, shots, figures):
    out = [CondPageBreak(60 * mm), marked(Paragraph(md(page["title"]), H1), 1, page["title"])]
    box = facts_box(page)
    if box:
        out += [box, Spacer(1, 5)]
    out += paras(page.get("purpose"), BODY)
    for shot in page.get("shots") or []:
        path = os.path.join(shots, shot["id"] + ".png") if shots else None
        if path and os.path.exists(path):
            figures[0] += 1
            out.append(figure(path, "Figura %d — %s" % (figures[0], shot.get("caption") or page["title"])))
    for s in page.get("sections") or []:
        out.append(CondPageBreak(30 * mm))
        if s.get("title"):
            out.append(Paragraph(md(s["title"]), H2))
        out += paras(s.get("intro"), BODY)
        if s.get("fields"):
            out += [fields_table(s["fields"]), Spacer(1, 5)]
        if s.get("actions"):
            out += [actions_table(s["actions"]), Spacer(1, 5)]
        for kind, items in (("warn", s.get("warnings")), ("note", s.get("notes"))):
            for n in items or []:
                out += [callout(n, kind), Spacer(1, 3)]
    tips = page.get("tips") or []
    if tips:
        out.append(Paragraph("Consigli pratici", H3))
        for t in tips:
            out += [callout(t, "tip"), Spacer(1, 3)]
    return out


def sort_key(term):
    return unicodedata.normalize("NFKD", term).encode("ascii", "ignore").decode().casefold()


def build(content, shots, out, admin):
    index = json.load(open(os.path.join(content, "indice.json"), encoding="utf-8"))
    meta = index["admin"] if admin else index["guide"]
    keys = meta["chapters"]
    chapters = [json.load(open(os.path.join(content, k + ".json"), encoding="utf-8")) for k in keys]
    stili.register()
    toc = TableOfContents(dotsMinLevel=0)
    toc.levelStyles = [TOC_0, TOC_1]
    story = [NextPageTemplate("body"), PageBreak()]
    for block in meta.get("front", []):
        story.append(Paragraph(md(block["title"]), H1))
        story += paras(block.get("paragraphs"), BODY)
        for item in block.get("list") or []:
            story.append(Paragraph("•&nbsp;&nbsp;" + md(item), BODY))
        story.append(Spacer(1, 6))
    story += [PageBreak(), Paragraph("Indice", H1), toc, PageBreak()]
    figures, glossary = [0], {}
    for no, ch in enumerate(chapters, 1):
        story += [chapter_band(no, ch["title"]), Spacer(1, 8)]
        story += paras(ch.get("intro"), BODY)
        for page in ch.get("pages") or []:
            story += page_story(page, shots, figures)
        for g in ch.get("glossary") or []:
            glossary.setdefault(sort_key(g["term"]), g)
        story.append(PageBreak())
    if glossary:
        story += [chapter_band(len(chapters) + 1, "Glossario"), Spacer(1, 8),
                  glossary_table([glossary[k] for k in sorted(glossary)])]
    doc = Guide(out, meta)
    doc.multiBuild(story, canvasmaker=numbered(meta))
    return doc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--content", default=os.path.join(ROOT, "docs", "guida-utente"))
    ap.add_argument("--shots", default=None)
    ap.add_argument("--out", required=True)
    ap.add_argument("--admin", action="store_true")
    a = ap.parse_args()
    build(a.content, a.shots, a.out, a.admin)


if __name__ == "__main__":
    main()
