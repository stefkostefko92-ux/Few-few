#!/usr/bin/env python3
"""Обща визуална тема за статичните страници — същата марка като началната (SPA).

Одитът от 25.09.2026 показа, че началната (карбонов фон #0A0C0E, хромирани заглавия в
Space Grotesk, циан сияние) и ~400 статични страници (#000, Inter Tight, заоблени карти,
три различни стила на бутони) изглеждат като различни сайтове, а на телефон навигацията
им е отрязана (няма мобилно меню). Този скрипт носи едно място за всичко това:

  * <link id="cs-theme-fonts"> — Space Grotesk + Onest/JetBrains Mono (кирилица);
  * <script id="cs-js-flag"> в <head> — маркира html.js, за да се показва хамбургерът
    само когато JS работи (без JS линковете остават хоризонтален ред със скрол);
  * <style id="cs-theme"> — токени, фон, типография, навигация, мобилно меню, карти,
    бутони, линкове в текста (подчертани), футър, долните блокове на услугите;
  * <script id="cs-nav-js"> преди </body> — мобилното меню (бутон, Esc, aria-expanded);
  * футър на правните страници и 404, които нямаха такъв.

Идемпотентно: при повторно пускане старите блокове се махат и се слагат наново, така
че промяна тук стига до всички страници с едно пускане. Пуска се от cs-revolution/:
    python3 scripts/static-theme.py
Мястото му във веригата е след генераторите и inject-widgets.py (виж CLAUDE.md).
"""
import glob
import os
import re

FONTS = ('<link id="cs-theme-fonts" rel="stylesheet" href="https://fonts.googleapis.com/css2?'
         'family=Space+Grotesk:wght@500;600;700&family=Onest:wght@400;600;700'
         '&family=JetBrains+Mono:wght@400;700&display=swap">')
JS_FLAG = '<script id="cs-js-flag">document.documentElement.classList.add("js")</script>'

DISP = "'Space Grotesk','Onest','SG-fallback','Inter Tight',-apple-system,sans-serif"
MONO = "'Space Mono','JetBrains Mono','SM-fallback',ui-monospace,monospace"
CHROME = ("background-image:linear-gradient(180deg,#F4F7F8 0%,#D6DDE1 38%,#8E989F 50%,#E4E9EC 58%,#F4F7F8 100%);"
          "background-size:100% 1lh;background-repeat:repeat-y;-webkit-background-clip:text;background-clip:text;"
          "color:transparent;-webkit-text-fill-color:transparent")

CSS = f"""
@font-face{{font-family:'SG-fallback';src:local('Arial');size-adjust:96%;ascent-override:98%;descent-override:24%;line-gap-override:0%}}
@font-face{{font-family:'SM-fallback';src:local('Courier New');size-adjust:108%;ascent-override:100%;descent-override:26%;line-gap-override:0%}}
:root{{--cs-bg:#0A0C0E;--cs-ink:#C9D1D6;--cs-ink2:#9AA5AC;--cs-c:#00e5ff;--cs-line:rgba(201,209,214,.08)}}
html{{background:var(--cs-bg)}}
body{{background:var(--cs-bg)!important;color:var(--cs-ink);font-family:{MONO}!important;position:relative}}
body::before{{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
  background-image:linear-gradient(var(--cs-line) 1px,transparent 1px),linear-gradient(90deg,var(--cs-line) 1px,transparent 1px),
  repeating-linear-gradient(45deg,rgba(255,255,255,.016) 0 3px,transparent 3px 8px),repeating-linear-gradient(-45deg,rgba(255,255,255,.016) 0 3px,transparent 3px 8px);
  background-size:96px 96px,96px 96px,16px 16px,16px 16px;
  -webkit-mask-image:radial-gradient(circle at 50% 20%,#000,transparent 80%);mask-image:radial-gradient(circle at 50% 20%,#000,transparent 80%)}}
h1{{font-family:{DISP}!important;font-weight:600!important;letter-spacing:-.02em!important;line-height:1.08!important;text-wrap:balance;{CHROME}}}
h2,h3,.faq-q,.tier h3,.card h3{{font-family:{DISP}!important;text-wrap:balance}}
h2{{letter-spacing:.02em!important}}
a{{color:var(--cs-c)}}
.w p a,.w li a,.faq-a a,.seo-body p a,.seo-body li a{{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}}
.w .cta,.w .btn,.w a.cta{{text-decoration:none}}
.card,.tier,.cell,.addon,.vat article,.cta-box,details,.tag-list a,.sect a{{border-radius:2px!important}}
.cta{{background:rgba(0,229,255,.05);box-shadow:0 0 22px rgba(0,229,255,.22),inset 0 0 14px rgba(0,229,255,.06);transition:box-shadow .3s,background .3s}}
.cta:hover,.cta:focus-visible{{background:rgba(0,229,255,.1);box-shadow:0 0 34px rgba(0,229,255,.42),inset 0 0 18px rgba(0,229,255,.1)}}
:focus-visible{{outline:2px solid var(--cs-c);outline-offset:2px}}
/* navigation */
.nav{{background:rgba(10,12,14,.94)!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}}
.nav img{{height:34px!important;width:auto!important}}
.nav>div a{{display:inline-block;padding:7px 0}}
.nav-toggle{{display:none}}
/* hero */
.hero-s{{padding:104px 20px 36px!important;border-bottom:1px solid rgba(0,229,255,.1)}}
/* footer */
.ft{{border-top:1px solid rgba(0,229,255,.18)!important;padding:30px 20px!important;text-align:center;font-size:10px!important;color:#8a949b!important;margin-top:60px;
  background:radial-gradient(ellipse at 50% 100%,rgba(0,229,255,.08),transparent 60%)}}
.ft a{{text-decoration:underline}}.ft a{{display:inline-block;min-height:24px;line-height:24px}}.cs-legal-ft a{{padding:0 2px;border:0;background:none;border-radius:0;font-weight:inherit}}a.wa-float{{padding:0!important;border:0}}
.ft p{{margin:4px 0}}
/* lower blocks on the service pages (were a second design with their own sans font) */
.seo-body article{{background:rgba(0,229,255,.02)!important;border:1px solid rgba(0,229,255,.12);border-radius:2px!important;font-family:inherit!important;color:#C9D1D6!important}}
.seo-body article *{{font-family:inherit!important}}
.seo-body h2,.seo-body h3,.seo-body summary{{font-family:{DISP}!important}}
.seo-body h2{{font-size:clamp(1.3rem,2.6vw,1.85rem)!important;line-height:1.2!important;letter-spacing:-.005em!important;color:#E8EEF1!important;text-transform:none}}
.seo-body article>h2:first-child{{color:var(--cs-c)!important;font-size:clamp(1.5rem,3.2vw,2.2rem)!important}}
.seo-body p,.seo-body li,.seo-body summary+p{{font-size:14px!important;line-height:1.85!important}}
.seo-body [style*="border-radius"]{{border-radius:2px!important}}
.seo-body a[style*="background:#00e5ff"],.seo-body a[style*="background: #00e5ff"]{{background:rgba(0,229,255,.06)!important;color:var(--cs-c)!important;border:1px solid rgba(0,229,255,.5)!important;
  font-family:{MONO}!important;letter-spacing:.2em;text-transform:uppercase;font-size:11px!important;box-shadow:0 0 22px rgba(0,229,255,.22)}}
.opt input{{margin:0 8px 0 0;vertical-align:-2px}}
.blog-hub .w>div[style*="border-bottom"]{{border:1px solid rgba(0,229,255,.12)!important;padding:20px 22px!important;margin-bottom:12px;background:rgba(0,229,255,.015)}}
.work-shot{{display:block;width:100%;height:auto;aspect-ratio:16/10;object-fit:cover;object-position:top;border:1px solid rgba(0,229,255,.14);margin:28px 0 12px;background:#050607}}
/* phones */
@media(max-width:760px){{
  .hero-s{{padding:86px 16px 22px!important}}
  h1{{letter-spacing:-.005em!important;font-size:clamp(1.8rem,8vw,2.4rem)!important}}
  .js .nav>div{{display:none}}
  .js .nav .nav-toggle{{display:flex;flex-direction:column;justify-content:center;gap:5px;width:44px;height:44px;padding:0 11px;background:none;border:1px solid rgba(0,229,255,.3);cursor:pointer;position:relative;z-index:1002}}
  .nav-toggle span{{display:block;height:2px;background:var(--cs-c);transition:transform .2s,opacity .2s}}
  .js .nav.open>div{{display:flex;position:fixed;inset:0;z-index:1001;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(10,12,14,.98)}}
  .js .nav.open>div a{{font-size:13px;letter-spacing:.25em;margin:0;padding:14px 24px;min-width:240px;text-align:center;border:1px solid rgba(245,245,240,.08);color:#C9D1D6}}
  .nav.open .nav-toggle span:nth-child(1){{transform:translateY(7px) rotate(45deg)}}
  .nav.open .nav-toggle span:nth-child(2){{opacity:0}}
  .nav.open .nav-toggle span:nth-child(3){{transform:translateY(-7px) rotate(-45deg)}}
  html:not(.js) .nav>div{{display:flex;flex-wrap:nowrap;overflow-x:auto;white-space:nowrap;max-width:70vw}}
  html:not(.js) .nav>div a{{padding:9px 6px}}
}}
@media(prefers-reduced-motion:reduce){{.nav-toggle span,.cta{{transition:none}}}}
"""

NAV_JS = """<script id="cs-nav-js">(function(){var n=document.querySelector('nav.nav');if(!n)return;var d=n.querySelector(':scope>div');if(!d)return;
var bg=document.documentElement.lang==='bg',en=document.documentElement.lang==='en';var L={o:bg?'Отвори менюто':en?'Open menu':'Apri il menu',c:bg?'Затвори менюто':en?'Close menu':'Chiudi il menu'};
d.id=d.id||'cs-nav-links';var b=document.createElement('button');b.type='button';b.className='nav-toggle';b.setAttribute('aria-controls',d.id);b.setAttribute('aria-expanded','false');b.setAttribute('aria-label',L.o);b.innerHTML='<span></span><span></span><span></span>';n.appendChild(b);
function set(o){n.classList.toggle('open',o);b.setAttribute('aria-expanded',o?'true':'false');b.setAttribute('aria-label',o?L.c:L.o);document.body.style.overflow=o?'hidden':'';}
b.addEventListener('click',function(){set(!n.classList.contains('open'))});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&n.classList.contains('open')){set(false);b.focus();}});
d.addEventListener('click',function(e){if(e.target.closest('a'))set(false)});})();</script>"""

FOOT = {
    "it": ('<div class="ft cs-legal-ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p>'
           '<p><a href="/">Home</a> &middot; <a href="/prezzi/">Prezzi</a> &middot; <a href="/portfolio/">Portfolio</a> &middot; <a href="/privacy/">Privacy</a> &middot; '
           '<a href="/cookie/">Cookie</a> &middot; <a href="/termini/">Termini</a> &middot; <a href="/contatti/">Contatti</a></p></div>'),
    "en": ('<div class="ft cs-legal-ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p>'
           '<p><a href="/en/">Home</a> &middot; <a href="/en/pricing/">Pricing</a> &middot; <a href="/en/portfolio/">Portfolio</a> &middot; <a href="/en/privacy/">Privacy</a> &middot; '
           '<a href="/en/cookie/">Cookie</a> &middot; <a href="/en/terms/">Terms</a> &middot; <a href="/en/contact/">Contact</a></p></div>'),
    "bg": ('<div class="ft cs-legal-ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Бобов дол, България</p>'
           '<p><a href="/bg/">Начало</a> &middot; <a href="/bg/ceni/">Цени</a> &middot; <a href="/bg/portfolio/">Портфолио</a> &middot; <a href="/bg/privacy/">Поверителност</a> &middot; '
           '<a href="/bg/cookie/">Бисквитки</a> &middot; <a href="/bg/usloviya/">Условия</a> &middot; <a href="/bg/kontakti/">Контакти</a></p></div>'),
}
# pages whose template has no footer of its own
NEEDS_FOOTER = {"privacy", "cookie", "termini", "terms", "usloviya", "404.html"}
BLOG_HUBS = {"public/blog/index.html", "public/en/blog/index.html", "public/bg/blog/index.html"}
SKIP = {"public/offline.html", "public/status/index.html"}  # the status page is its own dashboard

STRIP = [re.compile(r'<link id="cs-theme-fonts"[^>]*>'), re.compile(r'<script id="cs-js-flag">.*?</script>', re.S),
         re.compile(r'<style id="cs-theme">.*?</style>', re.S), re.compile(r'<script id="cs-nav-js">.*?</script>', re.S),
         re.compile(r'<div class="ft cs-legal-ft">.*?</div>', re.S)]


def lang_of(path, html):
    m = re.search(r'<html[^>]*lang="(it|en|bg)"', html)
    return m.group(1) if m else "it"


def theme(path, html):
    for rx in STRIP:
        html = rx.sub("", html)
    head_add = FONTS + JS_FLAG + '<style id="cs-theme">' + CSS + "</style>"
    if "</head>" not in html:
        return html
    html = html.replace("</head>", head_add + "</head>", 1)
    if path in BLOG_HUBS and 'class="blog-hub"' not in html:
        html = re.sub(r"<body([^>]*)>", lambda m: "<body" + m.group(1) + ' class="blog-hub">' if "class=" not in m.group(1) else m.group(0), html, count=1)
    parts = set(path.replace("public/", "").split("/"))
    if parts & NEEDS_FOOTER and 'class="ft"' not in html:
        html = html.replace("</body>", FOOT[lang_of(path, html)] + "</body>", 1)
    if 'class="nav"' in html:
        html = html.replace("</body>", NAV_JS + "</body>", 1)
    return html


def main():
    n = 0
    for p in sorted(glob.glob("public/**/*.html", recursive=True)):
        if p in SKIP:
            continue
        s = open(p, encoding="utf-8").read()
        o = theme(p, s)
        if o != s:
            open(p, "w", encoding="utf-8").write(o)
            n += 1
    print(f"static-theme: обновени {n} страници")


if __name__ == "__main__":
    main()
