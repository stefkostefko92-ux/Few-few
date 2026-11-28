#!/usr/bin/env python3
"""Ред „Risorse" в футъра на всяка статична страница — вътрешни линкове към хъбовете.

Одитът показа, че хъбовете (блог, речник, сравнения, кейс стъдита, инструменти) са сираци за
статичните страници: линкове към тях има само в React футъра на началната. Този ред дава на
всяка от ~400 страници път към всеки хъб (и към цените/портфолиото), на трите езика.

Прилага се и върху шаблоните на генераторите (низът ft=…), за да не се губи при регенерация.
Идемпотентно: пазач class="ft-links". Пуска се:  python3 scripts/seo-footer-links.py
"""
import glob, os

LINKS = {
    "it": [("Prezzi", "/prezzi/"), ("Portfolio", "/portfolio/"), ("Settori", "/settori/"), ("Città", "/geo/"),
           ("Servizi locali", "/servizi-locali/"), ("Blog", "/blog/"), ("Glossario", "/glossario/"),
           ("Confronti", "/confronti/"), ("Case study", "/case-study/"), ("Strumenti", "/strumenti/")],
    "en": [("Pricing", "/en/pricing/"), ("Portfolio", "/en/portfolio/"), ("Industries", "/en/industries/"), ("Cities", "/en/geo/"),
           ("Local services", "/en/local-services/"), ("Blog", "/en/blog/"), ("Glossary", "/en/glossary/"),
           ("Comparisons", "/en/comparisons/"), ("Case studies", "/en/case-studies/"), ("Tools", "/en/tools/")],
    "bg": [("Цени", "/bg/ceni/"), ("Портфолио", "/bg/portfolio/"), ("Браншове", "/bg/branshove/"), ("Градове", "/bg/geo/"),
           ("Услуги по градове", "/bg/uslugi-lokalni/"), ("Блог", "/bg/blog/"), ("Речник", "/bg/rechnik/"),
           ("Сравнения", "/bg/sravneniya/"), ("Кейс стъдита", "/bg/keys-studii/"), ("Инструменти", "/bg/instrumenti/")],
}
# краят на футъра по език — там се вмъква редът
TAIL = {   # възможните завършеци на футъра по език (различните генератори пишат различни етикети)
    "it": ['<a href="/termini/">Terms</a></p></div>', '<a href="/termini/">Termini</a></p></div>'],
    "en": ['<a href="/en/terms/">Terms</a></p></div>'],
    "bg": ['<a href="/bg/usloviya/">Terms</a></p></div>', '<a href="/bg/usloviya/">Условия</a></p></div>'],
}
GUARD = 'class="ft-links"'

def row(lang):
    items = [(n, u) for n, u in LINKS[lang] if os.path.isdir("public" + u)]
    return ('<p class="ft-links" style="margin-top:10px">'
            + " &middot; ".join(f'<a href="{u}">{n}</a>' for n, u in items) + "</p>")

def patch(text):
    out = text
    for lang, tails in TAIL.items():
        for tail in tails:
            marker = tail[:-len("</div>")]        # '…Terms</a></p>'
            if tail in out and (marker + row(lang)) not in out:
                out = out.replace(tail, marker + row(lang) + "</div>")
    return out

def main():
    n = 0
    for p in sorted(glob.glob("public/**/index.html", recursive=True)) + sorted(glob.glob("scripts/generate-*.py")):
        s = open(p, encoding="utf-8").read(); o = patch(s)
        if o != s:
            open(p, "w", encoding="utf-8").write(o); n += 1
    print(f"footer links: променени {n} файла")

if __name__ == "__main__":
    main()
