#!/usr/bin/env python3
"""Шрифтовете от собствения сървър (public/fonts/) вместо от Google Fonts CDN.

Всяко зареждане от fonts.googleapis.com / fonts.gstatic.com праща IP адреса на
посетителя към Google преди съгласие (LG München I, 3 O 17493/20; ePrivacy/GDPR).
public/fonts/fonts.css съдържа @font-face за Inter Tight, Space Grotesk, Space Mono,
Onest и JetBrains Mono (variable woff2, само latin/latin-ext/cyrillic subsets).
Скриптът пренасочва всеки линк към /fonts/fonts.css и маха preconnect/dns-prefetch
към Google Fonts — в public/**/*.html, index.html и scripts/generate-*.py +
static-theme.py (за да не се върне при регенерация). Идемпотентно; от cs-revolution/.
"""
import glob
import re

GF = r'https://fonts\.googleapis\.com/css2\?[^"\'\s>]+'
RULES = [
    # preconnect / dns-prefetch към Google Fonts (+ интервал/нов ред след тях)
    (re.compile(r'<link rel="(?:preconnect|dns-prefetch)" href="(?:https:)?//fonts\.(?:googleapis|gstatic)\.com"(?: crossorigin)?\s*/?>[ \t]*\n?[ \t]*'), ''),
    # noscript fallback на асинхронното зареждане
    (re.compile(r'<noscript><link href="' + GF + r'" rel="stylesheet"\s*/?></noscript>\s*'), ''),
    # асинхронно preload→stylesheet: локалният файл е малък, зарежда се директно
    (re.compile(r'<link rel="preload" as="style" href="' + GF + r'" onload="[^"]*"\s*/?>'), '<link rel="stylesheet" href="/fonts/fonts.css" />'),
    (re.compile(GF), '/fonts/fonts.css'),
]
DUP = re.compile(r'<link href="/fonts/fonts\.css" rel="stylesheet">')


def fix(s):
    o = s
    for rx, b in RULES:
        o = rx.sub(b, o)
    # една връзка е достатъчна: ако темата (static-theme.py) вече има своята, махни дубликата
    if 'id="cs-theme-fonts"' in o:
        o = DUP.sub('', o)
    return o


def main():
    files = glob.glob('public/**/*.html', recursive=True) + ['index.html']
    files += sorted(glob.glob('scripts/generate-*.py')) + ['scripts/static-theme.py']
    n = 0
    for p in files:
        s = open(p, encoding='utf-8').read()
        o = fix(s)
        if o != s:
            open(p, 'w', encoding='utf-8').write(o)
            n += 1
    left = [p for p in files if p.endswith('.html') and 'fonts.g' in open(p, encoding='utf-8').read()]
    print(f'self-host-fonts: променени {n} файла, останали с Google Fonts: {len(left)}', *left[:5])


if __name__ == '__main__':
    main()
