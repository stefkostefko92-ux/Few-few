#!/usr/bin/env python3
"""Ключови думи на всяка статична страница (правило на репото: ≥5, една „Carbon Stealth").

Пуска се след генераторите и inject-widgets:  python3 scripts/seo-keywords.py
Идемпотентно: страница, която вече има <meta name="keywords">, не се пипа (ръчно зададените
на ценовите и сервизните страници остават).

Как се строят думите: заглавието (без бранда и без цените) и H1 дават конкретните фрази;
езиковият базов набор добавя синонимните заявки, по които искаме да ни намират; накрая
винаги „Carbon Stealth". Мета keywords не тежи в Google, но Bing/Yandex/Seznam го четат,
а тук е и договорът на репото за всяка страница.
"""
import glob, html, re

BASE_KW = {
    "it": ["web agency", "realizzazione siti web", "sviluppo siti web", "agenzia web Italia"],
    "en": ["web design agency", "website development", "web development company", "web agency Italy Bulgaria"],
    "bg": ["уеб агенция", "изработка на сайт", "уеб дизайн", "изработка на онлайн магазин"],
}
BRAND = "Carbon Stealth"

def lang_of(path):
    if path.startswith("public/en/"): return "en"
    if path.startswith("public/bg/"): return "bg"
    return "it"

def phrases(title, h1):
    out = []
    for src in (title, h1):
        src = re.sub(r"\|.*$", "", src)                 # махни „| Carbon Stealth …"
        src = re.sub(r"(da|from|от|de)\s*€?\s*[0-9][0-9.,]*\s*(€)?(\s*(\+ IVA|\+ VAT|с ДДС|/[a-zа-я]+))?", "", src)
        for part in re.split(r"[—:·|,]", src):
            p = re.sub(r"\s+", " ", part).strip(" .-–")
            p = re.sub(r"\bCarbon Stealth( VCC)?\b", "", p).strip(" .-–")
            if 3 <= len(p) <= 60 and not re.fullmatch(r"[0-9 €%+]+", p):
                out.append(p.lower())
    return out

def build(path, s):
    lang = lang_of(path)
    title = html.unescape(re.search(r"<title>(.*?)</title>", s, re.S).group(1)) if "<title>" in s else ""
    m = re.search(r"<h1[^>]*>(.*?)</h1>", s, re.S)
    h1 = html.unescape(re.sub("<[^>]+>", "", m.group(1))) if m else ""
    kws, seen = [], set()
    for k in phrases(title, h1) + BASE_KW[lang] + [BRAND]:
        key = k.lower()
        if key not in seen:
            seen.add(key); kws.append(k)
    return kws[:14]

def main():
    n = skipped = 0
    for p in sorted(glob.glob("public/**/*.html", recursive=True)):
        s = open(p, encoding="utf-8").read()
        if 'name="keywords"' in s or "<title>" not in s or 'name="description"' not in s:
            skipped += 1; continue
        kws = build(p, s)
        tag = f'<meta name="keywords" content="{html.escape(", ".join(kws), quote=True)}">'
        s2 = re.sub(r'(<meta name="description" content="[^"]*"\s*/?>)', lambda m: m.group(1) + "\n" + tag, s, count=1)
        if s2 != s:
            open(p, "w", encoding="utf-8").write(s2); n += 1
    print(f"keywords: добавени на {n} страници, пропуснати (вече имат / без head) {skipped}")

if __name__ == "__main__":
    main()
