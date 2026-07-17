#!/usr/bin/env python3
"""Make the /test/ analyzer header PIXEL-IDENTICAL to the live SPA nav:
blinking cyan square + logo (no wordmark), centred Space Mono links, the
cyan ANALISI pill, live FPS/battery/clock telemetry, and IT/EN/BG switch.
Replaces whatever nav is there (original or a previous patch). Idempotent."""
import io, os, re

NAV_CSS = (
"/* ═══ NAVBAR (matches live SPA) ═══ */\n"
"nav{position:fixed;top:0;left:0;right:0;z-index:10000;padding:12px 20px;display:flex;"
"justify-content:space-between;align-items:center;background:rgba(0,0,0,.85);"
"backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);"
"border-bottom:1px solid rgba(245,245,240,.08);font-family:'Space Mono',monospace}\n"
"nav .cs-left{display:flex;align-items:center;gap:8px}\n"
"nav .cs-blink{width:8px;height:8px;background:#00e5ff;animation:blink 1s steps(1) infinite}\n"
"@keyframes blink{50%{opacity:.3}}\n"
"nav .cs-left img{height:28px;object-fit:contain;filter:drop-shadow(0 0 6px rgba(0,229,255,.3))}\n"
"nav .cs-nav-links{display:flex;gap:20px;align-items:center}\n"
"nav .cs-nav-links a{color:#C9D1D6;font-size:9px;letter-spacing:.2em;text-transform:uppercase;"
"text-decoration:none;white-space:nowrap;transition:color .18s ease}\n"
"nav .cs-nav-links a:hover{color:#00e5ff}\n"
"nav .cs-nav-links a.pill{color:#00e5ff;border:1px solid rgba(0,229,255,.3);padding:5px 10px}\n"
"nav .cs-right{display:flex;gap:10px;align-items:center}\n"
"nav .cs-meta{font-size:9px;color:#ccc;white-space:nowrap;font-variant-numeric:tabular-nums}\n"
"nav .cs-nav-lang{display:flex;gap:2px;margin-left:8px}\n"
"nav .cs-nav-lang a{font-size:8px;padding:3px 6px;letter-spacing:.1em;text-transform:uppercase;"
"text-decoration:none;color:#ccc;border:1px solid rgba(245,245,240,.06)}\n"
"nav .cs-nav-lang a.on{background:rgba(0,229,255,.15);color:#00e5ff;"
"border-color:rgba(0,229,255,.3);font-weight:700}\n"
"@media(max-width:820px){nav .cs-nav-links a:not(.pill){display:none}nav .cs-meta{display:none}}\n"
"\n"
)

TELEMETRY = (
"<script>(function(){var f=document.getElementById('cs-fps'),t=document.getElementById('cs-time'),"
"b=document.getElementById('cs-bat');function ck(){t.textContent=new Date().toLocaleTimeString("
"'en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}ck();setInterval(ck,1000);"
"var fr=[];function lp(){var n=performance.now();fr.push(n);fr=fr.filter(function(x){return n-x<1000});"
"f.textContent=fr.length+'FPS';requestAnimationFrame(lp)}requestAnimationFrame(lp);"
"if(navigator.getBattery){navigator.getBattery().then(function(bt){function u(){"
"b.textContent=Math.round(bt.level*100)+'%'+(bt.charging?' CHG':'');b.style.display=''}u();"
"bt.addEventListener('levelchange',u);bt.addEventListener('chargingchange',u)})}})();</script>"
)

LANGS = {
    'public/test/index.html': dict(home='/', on='it',
        links=[('/#about','CHI SIAMO'),('/#services','SERVIZI'),('/#portfolio','PORTFOLIO'),
               ('/#lab','REVERSE LAB'),('/#contact','CONTATTI')],
        test='/test/', l_test='ANALISI SITO'),
    'public/en/test/index.html': dict(home='/en/', on='en',
        links=[('/en/#about','ABOUT'),('/en/#services','SERVICES'),('/en/#portfolio','WORK'),
               ('/en/#lab','REVERSE LAB'),('/en/#contact','CONTACT')],
        test='/en/test/', l_test='SITE ANALYSIS'),
    'public/bg/test/index.html': dict(home='/bg/', on='bg',
        links=[('/bg/#about','ЗА НАС'),('/bg/#services','УСЛУГИ'),
               ('/bg/#portfolio','ПОРТФОЛИО'),('/bg/#lab','REVERSE LAB'),
               ('/bg/#contact','КОНТАКТИ')],
        test='/bg/test/', l_test='АНАЛИЗ НА САЙТ'),
}

def build_nav(c):
    links = ''.join('      <a href="%s">%s</a>\n' % (h, txt) for h, txt in c['links'])
    lang = ''.join('<a href="%s"%s>%s</a>' % (u, ' class="on"' if k == c['on'] else '', k.upper())
                   for k, u in [('it','/test/'),('en','/en/test/'),('bg','/bg/test/')])
    return (
        '<nav>\n'
        '  <div class="cs-left"><div class="cs-blink"></div>'
        '<img src="/logo.png" alt="Carbon Stealth VCC"></div>\n'
        '  <div class="cs-nav-links">\n'
        + links +
        '      <a href="%s" class="pill">%s</a>\n' % (c['test'], c['l_test']) +
        '  </div>\n'
        '  <div class="cs-right">\n'
        '    <span class="cs-meta" id="cs-fps">60FPS</span>\n'
        '    <span class="cs-meta" id="cs-bat" style="display:none"></span>\n'
        '    <span class="cs-meta" id="cs-time">00:00:00</span>\n'
        '    <div class="cs-nav-lang">' + lang + '</div>\n'
        '  </div>\n'
        '</nav>\n' + TELEMETRY
    )

def main():
    for path, cfg in LANGS.items():
        if not os.path.isfile(path):
            print('skip (missing):', path); continue
        s = io.open(path, encoding='utf-8').read()
        # 1. Replace the whole nav CSS region (from `nav{position:fixed` up to the HERO comment).
        s2 = re.sub(r'nav\{position:fixed.*?(?=/\*[^\n]*HERO)', NAV_CSS, s, count=1, flags=re.S)
        if s2 == s:
            print('WARN nav CSS region not found:', path)
        s = s2
        # 2. Replace the <nav> block (+ any telemetry script we previously added).
        i = s.find('<nav>'); j = s.find('</nav>')
        if i < 0 or j < 0:
            print('WARN no <nav> in', path); continue
        tail = s[j + len('</nav>'):]
        # strip an old telemetry script if present right after </nav>
        tail = re.sub(r'^\s*<script>\(function\(\)\{var f=document\.getElementById\(\'cs-fps\'\).*?</script>', '', tail, count=1, flags=re.S)
        s = s[:i] + build_nav(cfg) + tail
        io.open(path, 'w', encoding='utf-8').write(s)
        print('header -> SPA-identical:', path)

if __name__ == '__main__':
    main()
