"""Builds the "Vista 3D" pages of the catalogue as HTML (print.mjs prints them, merge.py puts them into
the catalogue): the renders over every product page's drawing card (one page of its own after the rigid
arm), the overlays of pages 6 and 7, and the summary pages of the whole range (summary.py).
Writes dist/pdf/: base.pdf (the catalogue before the 3D pages), img/*.jpg, sheets.html (the sheets, the page-7
overlay, the intellectual property stamps, the summary), spec.json.
Renders: lossless PNG from dist/renders* when present, else the committed WebP in renders/."""
import json
import math
import os
import subprocess
from html import escape
from PIL import Image
import layout as L
import summary as S

OUT = os.path.join(L.PKG, "dist", "pdf")
FONTS = os.path.join(os.path.dirname(L.PKG), "fonts")
BASE = os.path.join(OUT, "base.pdf")
# panev/docs/catalogo-staffe-panev-2026.pdf before the 3D pages (68 pages), as stored in git.
BASE_BLOB = "12896523a3568bf33e9aaa2eb4c850502e0d9239"
DPI = 300  # each render is stored at the resolution it needs at its placed size

os.makedirs(os.path.join(OUT, "img"), exist_ok=True)
if not os.path.exists(BASE):
    with open(BASE, "wb") as f:
        f.write(subprocess.run(["git", "cat-file", "blob", BASE_BLOB], check=True, capture_output=True).stdout)


def source(name, catalogue=False):
    pairs = [("renders-catalogo", "catalogo")] if catalogue else [("renders", "")]
    for dist_dir, committed in pairs:
        for path in (os.path.join(L.PKG, "dist", dist_dir, f"{name}.png"), os.path.join(L.PKG, "renders", committed, f"{name}.webp")):
            if os.path.exists(path):
                return path
    raise FileNotFoundError(f"render {name}")


ASSEMBLIES = sorted({os.path.splitext(n)[0] for d in ("dist/renders", "renders") if os.path.isdir(os.path.join(L.PKG, d)) for n in os.listdir(os.path.join(L.PKG, d)) if "+" in n})
pages = L.build(BASE, ASSEMBLIES)
summary = S.build(BASE)

# Placed width of every image (the widest placement wins), then one JPEG per image.
placed = {}
for page in pages:
    for s in page["shots"]:
        placed[(s["render"], False)] = max(placed.get((s["render"], False), 0), s["rect"][2])
for name, r in L.P7:
    placed[(name, True)] = r[2] - r[0]
for name, catalogue, r, _, _ in L.P5:
    placed[(name, catalogue)] = max(placed.get((name, catalogue), 0), r[2] - r[0])
for t in (t for p in summary for g in p["groups"] for t in g["tiles"]):
    placed[(t["render"], False)] = max(placed.get((t["render"], False), 0), t["rect"][2])
files = {}
for (name, catalogue), width_pt in placed.items():
    img = Image.open(source(name, catalogue)).convert("RGB")
    px = min(img.width, math.ceil(width_pt / 72 * DPI))
    if px < img.width:
        img = img.resize((px, round(img.height * px / img.width)), Image.LANCZOS)
    rel = f"img/{'p06-' if catalogue else ''}{name}.jpg"
    img.save(os.path.join(OUT, rel), "JPEG", quality=88, subsampling=2, optimize=True)
    files[(name, catalogue)] = rel

# "Proprietà intellettuale di Panev Ascensori SAS" (the owner's wish: almost everywhere in the catalogue): a caption at the
# bottom right of every render here, and stamp pages after the sheets for notice.py to lay on the other pages:
# the footer line after "MADE IN ITALY", the same alone on the section covers, the line after the copyright on the back,
# and the caption of the technical drawings. Each stamp: [page after the sheets, its rectangle there].
IP = "Proprietà intellettuale di Panev Ascensori SAS"
IP_BOX = (142, 9.6)
STAMPS = {
    "foot": (0, (100, 572, 380, 592), f'<div class="abs foot" style="left:104.6pt;color:#5c7690">· {IP}</div>'),
    "foot_light": (1, (30, 572, 380, 592), f'<div class="abs foot" style="left:34pt;color:#9aaac4">{IP}</div>'),
    "back": (2, (247, 552, 610, 568), f'<div class="abs" style="left:250pt;top:556.1pt;font-size:6.75pt;letter-spacing:0.06em;color:#9aaac4;white-space:nowrap">· {IP}</div>'),
    "corner": (3, (100, 100, 100 + IP_BOX[0], 100 + IP_BOX[1]), f'<div class="ip" style="left:100pt;top:100pt;right:auto;bottom:auto">© {IP}</div>'),
}
CSS = f"""
@font-face {{ font-family: Inter; src: url(file://{FONTS}/Inter-var-latin.woff2) format('woff2'); font-weight: 100 900;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }}
@font-face {{ font-family: Inter; src: url(file://{FONTS}/Inter-var-latin-ext.woff2) format('woff2'); font-weight: 100 900;
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }}
@page {{ size: {L.W}pt {L.H}pt; margin: 0; }}
html, body {{ margin: 0; padding: 0; background: transparent; }}
* {{ box-sizing: border-box; }}
.sheet {{ position: relative; width: {L.W}pt; height: {L.H}pt; overflow: hidden; break-after: page; font-family: Inter, sans-serif; color: #1b2733; }}
.sheet:last-child {{ break-after: auto; }}
.abs {{ position: absolute; }}
.eyebrow {{ left: 39.7pt; top: 39.8pt; font-size: 7.5pt; font-weight: 600; letter-spacing: 0.19em; color: #63635f; text-transform: uppercase; white-space: nowrap; }}
.title {{ left: 39.7pt; top: 53.9pt; font-size: 13.5pt; font-weight: 650; letter-spacing: -0.04em; color: #162862; white-space: nowrap; }}
.shade {{ left: 36.7pt; top: 79.4pt; width: 769pt; height: {L.CARD[3] + 4.2 - 79.4:.1f}pt; background: rgba(22, 40, 98, 0.0706); border-radius: 7pt; }}
.card {{ left: {L.CARD[0]}pt; top: {L.CARD[1]}pt; width: {L.CARD[2] - L.CARD[0]:.1f}pt; height: {L.CARD[3] - L.CARD[1]:.1f}pt; background: #fbfcfd;
  border: 0.75pt solid #e2e6ea; border-radius: 5pt; overflow: hidden; }}
.bar {{ position: absolute; left: 0; top: 0; right: 0; height: 18.7pt; background: #162862; display: flex; align-items: center; justify-content: space-between;
  padding: 0 12.2pt 0 11.7pt; font-size: 6pt; letter-spacing: 0.2em; text-transform: uppercase; }}
.bar .l {{ color: #fff; font-weight: 600; }}
.bar .r {{ color: #b7c4d6; font-weight: 500; }}
.note {{ position: absolute; left: 0; right: 0; bottom: 0; height: 31.5pt; background: #edf1f7; border-top: 0.7pt solid #e2e6ea; display: flex; align-items: center;
  gap: 9pt; padding-left: 17pt; font-size: 6.38pt; color: #1b2733; }}
.note b {{ font-weight: 700; color: #162862; }}
.note svg {{ width: 12pt; height: 12pt; flex: none; }}
.inner {{ left: {L.INNER[0]}pt; top: {L.INNER[1]}pt; width: {L.INNER[2] - L.INNER[0]:.1f}pt; height: {L.INNER[3] - L.INNER[1]:.1f}pt; background: #fff;
  border: 0.75pt solid #eef1f5; border-radius: 3pt; }}
.shot {{ border-radius: 3.5pt; overflow: hidden; border: 0.6pt solid #e2e6ea; background: #e9ecf1; }}
.shot img, .p06 img {{ display: block; width: 100%; height: 100%; object-fit: cover; }}
.tags {{ position: absolute; left: 6pt; top: 6pt; display: flex; flex-wrap: wrap; gap: 3pt; }}
.tags span {{ border-radius: 2.5pt; padding: 2.6pt 5.5pt 2.4pt; font-size: 6.4pt; line-height: 1.15; white-space: nowrap; }}
.tags .c {{ background: #162862; color: #fff; font-weight: 700; letter-spacing: 0.02em; }}
.tags .d {{ background: rgba(255, 255, 255, 0.88); color: #1b2733; font-weight: 500; }}
.tags .i {{ background: rgba(99, 99, 95, 0.9); color: #fff; font-weight: 600; }}
.codes {{ left: 39.7pt; top: 540pt; display: flex; align-items: center; gap: 11pt; }}
.codes .k {{ font-size: 6.75pt; font-weight: 500; letter-spacing: 0.09em; color: #5a6875; margin-right: 1pt; }}
.codes .chip {{ height: 20.2pt; border-radius: 3pt; background: #162862; color: #fff; font-size: 7.5pt; font-weight: 700; display: flex; align-items: center;
  padding: 0 11.3pt; white-space: nowrap; }}
.refs {{ right: 40.5pt; top: 546.3pt; font-size: 6.75pt; font-weight: 500; letter-spacing: 0.1em; color: #5a6875; text-transform: uppercase; white-space: nowrap; }}
.pageno {{ right: 34pt; top: 578.9pt; font-size: 6.38pt; font-weight: 700; letter-spacing: 0.12em; color: #162862; white-space: nowrap; }}
.p06 {{ border-radius: 4pt; overflow: hidden; }}
.para {{ width: 202pt; font-size: 7.12pt; line-height: 11.25pt; color: #1b2733; }}
.para b, .fix b {{ font-weight: 700; color: #162862; }}
.intro {{ font-size: 8.25pt; color: #5a6875; white-space: nowrap; }}
.fix {{ font-size: 6.38pt; color: #1b2733; white-space: nowrap; }}
.app {{ overflow: hidden; border-radius: 4pt 4pt 0 0; }}
.app img {{ display: block; width: 100%; height: 100%; object-fit: cover; }}
.ip {{ position: absolute; right: 3pt; bottom: 3pt; width: {IP_BOX[0]}pt; height: {IP_BOX[1]}pt; display: flex; align-items: center; justify-content: center;
  border-radius: 2pt; background: rgba(255, 255, 255, 0.82); font-size: 5.6pt; font-weight: 500; letter-spacing: 0.02em; color: #667298; white-space: nowrap; }}
.foot {{ top: 578.9pt; font-size: 6.38pt; font-weight: 600; letter-spacing: 0.24em; text-transform: uppercase; white-space: nowrap; }}
""" + S.CSS
CUBE = ('<svg viewBox="0 0 24 24" fill="none" stroke="#162862" stroke-width="1.6" stroke-linejoin="round">'
        '<path d="M12 2.8 20.5 7.4v9.2L12 21.2 3.5 16.6V7.4z"/><path d="M3.5 7.4 12 12l8.5-4.6M12 12v9.2"/></svg>')


def box(x, y, w, h):
    return f"left:{x:.2f}pt;top:{y:.2f}pt;width:{w:.2f}pt;height:{h:.2f}pt"


def tags(s):
    extra = '<span class="i">Forma indicativa</span>' if s["indicative"] else ""
    return f'<div class="tags"><span class="c">{escape(s["label"])}</span><span class="d">{escape(s["desc"])}</span>{extra}</div>'


def tiles(p):
    return "".join(f'<div class="abs shot" style="{box(*s["rect"])}"><img src="{files[(s["render"], False)]}" alt="">{tags(s)}<div class="ip">© {IP}</div></div>' for s in p["shots"])


def rect(r):
    return box(r[0], r[1], r[2] - r[0], r[3] - r[1])


def sheet_inline(p):
    """Laid over the product page: a white panel over the drawing's, the renders in it, the card's title
    bar saying what it shows now, and the note of the SU/SD/SC pages that spoke of the drawing."""
    pan = p["panel"]
    fix = f'<div class="abs fix" style="left:{pan["note"][0]:.2f}pt;top:{pan["note"][1] - 0.3:.2f}pt">{L.FIX}</div>' if pan["note"] else ""
    return (
        f'<section class="sheet"><div class="abs inner" style="{rect(pan["inner"])}"></div>{tiles(p)}'
        f'<div class="abs bar" style="{rect(pan["bar"])};background:none"><span class="l">Vista 3D</span><span class="r">{escape(p["right"])}</span></div>'
        f"{fix}</section>"
    )


def sheet(p):
    shots = tiles(p)
    chips = "".join(f'<span class="chip">{escape(c)}</span>' for c in p["codes"])
    refs = "Disegni tecnici · pag. " + " – ".join(n for _, n in p["refs"])
    return (
        '<section class="sheet">'
        f'<div class="abs eyebrow">{escape(p["eyebrow"])}</div><div class="abs title">{escape(p["title"])}</div>'
        '<div class="abs shade"></div>'
        f'<div class="abs card"><div class="bar"><span class="l">Vista 3D</span><span class="r">{escape(p["right"])}</span></div>'
        f'<div class="note">{CUBE}<span>{p["note"]}</span></div></div>'
        f'<div class="abs inner"></div>{shots}'
        f'<div class="abs codes"><span class="k">CODICI:</span>{chips}</div>'
        f'<div class="abs refs">{escape(refs)}</div><div class="abs pageno">{escape(p["label"])}</div>'
        "</section>"
    )


def sheet_p06():
    imgs = "".join(f'<div class="abs p06" style="{box(r[0], r[1], r[2] - r[0], r[3] - r[1])}"><img src="{files[(n, True)]}" alt=""><div class="ip">© {IP}</div></div>' for n, r in L.P7)
    return f'<section class="sheet">{imgs}</section>'


def sheet_p05():
    apps = "".join(f'<div class="abs app" style="{rect(r)}"><img src="{files[(n, cat)]}" alt=""><div class="ip">© {IP}</div></div>'
                   f'<div class="abs para" style="left:{x:.2f}pt;top:{y - 1.6:.2f}pt">{text}</div>' for n, cat, r, (x, y), text in L.P5)
    (x, y), intro = L.P5_INTRO
    return f'<section class="sheet">{apps}<div class="abs intro" style="left:{x}pt;top:{y - 0.9:.2f}pt">{intro}</div></section>'


def stamps():
    return "".join(f'<section class="sheet">{html}</section>' for _, (_, _, html) in sorted(STAMPS.items(), key=lambda kv: kv[1][0]))


articles = sum(len(g["tiles"]) for p in summary for g in p["groups"])
ending = "".join(S.sheet(p, lambda r: files[(r, False)], articles, CUBE) for p in summary)
html = f'<!doctype html><html lang="it"><head><meta charset="utf-8"><style>{CSS}</style></head><body>{"".join(sheet_inline(p) if p["mode"] == "inline" else sheet(p) for p in pages)}{sheet_p06()}{sheet_p05()}{stamps()}{ending}</body></html>'
with open(os.path.join(OUT, "sheets.html"), "w") as f:
    f.write(html)
with open(os.path.join(OUT, "spec.json"), "w") as f:
    # gen.pdf: the sheets in the order of `pages`, then page 7's renders, page 6's, the stamps, the summary.
    json.dump(dict(pages=pages, p06=len(pages), p05=len(pages) + 1, stamps={k: [len(pages) + 2 + n, r] for k, (n, r, _) in STAMPS.items()},
                   summary=dict(first=len(pages) + 2 + len(STAMPS), pages=summary)), f, ensure_ascii=False, indent=1)
size = sum(os.path.getsize(os.path.join(OUT, v)) for v in files.values())
inline = sum(p["mode"] == "inline" for p in pages)
print(f"{inline} product pages with renders, {len(pages) - inline} 3D pages, pages 6 and 7, {len(STAMPS)} stamps, {len(summary)} summary pages "
      f"({articles} articles); {len(files)} images, {size / 1e6:.1f} MB")
