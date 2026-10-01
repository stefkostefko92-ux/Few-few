"""DejaVu Sans for every PDF of the product (Cyrillic, Greek and technical symbols); never the built-in Helvetica or
Times. The directory comes from REPORT_FONT_DIR."""
import os

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONT_DIR = os.environ.get("REPORT_FONT_DIR", "/usr/share/fonts/truetype/dejavu")


def register():
    if "DejaVu" in pdfmetrics.getRegisteredFontNames():
        return
    pdfmetrics.registerFont(TTFont("DejaVu", os.path.join(FONT_DIR, "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont("DejaVu-Bold", os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf")))
    pdfmetrics.registerFontFamily("DejaVu", normal="DejaVu", bold="DejaVu-Bold", italic="DejaVu", boldItalic="DejaVu-Bold")
