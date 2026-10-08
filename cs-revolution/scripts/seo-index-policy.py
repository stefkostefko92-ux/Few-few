#!/usr/bin/env python3
"""Кои градски страници Google индексира — само тези с реална връзка (SEO решение 2026-10-08).

Защо: 63 страници „Siti Web <град>“ + 48 „<услуга> <град>“ бяха един шаблон със сменено
име на града (страниците Милано/Рим съвпадат на 94%). Google нарича това doorway abuse
(developers.google.com/search/docs/essentials/spam-policies) и може да свали целия сайт.

Какво прави (идемпотентно, след генераторите — виж CLAUDE.md):
  * индексирани остават само градовете, където имаме клиент или седалище (KEEP_CITIES) и
    услугите с реален проект там (KEEP_SERVICE_CITY); хъбовете /geo/ и /servizi-locali/ остават;
  * на останалите <meta name="robots"> става "noindex, follow" — страниците остават живи,
    линковете към тях не се чупят, Google просто ги вади от индекса (обратимо);
  * махат се от sitemap-geo.xml и sitemap-servicecity.xml (sitemap трябва да съдържа само
    индексируеми адреси).
Пуска се от cs-revolution/:  python3 scripts/seo-index-policy.py
"""
import glob
import re

KEEP_CITIES = {"milano", "sofia", "kyustendil", "dupnitsa"}   # Panev Ascensori (Milano), офис/регион, Evanita Sport (Дупница)
KEEP_SERVICE_CITY = {"erp-milano"}                             # ERP за Panev Ascensori SAS, Milano

GEO_DIRS = ["public/geo", "public/en/geo", "public/bg/geo"]
SC_DIRS = ["public/servizi-locali", "public/en/local-services", "public/bg/uslugi-lokalni"]
ROBOTS_RX = re.compile(r'<meta name="robots" content="[^"]*">')
INDEX = '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">'
NOINDEX = '<meta name="robots" content="noindex, follow">'


def pages(dirs, keep):
    out = []
    for d in dirs:
        for p in sorted(glob.glob(d + "/*/index.html")):
            slug = p.split("/")[-2]
            out.append((p, slug in keep))
    return out


def set_robots(path, indexable):
    s = open(path, encoding="utf-8").read()
    want = INDEX if indexable else NOINDEX
    if ROBOTS_RX.search(s):
        o = ROBOTS_RX.sub(want, s, count=1)
    else:
        o = s.replace("</head>", want + "</head>", 1)
    if o != s:
        open(path, "w", encoding="utf-8").write(o)
        return 1
    return 0


def prune_sitemap(path, keep_slugs):
    s = open(path, encoding="utf-8").read()
    def keep(m):
        loc = m.group(1).rstrip("/")
        last = loc.split("/")[-1]
        hub = last in ("geo", "servizi-locali", "local-services", "uslugi-lokalni")
        return m.group(0) if (hub or last in keep_slugs) else ""
    o = re.sub(r"<url>\s*<loc>([^<]+)</loc>.*?</url>\s*", keep, s, flags=re.S)
    if o != s:
        open(path, "w", encoding="utf-8").write(o)
    return len(re.findall(r"<loc>", o))


def main():
    changed = 0
    geo = pages(GEO_DIRS, KEEP_CITIES)
    sc = pages(SC_DIRS, KEEP_SERVICE_CITY)
    for p, ok in geo + sc:
        changed += set_robots(p, ok)
    n_geo = prune_sitemap("public/sitemap-geo.xml", KEEP_CITIES)
    n_sc = prune_sitemap("public/sitemap-servicecity.xml", KEEP_SERVICE_CITY)
    kept = sum(1 for _, ok in geo + sc if ok)
    print(f"index-policy: индексирани {kept}, noindex {len(geo) + len(sc) - kept}, променени {changed}; "
          f"sitemap-geo {n_geo} адреса, sitemap-servicecity {n_sc}")


if __name__ == "__main__":
    main()
