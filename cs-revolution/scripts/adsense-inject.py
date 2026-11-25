#!/usr/bin/env python3
"""Google AdSense loader на всяка статична страница (решение на собственика, 2026-09-18).

Пуска се след генераторите:  python3 scripts/adsense-inject.py
Идемпотентно: страница, която вече съдържа adsbygoogle.js, не се пипа.

Тагът влиза в <head> веднага след <meta charset>. Скриптът е async, така че не пречи на
рендера. Съгласието за реклами в ЕИП се показва от самия AdSense (Privacy & messaging
→ GDPR съобщение в акаунта) — сертифициран CMP по изискването на Google от 2024 г.
CSP на nginx (nginx/carbonstealth.conf) е разширен с Google домейните; ads.txt е в public/.
"""
import glob, re

TAG = ('<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9580994554261732" '
       'crossorigin="anonymous"></script>')
# Until the visitor presses ACCEPT in our banner (localStorage cs_cookie = "accepted"),
# ask AdSense for NON-personalised ads only (documented adsbygoogle flag). Goes BEFORE the loader.
NPA = ('<script id="cs-ads-npa">(function(){var a=window.adsbygoogle=window.adsbygoogle||[];'
       'try{if(localStorage.getItem("cs_cookie")!=="accepted")a.requestNonPersonalizedAds=1}catch(e){a.requestNonPersonalizedAds=1}})()</script>')
SKIP = {"offline.html"}

def main():
    n = 0
    for p in sorted(glob.glob("public/**/*.html", recursive=True)):
        if p.rsplit("/", 1)[-1] in SKIP:
            continue
        s = open(p, encoding="utf-8").read()
        if "adsbygoogle.js" in s and 'id="cs-ads-npa"' not in s:
            open(p, "w", encoding="utf-8").write(s.replace('<script async src="https://pagead2', NPA + '<script async src="https://pagead2', 1)); n += 1
            continue
        if "adsbygoogle.js" in s or "<head" not in s:
            continue
        s2 = re.sub(r'(<meta charset="?[Uu][Tt][Ff]-8"?\s*/?>)', lambda m: m.group(1) + NPA + TAG, s, count=1)
        if s2 == s:  # без meta charset → веднага след <head>
            s2 = re.sub(r"(<head[^>]*>)", lambda m: m.group(1) + NPA + TAG, s, count=1)
        if s2 != s:
            open(p, "w", encoding="utf-8").write(s2); n += 1
    print(f"adsense: добавен на {n} страници")

if __name__ == "__main__":
    main()
