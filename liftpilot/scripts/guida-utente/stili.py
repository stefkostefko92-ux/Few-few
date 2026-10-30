"""The look of the user guide (scripts/guida-utente/pdf.py): A4, DejaVu Sans (report/fonts.py, never Helvetica or
Times), the print palette of the application (src/app/globals.css, @media print: navy #1d3271) with the brand's cyan
for the cover and the rules."""
import os
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "report"))
import fonts  # noqa: E402  (report/fonts.py: DejaVu and DejaVu-Bold)

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
TOP = 22 * mm
BOTTOM = 20 * mm
WIDTH = PAGE_W - 2 * MARGIN

NAVY = colors.HexColor("#1d3271")
INK = colors.HexColor("#111827")
INK_2 = colors.HexColor("#374151")
MUTED = colors.HexColor("#5b6472")
RULE = colors.HexColor("#c8ced8")
ZEBRA = colors.HexColor("#f4f6f9")
SOFT = colors.HexColor("#e3e8f5")
CYAN = colors.HexColor("#27dff0")
DARK = colors.HexColor("#030a11")
DARK_2 = colors.HexColor("#0b1e2a")
WARN = colors.HexColor("#8f5500")
WARN_BG = colors.HexColor("#fdf6ea")
INFO = colors.HexColor("#3b4a73")
INFO_BG = colors.HexColor("#eef2fa")
OK = colors.HexColor("#1f7a4a")
OK_BG = colors.HexColor("#edf7f1")


def register():
    fonts.register()
    if "DejaVu-Mono" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("DejaVu-Mono", os.path.join(fonts.FONT_DIR, "DejaVuSansMono.ttf")))


def _style(name, **kw):
    base = dict(fontName="DejaVu", fontSize=9.4, leading=13.2, textColor=INK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(name, **base)


BODY = _style("body", spaceAfter=4)
SMALL = _style("small", fontSize=8.2, leading=11, textColor=INK_2)
TINY = _style("tiny", fontSize=7.4, leading=9.8, textColor=MUTED)
CELL = _style("cell", fontSize=8.4, leading=11.4)
CELL_B = _style("cellb", fontName="DejaVu-Bold", fontSize=8.4, leading=11.4)
CELL_HEAD = _style("cellh", fontName="DejaVu-Bold", fontSize=8.2, leading=10.6, textColor=colors.white)
CHAPTER_NO = _style("chapno", fontName="DejaVu-Bold", fontSize=10, leading=13, textColor=CYAN)
CHAPTER = _style("chapter", fontName="DejaVu-Bold", fontSize=22, leading=27, textColor=colors.white)
H1 = _style("h1", fontName="DejaVu-Bold", fontSize=15, leading=19, textColor=NAVY, spaceBefore=4, spaceAfter=6)
H2 = _style("h2", fontName="DejaVu-Bold", fontSize=11.4, leading=15, textColor=NAVY, spaceBefore=8, spaceAfter=4)
H3 = _style("h3", fontName="DejaVu-Bold", fontSize=9.6, leading=13, textColor=INK, spaceBefore=6, spaceAfter=3)
CAPTION = _style("caption", fontSize=7.8, leading=10.4, textColor=MUTED, alignment=TA_CENTER, spaceBefore=3, spaceAfter=8)
TOC_0 = _style("toc0", fontName="DejaVu-Bold", fontSize=10, leading=15, textColor=NAVY, spaceBefore=6)
TOC_1 = _style("toc1", fontSize=8.8, leading=12.4, leftIndent=12, textColor=INK_2)
COVER_TITLE = _style("covert", fontName="DejaVu-Bold", fontSize=30, leading=36, textColor=colors.white)
COVER_SUB = _style("covers", fontSize=13, leading=18, textColor=colors.HexColor("#c4d6de"))
COVER_SMALL = _style("coversm", fontSize=8.6, leading=12, textColor=colors.HexColor("#9eb2bd"))
