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

# Carbon & Chrome (docs/DESIGN-CARBON-CHROME.md) — the same system as the homepage (public/home.css).
def fonts(lang):
    pre = ["/fonts/geologica-latin-f6c73d.woff2"] + (["/fonts/geologica-cyrillic-ca5dbf.woff2"] if lang == "bg" else [])
    return ('<link id="cs-theme-fonts" rel="stylesheet" href="/fonts/fonts.css">'
            + "".join(f'<link id="cs-theme-fonts-pre{i}" rel="preload" as="font" type="font/woff2" href="{u}" crossorigin>' for i, u in enumerate(pre)))
JS_FLAG = '<script id="cs-js-flag">document.documentElement.classList.add("js")</script>'

SANS = "'Geologica','Geo-fb','Onest',system-ui,-apple-system,'Segoe UI',sans-serif"
NUM = "'Bodoni Moda','Didot','Bodoni 72',Georgia,serif"
# sentence case from ALL-CAPS markup: "CHI SIAMO" → "Chi siamo" (the generators write nav/CTA text in caps)
SENTENCE = "text-transform:lowercase!important;letter-spacing:0!important"

CSS = f"""
@font-face{{font-family:'Geo-fb';font-weight:100 500;src:local('Arial'),local('Liberation Sans'),local('Roboto');size-adjust:107.7%;ascent-override:91%;descent-override:26%;line-gap-override:0%}}
@font-face{{font-family:'Geo-fb';font-weight:600 900;src:local('Arial Bold'),local('Arial'),local('Liberation Sans Bold'),local('Roboto');size-adjust:100.3%;ascent-override:98%;descent-override:28%;line-gap-override:0%}}
:root{{--graphite:#16191C;--carbon:#1D2125;--chrome:#D3D9DD;--bright:#EEF2F4;--steel:#8F9AA1;--hair:rgba(211,217,221,.12);--hair2:rgba(211,217,221,.2);--ring:#2EC9DD;--ring-ink:#0C1417;
  --cs-c:#2EC9DD;--cs-bg:#16191C;--cs-ink:#D3D9DD}}
html{{background:var(--graphite)}}
body{{background:var(--graphite)!important;color:var(--chrome)!important;font:400 17px/1.65 {SANS}!important;-webkit-font-smoothing:antialiased}}
body::before{{content:none!important}}
p,li,td,th,dd,summary,label,.faq-a{{font-family:inherit!important;font-size:inherit;line-height:1.65!important;letter-spacing:0!important}}
p,li{{max-width:68ch}}
code,pre,kbd{{font-family:ui-monospace,Menlo,Consolas,monospace!important}}
h1{{font:600 clamp(2rem,4.2vw,3.2rem)/1.08 {SANS}!important;font-variation-settings:"SHRP" 60;letter-spacing:-.024em!important;color:var(--bright)!important;
  -webkit-text-fill-color:currentColor!important;background:none!important;text-transform:none!important;text-wrap:balance;max-width:22ch}}
h2{{font:600 clamp(1.35rem,2.4vw,1.75rem)/1.2 {SANS}!important;font-variation-settings:"SHRP" 60;letter-spacing:-.012em!important;color:var(--bright)!important;
  text-transform:none!important;margin:48px 0 14px!important;text-wrap:balance}}
h3,.faq-q,.card h3,.tier h3{{font:600 1.12rem/1.35 {SANS}!important;letter-spacing:-.005em!important;color:var(--chrome)!important;text-transform:none!important}}
a{{color:var(--chrome)}}
.w a:not(.cta):not(.card):not(.go):not(.btn):not([style*="background"]),.faq-a a,.seo-body a:not([style*="background"]){{color:var(--bright)!important;text-decoration:underline!important;text-decoration-color:var(--hair2)!important;text-decoration-thickness:1px;text-underline-offset:4px}}
.w a:not(.cta):not(.card):hover{{text-decoration-color:var(--chrome)!important}}
:focus-visible{{outline:2px solid var(--ring)!important;outline-offset:3px;border-radius:4px}}
::selection{{background:var(--ring);color:var(--ring-ink)}}
.w{{max-width:1000px!important}}
/* the "// SECTION" eyebrow above every H1 was template chrome: the H1 already says it */
.hero-s .tag{{display:none!important}}
.hero-s{{padding:128px 20px 40px!important;border-bottom:1px solid var(--hair)!important}}
.lead{{border-left:2px solid var(--hair2)!important;color:var(--bright)!important;font-size:1.12rem!important}}
.syn,.blog-date,.tags,.muted{{color:var(--steel)!important;letter-spacing:0!important}}
.tags{{font-size:.9rem!important}}
/* buttons: one primary style, sentence case (markup is ALL CAPS) */
.cta,.btn,.btn-analyze,.seo-body a[style*="background:#00e5ff"],.seo-body a[style*="background: #00e5ff"]{{display:inline-block!important;line-height:48px!important;min-height:48px;padding:0 22px!important;text-align:center;
  border:0!important;border-radius:6px!important;background:var(--ring)!important;color:var(--ring-ink)!important;font-weight:600!important;font-size:1rem!important;font-family:{SANS}!important;{SENTENCE};
  text-decoration:none!important;box-shadow:0 0 0 1px rgba(46,201,221,.4),0 8px 28px -10px rgba(46,201,221,.55)!important;transition:background .2s}}
.cta::first-letter,.btn::first-letter,.btn-analyze::first-letter,.seo-body a[style*="background:#00e5ff"]::first-letter{{text-transform:uppercase}}
.cta:hover,.btn:hover{{background:#5AD8E8!important}}
/* navigation — same bar as the homepage */
.nav{{height:68px;padding:0 max(20px,calc((100vw - 1200px)/2))!important;background:rgba(22,25,28,.94)!important;border-bottom:1px solid var(--hair)!important;box-shadow:none!important;
  -webkit-backdrop-filter:none!important;backdrop-filter:none!important}}
.nav img{{height:34px!important;width:auto!important;filter:none!important}}
.nav>div{{display:flex;align-items:center;gap:22px}}
.nav>div a{{display:inline-block;margin:0!important;padding:10px 0;color:var(--steel)!important;font:400 .95rem/1 {SANS}!important;{SENTENCE}}}
.nav>div a::first-letter{{text-transform:uppercase}}
.nav>div a:hover{{color:var(--chrome)!important}}
@media(min-width:761px){{.nav>div a:last-child{{padding:12px 16px;border-radius:6px;background:var(--ring);color:var(--ring-ink)!important;font-weight:600!important}}.nav>div a:last-child:hover{{background:#5AD8E8}}}}
.nav-toggle{{display:none}}
/* cards, plates, tables */
.card,.tier,.addon,.cta-box,.tool,.analyzer-box,.vat article{{background:var(--carbon)!important;border:0!important;border-radius:10px!important;box-shadow:inset 0 0 0 1px var(--hair)!important}}
.card:hover{{box-shadow:inset 0 0 0 1px var(--hair2)!important}}
.card h3{{margin-top:0!important}}
.tier.pop{{box-shadow:inset 0 0 0 1px rgba(46,201,221,.55)!important}}
.pop-badge{{background:none!important;color:var(--ring)!important;font:500 .8rem/1 {SANS}!important;{SENTENCE};top:18px!important;right:18px;left:auto!important}}
.pop-badge::first-letter{{text-transform:uppercase}}
.tier-tag,.hud,.price,.cities a,.rel a,.sect a,.tag-list a{{letter-spacing:0!important;font-family:inherit!important;border-radius:6px!important}}
.tier-tag,.hud{{color:var(--steel)!important;text-transform:none!important}}
.hud{{font-size:.92rem!important;line-height:1.6!important}}
.price{{background:var(--carbon)!important;border:0!important;box-shadow:inset 0 0 0 1px var(--hair2);color:var(--bright)!important;font-size:.98rem!important;padding:8px 14px!important}}
.tier-price{{font-family:{NUM}!important;font-variation-settings:"opsz" 11;font-weight:800!important;color:var(--bright)!important;-webkit-text-fill-color:currentColor!important;background:none!important;letter-spacing:-.005em!important}}
.tier-market,.tier-delivery,.tier-desc{{color:var(--steel)!important}}
.tier li,.tier-desc,.tier-market,.tier-delivery,.addon,.addon *{{font-size:.92rem!important;line-height:1.5!important}}
.tier-tag,.blog-date{{font-size:.85rem!important}}
.tier li::before{{content:""!important;width:8px;height:1px;background:var(--steel);top:.85em!important}}
table{{border-collapse:collapse}}
th{{background:var(--carbon)!important;color:var(--bright)!important;text-transform:none!important;letter-spacing:0!important}}
th,td{{border-color:var(--hair)!important}}
details{{border-radius:0!important}}
select,input,textarea{{font:400 1rem/1.4 {SANS}!important;color:var(--chrome)!important;background:var(--carbon)!important;border:0!important;border-radius:6px!important;box-shadow:inset 0 0 0 1px var(--hair2)}}
.fld label,.opt{{letter-spacing:0!important;text-transform:none!important;color:var(--chrome)!important}}
.opt{{border-radius:6px!important}}
.opt input{{margin:0 8px 0 0;vertical-align:-2px}}
.faq-item{{border-color:var(--hair)!important}}
.bk,.lg a{{letter-spacing:0!important;color:var(--steel)!important;text-decoration:none!important}}
/* project screenshots: the same chrome-edged bezel as the homepage */
.work-shot{{display:block;width:100%;max-width:760px;height:auto;aspect-ratio:16/10;object-fit:cover;object-position:top;margin:36px 0 14px;padding:8px;border-radius:12px;
  border:1px solid #9AA3A8;background:repeating-linear-gradient(45deg,rgba(255,255,255,.035) 0 2px,transparent 2px 6px),repeating-linear-gradient(-45deg,rgba(0,0,0,.35) 0 2px,transparent 2px 6px),var(--carbon)}}
.blog-hub .w>div[style*="border-bottom"]{{background:var(--carbon)!important;border:0!important;border-radius:10px;box-shadow:inset 0 0 0 1px var(--hair);padding:22px 24px!important;margin-bottom:12px}}
/* lower blocks on the service pages were a second design with inline styles */
.seo-body article{{background:none!important;border:0!important;padding:0!important;margin:56px auto 0!important;font-family:inherit!important;color:var(--chrome)!important}}
.seo-body article *{{font-family:inherit!important}}
.seo-body article>h2:first-child{{font-size:clamp(1.5rem,3vw,2.1rem)!important;color:var(--bright)!important;margin-top:0!important}}
.seo-body [style*="color:#00e5ff"],.seo-body [style*="color: #00e5ff"]{{color:var(--bright)!important}}
.seo-body [style*="border-radius"]{{border-radius:10px!important}}
.seo-body details{{border-bottom:1px solid var(--hair)}}
.seo-body div[style*="linear-gradient"]{{background:var(--carbon)!important;border:0!important;box-shadow:inset 0 0 0 1px var(--hair)}}
/* footer */
.ft{{border-top:1px solid var(--hair)!important;padding:36px 20px!important;text-align:center;font-size:.88rem!important;color:var(--steel)!important;margin-top:72px;background:none!important}}
.ft a{{text-decoration:underline}}.ft a{{color:var(--steel)!important;text-underline-offset:3px;text-decoration-color:var(--hair2)}}.ft a{{display:inline-block;min-height:24px;line-height:24px}}
.cs-legal-ft a{{padding:0 2px;border:0;background:none;border-radius:0;font-weight:inherit}}a.wa-float{{padding:0!important;border:0}}
.ft p{{margin:4px auto;max-width:none}}
/* phones */
@media(max-width:760px){{
  .hero-s{{padding:100px 16px 28px!important}}
  .js .nav>div{{display:none}}
  .js .nav .nav-toggle{{display:flex;flex-direction:column;justify-content:center;gap:5px;width:44px;height:44px;padding:0 13px;background:none;border:0;border-radius:6px;box-shadow:inset 0 0 0 1px var(--hair2);cursor:pointer;position:relative;z-index:1002}}
  .nav-toggle span{{display:block;height:2px;background:var(--chrome);transition:transform .2s,opacity .2s}}
  .js .nav.open>div{{display:flex;position:fixed;inset:0;z-index:1001;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:0;padding:88px 24px 32px;background:var(--graphite)}}
  .js .nav.open>div a{{font:600 1.5rem/1.2 {SANS}!important;letter-spacing:-.015em!important;color:var(--chrome)!important;padding:16px 0;border-bottom:1px solid var(--hair);text-align:left}}
  .js .nav.open>div a:last-child{{margin-top:24px;border:0;border-radius:6px;background:var(--ring);color:var(--ring-ink)!important;text-align:center;font-size:1.05rem!important;padding:15px}}
  .nav.open .nav-toggle span:nth-child(1){{transform:translateY(7px) rotate(45deg)}}
  .nav.open .nav-toggle span:nth-child(2){{opacity:0}}
  .nav.open .nav-toggle span:nth-child(3){{transform:translateY(-7px) rotate(-45deg)}}
  html:not(.js) .nav>div{{display:flex;flex-wrap:nowrap;overflow-x:auto;white-space:nowrap;max-width:70vw}}
}}
@media(prefers-reduced-motion:reduce){{.nav-toggle span,.cta{{transition:none}}}}
"""

NAV_JS = """<script id="cs-nav-js">(function(){var n=document.querySelector('nav.nav');if(!n)return;var d=n.querySelector(':scope>div');if(!d)return;
var bg=document.documentElement.lang==='bg',en=document.documentElement.lang==='en';var L={o:bg?'Отвори менюто':en?'Open menu':'Apri il menu',c:bg?'Затвори менюто':en?'Close menu':'Chiudi il menu'};
d.id=d.id||'cs-nav-links';var b=document.createElement('button');b.type='button';b.className='nav-toggle';b.setAttribute('aria-controls',d.id);b.setAttribute('aria-expanded','false');b.setAttribute('aria-label',L.o);b.innerHTML='<span></span><span></span><span></span>';n.appendChild(b);
function set(o){n.classList.toggle('open',o);b.setAttribute('aria-expanded',o?'true':'false');b.setAttribute('aria-label',o?L.c:L.o);document.body.style.overflow=o?'hidden':'';}
b.addEventListener('click',function(){set(!n.classList.contains('open'))});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&n.classList.contains('open')){set(false);b.focus();}});
d.addEventListener('click',function(e){if(e.target.closest('a'))set(false)});
var mq=window.matchMedia&&matchMedia('(min-width:761px)');if(mq){var f=function(){if(mq.matches&&n.classList.contains('open'))set(false)};mq.addEventListener?mq.addEventListener('change',f):mq.addListener(f);}})();</script>"""

FOOT = {
    "it": ('<div class="ft cs-legal-ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK 208725180 &middot; Bobov Dol, Bulgaria</p>'
           '<p><a href="/">Home</a> &middot; <a href="/prezzi/">Prezzi</a> &middot; <a href="/portfolio/">Portfolio</a> &middot; <a href="/privacy/">Privacy</a> &middot; '
           '<a href="/cookie/">Cookie</a> &middot; <a href="/termini/">Termini</a> &middot; <a href="/contatti/">Contatti</a></p></div>'),
    "en": ('<div class="ft cs-legal-ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK 208725180 &middot; Bobov Dol, Bulgaria</p>'
           '<p><a href="/en/">Home</a> &middot; <a href="/en/pricing/">Pricing</a> &middot; <a href="/en/portfolio/">Portfolio</a> &middot; <a href="/en/privacy/">Privacy</a> &middot; '
           '<a href="/en/cookie/">Cookie</a> &middot; <a href="/en/terms/">Terms</a> &middot; <a href="/en/contact/">Contact</a></p></div>'),
    "bg": ('<div class="ft cs-legal-ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK 208725180 &middot; Бобов дол, България</p>'
           '<p><a href="/bg/">Начало</a> &middot; <a href="/bg/ceni/">Цени</a> &middot; <a href="/bg/portfolio/">Портфолио</a> &middot; <a href="/bg/privacy/">Поверителност</a> &middot; '
           '<a href="/bg/cookie/">Бисквитки</a> &middot; <a href="/bg/usloviya/">Условия</a> &middot; <a href="/bg/kontakti/">Контакти</a></p></div>'),
}
# pages whose template has no footer of its own
NEEDS_FOOTER = {"privacy", "cookie", "termini", "terms", "usloviya", "404.html"}
BLOG_HUBS = {"public/blog/index.html", "public/en/blog/index.html", "public/bg/blog/index.html"}
SKIP = {"public/offline.html", "public/status/index.html"}  # the status page is its own dashboard

STRIP = [re.compile(r'<link id="cs-theme-fonts(?:-pre\d?)?"[^>]*>'), re.compile(r'<script id="cs-js-flag">.*?</script>', re.S),
         re.compile(r'<style id="cs-theme">.*?</style>', re.S), re.compile(r'<script id="cs-nav-js">.*?</script>', re.S),
         re.compile(r'<div class="ft cs-legal-ft">.*?</div>', re.S)]


H1CAPS = re.compile(r'(<h1[^>]*>)([^<a-zа-я]*[A-ZА-Я]{4,}[^<a-zа-я]*)(</h1>)')
KEEP = {"SEO", "GEO", "AEO", "ERP", "CRM", "API", "UE", "EU", "IT", "BG", "EN", "FAQ", "PMI", "UX", "UI"}


def sentence(t):
    words = t.split(" ")
    out = [w if w.strip("&,.:;!?()") in KEEP else w.lower() for w in words]
    first = next((i for i, w in enumerate(out) if w[:1].isalpha()), None)
    if first is not None and out[first] == words[first].lower():
        out[first] = out[first][:1].upper() + out[first][1:]
    return " ".join(out)


ARROW = re.compile(r'(<a\b[^>]*>)((?:(?!</a>)[^<])*?)\s*(?:&rarr;|&#8594;|→|↗|&nearr;)\s*(</a>)')


def lang_of(path, html):
    m = re.search(r'<html[^>]*lang="(it|en|bg)"', html)
    return m.group(1) if m else "it"


def theme(path, html):
    for rx in STRIP:
        html = rx.sub("", html)
    head_add = fonts(lang_of(path, html)) + JS_FLAG + '<style id="cs-theme">' + CSS + "</style>"
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
    # ALL-CAPS H1 ("BLOG & RISORSE", "PORTFOLIO") → sentence case; acronyms (SEO, ERP) stay as they are
    html = H1CAPS.sub(lambda m: m.group(1) + sentence(m.group(2)) + m.group(3), html)
    # no "→" tails on links and buttons (Carbon & Chrome: the link itself says where it goes)
    html = ARROW.sub(lambda m: m.group(1) + m.group(2).rstrip() + m.group(3), html)
    # horizontally scrollable tables must be reachable by keyboard (axe scrollable-region-focusable)
    label = {"it": "Tabella", "en": "Table", "bg": "Таблица"}[lang_of(path, html)]
    html = re.sub(r'<div class="(ctbl|table-wrap)">', lambda m: f'<div class="{m.group(1)}" tabindex="0" role="region" aria-label="{label}">', html)
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
