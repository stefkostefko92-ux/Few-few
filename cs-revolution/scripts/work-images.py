#!/usr/bin/env python3
"""Истински снимки на проектите в портфолиото и кейс стъдитата (public/work/*.webp).

Одитът (25.09.2026) показа, че агенция, която продава дизайн, показва работата си
като текст без нито едно изображение. Снимките в public/work/ са направени от живите
сайтове на проектите (1440×900, изрязани до горната част); този скрипт ги вкарва:
  * на /portfolio/, /en/portfolio/, /bg/portfolio/ — преди заглавието на всеки проект;
  * в кейс стъдитата — веднага след заглавната част.
Идемпотентно (клас work-shot). Пуска се от cs-revolution/:  python3 scripts/work-images.py
"""
import glob
import re

HOST_TO_SLUG = {
    "nexus.carbonstealth.eu": "nexus-dominion", "ouvaptsarov.com": "ou-vaptsarov", "erp.carbonstealth.eu": "erp-ascensori",
    "tretimart.carbonstealth.eu": "treti-mart", "evanita-bg.com": "evanita-sport", "eternaltouch.it": "eternal-touch",
    "ospedalitrasparenti.it": "ospedali-trasparenti", "vizitka-bg.com": "vizitka", "mastilko-bg.com": "mastilko",
    "panevascensori.it": "panev-ascensori",
}
ALT = {"it": "Schermata del sito {name}", "en": "Screenshot of the {name} website", "bg": "Екранна снимка на сайта {name}"}


def img(slug, name, lang, eager=False):
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    alt = ALT[lang].format(name=name)
    return (f'<img class="work-shot" src="/work/{slug}.webp" srcset="/work/{slug}-480.webp 480w, /work/{slug}.webp 960w" '
            f'sizes="(max-width:900px) 100vw, 860px" width="960" height="600" {load} decoding="async" alt="{alt}">')


def lang_of(p):
    return "en" if p.startswith("public/en/") else "bg" if p.startswith("public/bg/") else "it"


def portfolio(p):
    s = open(p, encoding="utf-8").read()
    if 'class="work-shot"' in s:
        return False
    lang = lang_of(p)
    # each item: <h2>NNN · Name</h2><p>…</p><p class='tags'>… <a href="https://host/"…
    def add(m):
        name = m.group(2)
        rest = s[m.end():m.end() + 900]
        h = re.search(r'href="https://([^/"]+)', rest)
        slug = HOST_TO_SLUG.get(h.group(1)) if h else None
        return (img(slug, name, lang) if slug else "") + m.group(0)
    o = re.sub(r"<h2>(\d{3}) · ([^<]+)</h2>", lambda m: add(m), s)
    if o != s:
        open(p, "w", encoding="utf-8").write(o)
        return True
    return False


def case_study(p):
    s = open(p, encoding="utf-8").read()
    if 'class="work-shot"' in s:
        return False
    m = re.search(r'<h1>([^<]+)</h1><a class="live" href="https://([^/"]+)', s)
    if not m or m.group(2) not in HOST_TO_SLUG:
        return False
    slug, name, lang = HOST_TO_SLUG[m.group(2)], m.group(1), lang_of(p)
    o = s.replace('</div></div><div class="w">', '</div></div><div class="w">' + img(slug, name, lang, eager=True), 1)
    if o != s:
        open(p, "w", encoding="utf-8").write(o)
        return True
    return False


def main():
    n = sum(portfolio(p) for p in ("public/portfolio/index.html", "public/en/portfolio/index.html", "public/bg/portfolio/index.html"))
    cs = [p for d in ("case-study", "en/case-studies", "bg/keys-studii") for p in glob.glob(f"public/{d}/*/index.html")]
    n += sum(case_study(p) for p in cs)
    print(f"work-images: снимки добавени на {n} страници")


if __name__ == "__main__":
    main()
