#!/usr/bin/env python3
"""Новата структура (доклад SEO/GEO/AEO, 22.11.2026, §3) върху всички статични страници. Идемпотентно.

1. Едно и също меню навсякъде (14 варианта → 1): HOME · SOLUZIONI ▾ · SETTORI · CASI STUDIO · PREZZI ·
   CHI SIAMO · CONTATTI. „Soluzioni“ води към хъба и отваря четирите направления (CSS :hover/:focus-within,
   без JS; на телефон са в отвореното меню). Логото (първата връзка в <nav>) не се пипа.
2. Всяка страница на услуга казва към кое направление принадлежи („Fa parte di …“) под заглавието.
3. Статичните начални /en/ и /bg/: H1 с новото обещание и блок „Решения“ (трите водещи направления,
   доказателства, браншове) преди услугите; игрите — тясна лента преди контактите.

Пуска се от cs-revolution/ след генераторите и rebrand-static.py, преди static-theme.py.
Имената и адресите на направленията идват от scripts/generate-solutions.py (един източник).
"""
import glob
import importlib.util
import re

spec = importlib.util.spec_from_file_location("sol", "scripts/generate-solutions.py")
sol = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sol)
DIRS, L, URL = sol.DIRS, sol.L, sol.url

MENU = {
    "it": [("/", "HOME"), ("SOL", "SOLUZIONI"), ("/settori/", "SETTORI"), ("/case-study/", "CASE STUDY"),
           ("/prezzi/", "PREZZI"), ("/chi-siamo/", "CHI SIAMO"), ("/contatti/", "CONTATTI")],
    "en": [("/en/", "HOME"), ("SOL", "SOLUTIONS"), ("/en/industries/", "INDUSTRIES"), ("/en/case-studies/", "CASE STUDIES"),
           ("/en/pricing/", "PRICING"), ("/en/about/", "ABOUT"), ("/en/contact/", "CONTACT")],
    "bg": [("/bg/", "ГЛАВНА"), ("SOL", "РЕШЕНИЯ"), ("/bg/branshove/", "БРАНШОВЕ"), ("/bg/keys-studii/", "КЕЙС СТЪДИТА"),
           ("/bg/ceni/", "ЦЕНИ"), ("/bg/za-nas/", "ЗА НАС"), ("/bg/kontakti/", "КОНТАКТИ")],
}


def menu(lang):
    out = []
    for href, label in MENU[lang]:
        if href == "SOL":
            sub = "".join(f'<a href="{URL(lang, d)}">{d["names"][lang]}</a>' for d in DIRS)
            out.append(f'<span class="nav-dd"><a href="{URL(lang)}" class="nav-dd-t">{label}</a><span class="nav-dd-m">{sub}</span></span>')
        else:
            out.append(f'<a href="{href}">{label}</a>')
    return "".join(out)


NAV_RX = re.compile(r'(<nav class="nav"[^>]*>\s*<a [^>]*>\s*<img[^>]*>\s*</a>\s*<div[^>]*>)(.*?)(</div>\s*</nav>)', re.S)

# ── страниците на услугите → направление (ключ в DIRS; None = общата основа → хъба) ──
SERVICE_DIR = {
    "servizi/sviluppo-siti-web": "web", "servizi/ecommerce": "web", "servizi/app-mobile": "web", "servizi/seo": "web",
    "servizi/erp": "business", "servizi/sviluppo-software": "business", "servizi/hosting": None,
    "en/services/web-development": "web", "en/services/ecommerce": "web", "en/services/mobile-apps": "web", "en/services/seo": "web",
    "en/services/erp": "business", "en/services/software-development": "business", "en/services/hosting": None,
    "bg/uslugi/web-razrabotka": "web", "bg/uslugi/ecommerce": "web", "bg/uslugi/mobilni-prilozheniya": "web", "bg/uslugi/seo": "web",
    "bg/uslugi/erp": "business", "bg/uslugi/softuer": "business", "bg/uslugi/hosting": None,
}
PART_OF = {"it": ("Fa parte di", "base comune di tutte le soluzioni"),
           "en": ("Part of", "the common foundation of all solutions"),
           "bg": ("Част от", "общата основа на всички решения")}
DIR_RX = re.compile(r'<p class="cs-dir">.*?</p>', re.S)


def part_of(lang, key):
    lab, base = PART_OF[lang]
    if key is None:
        return f'<p class="cs-dir">{lab}: <a href="{URL(lang)}">{base}</a></p>'
    d = next(x for x in DIRS if x["key"] == key)
    return f'<p class="cs-dir">{lab}: <a href="{URL(lang, d)}">{d["names"][lang]}</a></p>'


# ── статичните начални /en/ и /bg/ ──
H1 = {
    "en": ("Carbon Stealth VCC — Web Design &amp; Development Agency", "Carbon Stealth VCC — Custom Software for Business and Industry"),
    "bg": ("Carbon Stealth VCC — уеб агенция за сайтове, онлайн магазини и софтуер", "Carbon Stealth VCC — софтуер по поръчка за фирми и индустрия"),
}
HOME_TXT = {
    "en": dict(h2="Solutions", proof="Real projects", all="All solutions", sectors="By industry", asc="Elevator industry",
               allsec="all industries", games="Games and interactive", games_txt="Nexus Dominion and multiplayer browser games",
               before="<h2>Services</h2>", contact="<h2>Contact</h2>"),
    "bg": dict(h2="Решения", proof="Реални проекти", all="Всички решения", sectors="По бранш", asc="Асансьорен бранш",
               allsec="всички браншове", games="Игри и интерактив", games_txt="Nexus Dominion и мултиплейър браузър игри",
               before="<h2>Услуги</h2>", contact="<h2>Контакти</h2>"),
}
BLOCK_RX = re.compile(r"<!--cs-solutions-->.*?<!--/cs-solutions-->\n?", re.S)
GAMES_RX = re.compile(r"<!--cs-games-->.*?<!--/cs-games-->\n?", re.S)


def home_block(lang):
    t, u = HOME_TXT[lang], L[lang]["u"]
    cards = ""
    for d in DIRS[:3]:
        proj = " · ".join(sol.name_of(k, lang) for k in d["proofs"][:3])
        cards += (f'<div class="card"><h3><a href="{URL(lang, d)}">{d["names"][lang]}</a></h3>'
                  f'<p>{d["t"][lang]["promise"]}</p><span class="price">{proj}</span></div>')
    return (f'<!--cs-solutions--><h2>{t["h2"]}</h2>\n<div class="grid">{cards}</div>\n'
            f'<p>{t["proof"]}: <a href="{u["cs_erp"]}">ERP Ascensori</a> · <a href="{u["asc"]}">Rilievi Impianti</a> · '
            f'<a href="https://panevascensori.it" target="_blank" rel="noopener">Panev Ascensori</a> — <a href="{URL(lang)}">{t["all"]} &rarr;</a></p>\n'
            f'<p>{t["sectors"]}: <a href="{u["asc"]}">{t["asc"]}</a> · <a href="{u["sectors"]}">{t["allsec"]}</a></p>\n<!--/cs-solutions-->\n')


def games_band(lang):
    t = HOME_TXT[lang]
    d = next(x for x in DIRS if x["key"] == "games")
    return f'<!--cs-games--><p class="cs-games">{t["games"]} — <a href="{URL(lang, d)}">{t["games_txt"]} &rarr;</a></p><!--/cs-games-->\n'


def lang_of(html):
    m = re.search(r'<html[^>]*\blang="([a-z]{2})', html)
    return m.group(1) if m and m.group(1) in MENU else "it"


def main():
    nav_n = dir_n = home_n = 0
    for p in sorted(glob.glob("public/**/*.html", recursive=True)):
        s = open(p, encoding="utf-8").read()
        o = s
        lang = lang_of(s)
        s, k = NAV_RX.subn(lambda m: m.group(1) + menu(lang) + m.group(3), s, count=1)
        nav_n += k
        key = p[len("public/"):-len("/index.html")]
        if key in SERVICE_DIR:
            s = DIR_RX.sub("", s)
            s, k = re.subn(r"(<div class=\"hero-s\">.*?</h1>)", lambda m: m.group(1) + part_of(lang, SERVICE_DIR[key]), s, count=1, flags=re.S)
            dir_n += k
        if key in ("en", "bg"):
            old, new = H1[key]
            s = s.replace(f"<h1>{old}</h1>", f"<h1>{new}</h1>")
            s = BLOCK_RX.sub("", s)
            s = GAMES_RX.sub("", s)
            t = HOME_TXT[key]
            assert t["before"] in s and t["contact"] in s, p
            s = s.replace(t["before"], home_block(key) + t["before"], 1)
            s = s.replace(t["contact"], games_band(key) + t["contact"], 1)
            home_n += 1
        if s != o:
            open(p, "w", encoding="utf-8").write(s)
    print(f"solutions-nav: менюта {nav_n} · услуги с направление {dir_n} · начални {home_n}")


if __name__ == "__main__":
    main()
