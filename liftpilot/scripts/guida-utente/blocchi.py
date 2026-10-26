"""The building blocks of the user guide: the inline markup of the texts, the tables of the fields and of the buttons,
the boxes of a page's facts and of the notes, the screenshots. Every text arrives written in Italian from
docs/guida-utente/*.json; here only the layout."""
import io
import re
from xml.sax.saxutils import escape

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import Image, KeepTogether, Paragraph, Spacer, Table, TableStyle

from stili import (CAPTION, CELL, CELL_B, CELL_HEAD, INFO, INFO_BG, INK_2, MUTED, NAVY, OK, OK_BG, RULE, SMALL, SOFT, TINY,
                   WARN, WARN_BG, WIDTH, ZEBRA)

_CODE = re.compile(r"`([^`]+)`")
_BOLD = re.compile(r"\*\*([^*]+)\*\*")


def md(text):
    """Plain text to ReportLab markup: XML escaped, `code` in the monospace face, **bold**."""
    s = escape(str(text))
    s = _CODE.sub(lambda m: '<font name="DejaVu-Mono" size="7.8">%s</font>' % m.group(1), s)
    return _BOLD.sub(r"<b>\1</b>", s)


def para(text, style):
    return Paragraph(md(text), style)


def paras(items, style):
    return [para(t, style) for t in (items or []) if t]


def _joined(items):
    return " ".join(md(t) for t in (items or []) if t)


def _grid(widths, rows, head=True):
    t = Table(rows, colWidths=widths, repeatRows=1 if head else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4.2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4.2),
        ("TOPPADDING", (0, 0), (-1, -1), 3.2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.35, RULE),
    ]
    if head:
        style += [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("LINEBELOW", (0, 0), (-1, 0), 0.6, NAVY)]
    first = 1 if head else 0
    for i in range(first, len(rows)):
        if (i - first) % 2 == 1:
            style.append(("BACKGROUND", (0, i), (-1, i), ZEBRA))
    t.setStyle(TableStyle(style))
    return t


def _facts(f):
    """The third column of a field: unit, values, default, when it is required."""
    lines = []
    for key, name in (("unit", "Unità"), ("values", "Valori"), ("default", "Proposto"), ("required", "Obbligatorio")):
        v = f.get(key)
        if v not in (None, "", "null"):
            lines.append("<b>%s:</b> %s" % (name, md(v)))
    return Paragraph("<br/>".join(lines) or "—", CELL)


def fields_table(fields):
    head = [Paragraph("Campo", CELL_HEAD), Paragraph("Che cosa indicare", CELL_HEAD), Paragraph("Valori", CELL_HEAD)]
    rows = [head]
    for f in fields:
        kind = f.get("kind")
        label = '<b>%s</b>%s' % (md(f.get("label", "")), '<br/><font size="7.2" color="#5b6472">%s</font>' % md(kind) if kind else "")
        rows.append([Paragraph(label, CELL), Paragraph(_joined(f.get("help")) or "—", CELL), _facts(f)])
    return _grid([44 * mm, 84 * mm, WIDTH - 128 * mm], rows)


def actions_table(actions):
    head = [Paragraph("Pulsante o azione", CELL_HEAD), Paragraph("Che cosa fa", CELL_HEAD)]
    rows = [head] + [[para(a.get("label", ""), CELL_B), Paragraph(md(a.get("help", "")), CELL)] for a in actions]
    return _grid([50 * mm, WIDTH - 50 * mm], rows)


def facts_box(page):
    rows = []
    for key, name in (("path", "Indirizzo"), ("access", "Chi la usa"), ("reach", "Come ci arrivi")):
        v = page.get(key)
        if v:
            text = '<font name="DejaVu-Mono" size="8">%s</font>' % escape(v) if key == "path" else md(v)
            rows.append([Paragraph("<b>%s</b>" % name, SMALL), Paragraph(text, SMALL)])
    if not rows:
        return None
    t = Table(rows, colWidths=[30 * mm, WIDTH - 30 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SOFT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 2.6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.6),
        ("LINEBEFORE", (0, 0), (0, -1), 2.2, NAVY),
    ]))
    return t


def callout(text, kind="note"):
    line, bg, tag = {"warn": (WARN, WARN_BG, "Attenzione"), "note": (INFO, INFO_BG, "Nota"),
                     "tip": (OK, OK_BG, "Consiglio")}[kind]
    t = Table([[Paragraph('<font color="%s"><b>%s</b></font> — %s' % (line.hexval().replace("0x", "#"), tag, md(text)), SMALL)]],
              colWidths=[WIDTH])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (0, -1), 2.2, line),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3.4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.8),
    ]))
    return t


def figure(path, caption, max_h=150 * mm, width_px=1240):
    """A screenshot fitted into the text width and max_h, never cropped (a phone's tall screen comes out narrower and
    centred), resampled to at most width_px for the PDF (about 180 dpi at full width), with a thin frame and its
    caption."""
    im = PILImage.open(path).convert("RGB")
    w = min(WIDTH, max_h * im.width / im.height)
    h = w * im.height / im.width
    if im.width > width_px:
        im = im.resize((width_px, round(im.height * width_px / im.width)), PILImage.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=88, optimize=True)
    buf.seek(0)
    img = Image(buf, width=w, height=h)
    frame = Table([[img]], colWidths=[w], hAlign="CENTER")
    frame.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.5, RULE), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                               ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return KeepTogether([frame, Paragraph(md(caption), CAPTION)])


def glossary_table(entries):
    rows = [[Paragraph("<b>%s</b>" % md(e["term"]), CELL), Paragraph(md(e["def"]), CELL)] for e in entries]
    return _grid([46 * mm, WIDTH - 46 * mm], rows, head=False) if rows else Spacer(1, 1)


def muted(text):
    return Paragraph(md(text), TINY)


__all__ = ["actions_table", "callout", "facts_box", "fields_table", "figure", "glossary_table", "md", "muted", "para",
           "paras", "colors", "INK_2", "MUTED"]
