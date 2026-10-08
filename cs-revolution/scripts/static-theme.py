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
  * <script id="cs-cal-js"> — шублерът (челюсти около посочения елемент + размер) и лампата по
    хромовото h1; само при мишка и без reduced-motion. CSS: лента за прочетеното, размерна
    линия под h2, сонда по ръба на картите, сканиране на снимките (scroll/view timelines);
  * футър на правните страници и 404, които нямаха такъв.

Идемпотентно: при повторно пускане старите блокове се махат и се слагат наново, така
че промяна тук стига до всички страници с едно пускане. Пуска се от cs-revolution/:
    python3 scripts/static-theme.py
Мястото му във веригата е след генераторите и inject-widgets.py (виж CLAUDE.md).
"""
import glob
import os
import re

FONTS = ('<link id="cs-theme-fonts" rel="stylesheet" href="/fonts/fonts.css">'
         # the two faces every page paints first: fetched with the CSS, so the swap lands before first paint (CLS)
         '<link id="cs-theme-fonts-pre" rel="preload" as="font" type="font/woff2" href="/fonts/space-grotesk-latin-ecea81.woff2" crossorigin>'
         '<link id="cs-theme-fonts-pre2" rel="preload" as="font" type="font/woff2" href="/fonts/space-mono-latin-e04b1d.woff2" crossorigin>'
         '<link id="cs-theme-fonts-pre3" rel="preload" as="font" type="font/woff2" href="/fonts/space-mono-latin-0319ea.woff2" crossorigin>')  # self-hosted (scripts/self-host-fonts.py)
JS_FLAG = '<script id="cs-js-flag">document.documentElement.classList.add("js")</script>'

DISP = "'Space Grotesk','Onest','SG-fallback','Inter Tight',-apple-system,sans-serif"
MONO = "'Space Mono','JetBrains Mono','SM-fallback',ui-monospace,monospace"
CHROME = ("background-image:linear-gradient(100deg,transparent calc(var(--sx,-40%) - 9%),rgba(0,229,255,calc(var(--sa,0) * .28)) calc(var(--sx,-40%) - 5%),"
          "rgba(255,255,255,var(--sa,0)) calc(var(--sx,-40%) - 1.5%),rgba(255,255,255,var(--sa,0)) calc(var(--sx,-40%) + 1.5%),"
          "rgba(0,229,255,calc(var(--sa,0) * .28)) calc(var(--sx,-40%) + 5%),transparent calc(var(--sx,-40%) + 9%)),"
          "linear-gradient(180deg,#F4F7F8 0%,#D6DDE1 38%,#8E989F 50%,#E4E9EC 58%,#F4F7F8 100%);"
          "background-size:100% 100%,100% 1lh;background-repeat:no-repeat,repeat-y;-webkit-background-clip:text;background-clip:text;"
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
.w p a,.w li a,.faq-a a,.seo-body p a,.seo-body li a{{text-decoration:underline!important;text-decoration-thickness:1px;text-underline-offset:3px}}
.w .cta,.w .btn,.w a.cta{{text-decoration:none}}
.card,.tier,.cell,.addon,.vat article,.cta-box,details,.tag-list a,.sect a{{border-radius:2px!important}}
.cta{{background:rgba(0,229,255,.05);box-shadow:0 0 22px rgba(0,229,255,.22),inset 0 0 14px rgba(0,229,255,.06);transition:box-shadow .3s,background .3s}}
.cta:hover,.cta:focus-visible{{background:rgba(0,229,255,.1);box-shadow:0 0 34px rgba(0,229,255,.42),inset 0 0 18px rgba(0,229,255,.1)}}
:focus-visible{{outline:2px solid var(--cs-c);outline-offset:2px}}
/* navigation */
.nav{{background:rgba(10,12,14,.94)!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}}
.nav img{{height:34px!important;width:auto!important}}
.nav>div a{{display:inline-block;padding:7px 0}}
/* last nav link (Contatti / Contact / Контакти) = the call to action, like the SPA's ring-glow CTA */
@media(min-width:761px){{.nav>div a:last-child{{padding:7px 14px;border:1px solid rgba(0,229,255,.55);color:var(--cs-c)!important;box-shadow:0 0 16px rgba(0,229,255,.18);letter-spacing:.2em}}.nav>div a:last-child:hover{{background:rgba(0,229,255,.08)}}}}
/* portfolio: screenshots were 860px wide one after another; tighter and paired with their text */
.w>.work-shot{{max-width:720px}}
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
/* 404: the added legal footer was a flex sibling of the centred box, so the box sat in the left half */
body:has(>.cs-legal-ft){{flex-direction:column}}
/* ── instruments (visual pass 2026-10, same system as the homepage — src/Instruments.jsx) ── */
@property --sx{{syntax:'<percentage>';inherits:false;initial-value:-40%}}
@property --sa{{syntax:'<number>';inherits:false;initial-value:0}}
@property --trace{{syntax:'<angle>';inherits:false;initial-value:0deg}}
/* the lamp: one glint across the chrome h1 when the page opens, then it follows the pointer (cs-cal-js) */
h1{{animation:csGlint 1.5s cubic-bezier(.22,1,.36,1) .35s 1;transition:--sx .45s cubic-bezier(.22,1,.36,1),--sa .6s}}
@keyframes csGlint{{0%{{--sx:-40%;--sa:1}}100%{{--sx:140%;--sa:1}}}}
/* reading gauge: a cyan carriage across the top that measures how far you have read (CSS scroll timeline, no JS) */
body::after{{content:'';position:fixed;left:0;right:0;top:0;height:2px;z-index:1004;pointer-events:none;background:#00e5ff;box-shadow:0 0 8px rgba(0,229,255,.7);transform-origin:left;transform:scaleX(0)}}
@supports (animation-timeline:scroll()){{body::after{{animation:csRead linear both;animation-timeline:scroll(root)}}}}
@keyframes csRead{{to{{transform:scaleX(1)}}}}
/* section headings carry a dimension line drawn as the heading scrolls in; ranges end at
   'entry 100%' so anything fully on screen (even on a page too short to scroll) is complete */
.w>h2::after,.seo-body article>h2::after{{content:'';display:block;width:72px;height:1px;margin-top:12px;background:linear-gradient(90deg,#00e5ff,rgba(0,229,255,.1));transform-origin:left}}
@supports (animation-timeline:view()){{.w>h2::after,.seo-body article>h2::after{{animation:csDimL linear both;animation-timeline:view();animation-range:entry 0% entry 100%}}
  .work-shot{{animation:csScanIn linear both;animation-timeline:view();animation-range:entry 0% entry 100%}}}}
@keyframes csDimL{{from{{transform:scaleX(0)}}to{{transform:scaleX(1)}}}}
@keyframes csScanIn{{from{{clip-path:inset(0 0 100% 0);filter:saturate(0) brightness(1.3)}}to{{clip-path:inset(0 0 0 0);filter:none}}}}
/* cards: a probe traces the outline while pointed at */
.card{{position:relative}}
.card::before,.tier::before{{content:'';position:absolute;inset:-1px;padding:1px;pointer-events:none;opacity:0;transition:opacity .3s;
  background:conic-gradient(from var(--trace),transparent 0 72%,rgba(0,229,255,.2) 82%,#00e5ff 90%,transparent 91%);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}}
.card:hover::before,.card:focus-visible::before,.tier:hover::before{{opacity:1;animation:csTrace 2.4s linear infinite}}
@keyframes csTrace{{to{{--trace:360deg}}}}
/* caliper cursor: the jaws close on whatever you point at and read its size */
.cs-caliper{{position:fixed;inset:0;pointer-events:none;z-index:2147483000}}
.cs-caliper i{{position:fixed;left:0;top:0;opacity:0;transition:transform .32s cubic-bezier(.22,1,.36,1),height .32s cubic-bezier(.22,1,.36,1),width .32s cubic-bezier(.22,1,.36,1),opacity .2s}}
.cs-caliper .jl,.cs-caliper .jr{{width:6px;border:1px solid #00e5ff}}.cs-caliper .jl{{border-right:0}}.cs-caliper .jr{{border-left:0}}
.cs-caliper .dm{{height:1px;background:rgba(0,229,255,.55)}}
.cs-caliper .dm::before,.cs-caliper .dm::after{{content:'';position:absolute;top:-3px;width:1px;height:7px;background:#00e5ff}}.cs-caliper .dm::before{{left:0}}.cs-caliper .dm::after{{right:0}}
.cs-caliper .dm b{{position:absolute;left:50%;top:-15px;transform:translateX(-50%);font:400 8px/1 {MONO};letter-spacing:.14em;color:#00e5ff;background:rgba(10,12,14,.9);padding:2px 5px;white-space:nowrap}}
.cs-caliper.on i{{opacity:.9}}
@media(hover:none),(pointer:coarse){{.cs-caliper{{display:none}}}}
@media(prefers-reduced-motion:reduce){{h1,.card::before,.tier::before,.work-shot,.w>h2::after,.seo-body article>h2::after,body::after{{animation:none!important}}body::after{{display:none}}}}
"""

NAV_JS = """<script id="cs-nav-js">(function(){var n=document.querySelector('nav.nav');if(!n)return;var d=n.querySelector(':scope>div');if(!d)return;
var bg=document.documentElement.lang==='bg',en=document.documentElement.lang==='en';var L={o:bg?'Отвори менюто':en?'Open menu':'Apri il menu',c:bg?'Затвори менюто':en?'Close menu':'Chiudi il menu'};
d.id=d.id||'cs-nav-links';var b=document.createElement('button');b.type='button';b.className='nav-toggle';b.setAttribute('aria-controls',d.id);b.setAttribute('aria-expanded','false');b.setAttribute('aria-label',L.o);b.innerHTML='<span></span><span></span><span></span>';n.appendChild(b);
function set(o){n.classList.toggle('open',o);b.setAttribute('aria-expanded',o?'true':'false');b.setAttribute('aria-label',o?L.c:L.o);document.body.style.overflow=o?'hidden':'';}
b.addEventListener('click',function(){set(!n.classList.contains('open'))});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&n.classList.contains('open')){set(false);b.focus();}});
d.addEventListener('click',function(e){if(e.target.closest('a'))set(false)});
var mq=window.matchMedia&&matchMedia('(min-width:761px)');if(mq){var f=function(){if(mq.matches&&n.classList.contains('open'))set(false)};mq.addEventListener?mq.addEventListener('change',f):mq.addListener(f);}})();</script>"""

CAL_JS = """<script id="cs-cal-js">(function(){if(!(window.matchMedia&&matchMedia('(hover:hover) and (pointer:fine)').matches)||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
var w=document.createElement('div');w.className='cs-caliper';w.setAttribute('aria-hidden','true');w.innerHTML='<i class="jl"></i><i class="jr"></i><i class="dm"><b></b></i>';document.body.appendChild(w);
var jl=w.children[0],jr=w.children[1],dm=w.children[2],lb=dm.firstChild,t=null,r=0,px=-1e4,py=-1e4,h=document.querySelector('h1');
function place(){r=0;if(h){var b=h.getBoundingClientRect();if(b.bottom>0&&b.width){h.style.setProperty('--sx',Math.max(-40,Math.min(140,(px-b.left)/b.width*100)).toFixed(1)+'%');h.style.setProperty('--sa',Math.max(0,1-Math.max(0,Math.abs(py-b.top-b.height/2)-b.height/2)/260).toFixed(2));}}
if(!t||!t.isConnected){w.classList.remove('on');return}var q=t.getBoundingClientRect(),g=5,top=q.top-g,hh=q.height+g*2;if(q.width<2){w.classList.remove('on');return}
jl.style.transform='translate('+(q.left-g-6)+'px,'+top+'px)';jr.style.transform='translate('+(q.right+g)+'px,'+top+'px)';jl.style.height=jr.style.height=hh+'px';
var up=q.top>34;dm.style.transform='translate('+(q.left-g)+'px,'+(up?top-9:q.bottom+g+8)+'px)';dm.style.width=(q.width+g*2)+'px';lb.style.top=up?'-15px':'5px';lb.textContent=Math.round(q.width)+' \u00d7 '+Math.round(q.height);w.classList.add('on')}
function k(){if(!r)r=requestAnimationFrame(place)}
document.addEventListener('pointerover',function(e){t=e.target.closest&&e.target.closest('a,button,[role=button],input,textarea,select,summary,label');k()},{passive:true});
document.addEventListener('pointermove',function(e){px=e.clientX;py=e.clientY;k()},{passive:true});addEventListener('scroll',k,{passive:true});
document.documentElement.addEventListener('pointerleave',function(){t=null;w.classList.remove('on')})})();</script>"""

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
         re.compile(r'<div class="ft cs-legal-ft">.*?</div>', re.S), re.compile(r'<script id="cs-cal-js">.*?</script>', re.S)]


LEGAL = {"it": ("/termini/", "Termini", "/note-legali/", "Note legali"),
         "en": ("/en/terms/", "Terms", "/en/legal-notice/", "Legal notice"),
         "bg": ("/bg/usloviya/", "Условия", "/bg/imprint/", "Правни данни")}


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
    html = html.replace("</body>", CAL_JS + "</body>", 1)
    # footer: "Terms" label in the page's own language, and a link to the legal notice (impressum),
    # which the law wants one click away from every page (audit 2026-10-05: only 9 pages linked it)
    lg = lang_of(path, html)
    terms, tlabel, notice, nlabel = LEGAL[lg]
    if lg != "en":
        html = html.replace(f'<a href="{terms}">Terms</a>', f'<a href="{terms}">{tlabel}</a>')
    if f'href="{notice}"' not in html:
        html = re.sub(rf'((?:Cookie|Cookies|Бисквитки)</a> &middot; <a href="{re.escape(terms)}">{re.escape(tlabel)}</a>)',
                      lambda m: m.group(1) + f' &middot; <a href="{notice}">{nlabel}</a>', html, count=1)
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
