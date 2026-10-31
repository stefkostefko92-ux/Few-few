"""OpenType features: Bulgarian letterforms (locl BGR) and class kerning."""

from __future__ import annotations

from glyphset import GlyphSet

# Kerning classes by shape, shared by Latin and Cyrillic look-alikes.
LEFT_CLASSES = {
    "L_A": ["A", "uni0410", "Agrave", "Adieresis", "uni0414", "uni041B"],
    "L_TV": ["T", "uni0422", "V", "W", "Y", "uni0413", "uni0423"],
    "L_L": ["L"],
    "L_PF": ["P", "uni0420", "F"],
    "L_lcdiag": ["v", "w", "y", "uni0443", "r"],
    "L_quote": ["quoteright", "quotedblright", "quotesingle", "quotedbl"],
}
RIGHT_CLASSES = {
    "R_A": ["A", "uni0410", "Agrave", "Adieresis", "uni0414", "uni041B", "uni0434", "uni043B"],
    "R_TV": ["T", "uni0422", "V", "W", "Y", "uni0423"],
    "R_lcround": [
        "a", "c", "d", "e", "g", "o", "q", "agrave", "aacute", "adieresis", "egrave", "eacute",
        "ograve", "oacute", "odieresis", "uni0430", "uni0435", "uni0451", "uni043E", "uni0441",
        "uni0444", "uni044D", "uni044F",
    ],
    "R_lcother": ["m", "n", "p", "r", "s", "u", "v", "w", "x", "y", "z", "uni0432", "uni0433",
                  "uni0438", "uni0439", "uni043C", "uni043D", "uni043F", "uni0440", "uni0443", "uni0445",
                  "uni0446", "uni0448", "uni0449", "uni044C", "uni044E"],
    "R_punct": ["period", "comma", "ellipsis", "quotesinglbase", "quotedblbase"],
}
PAIRS = [
    ("L_A", "R_TV", -62),
    ("L_TV", "R_A", -62),
    ("L_TV", "R_lcround", -78),
    ("L_TV", "R_lcother", -50),
    ("L_TV", "R_punct", -92),
    ("L_L", "R_TV", -88),
    ("L_PF", "R_A", -48),
    ("L_PF", "R_punct", -96),
    ("L_lcdiag", "R_punct", -56),
    ("L_quote", "R_A", -52),
]


def kern_code(gs: GlyphSet) -> str:
    lines: list[str] = []
    for name, members in {**LEFT_CLASSES, **RIGHT_CLASSES}.items():
        present = [m for m in members if m in gs.glyphs]
        lines.append(f"@{name} = [{' '.join(present)}];")
    lines.append("feature kern {")
    # Scale with weight: bolder letters have less white space to take away.
    scale = 1.0 - (gs.weight.s - 86) / 400
    for left, right, value in PAIRS:
        lines.append(f"  pos @{left} @{right} {round(value * scale)};")
    lines.append("} kern;")
    return "\n".join(lines)


def feature_code(gs: GlyphSet) -> str:
    bg = sorted(n for n in gs.glyphs if n.endswith(".bg"))
    pairs = " ".join(f"sub {n[:-3]} by {n};" for n in bg)
    return f"""
languagesystem DFLT dflt;
languagesystem latn dflt;
languagesystem cyrl dflt;
languagesystem cyrl BGR;

feature locl {{
  script cyrl;
  language BGR exclude_dflt;
  {pairs}
}} locl;

{kern_code(gs)}
"""
