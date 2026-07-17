#!/usr/bin/env python3
"""Make the /test/ analyzer header homogeneous with the live SPA header:
same link set (Chi Siamo / Servizi / Portfolio / Reverse Lab / Contatti),
the cyan ANALISI pill, and an IT/EN/BG language switcher. Idempotent."""
import io

# Per-language nav config: (home, about, services, portfolio, lab, contact, test)
LANGS = {
    'public/test/index.html': dict(
        home='/', about='/chi-siamo/', services='/servizi/sviluppo-siti-web/',
        portfolio='/portfolio/', lab='/', contact='/contatti/', test='/test/',
        l_about='CHI SIAMO', l_services='SERVIZI', l_work='PORTFOLIO',
        l_lab='REVERSE LAB', l_contact='CONTATTI', l_test='ANALISI SITO',
        on='it'),
    'public/en/test/index.html': dict(
        home='/en/', about='/en/about/', services='/en/services/web-development/',
        portfolio='/en/portfolio/', lab='/en/', contact='/en/contact/', test='/en/test/',
        l_about='ABOUT', l_services='SERVICES', l_work='WORK',
        l_lab='REVERSE LAB', l_contact='CONTACT', l_test='SITE ANALYSIS',
        on='en'),
    'public/bg/test/index.html': dict(
        home='/bg/', about='/bg/za-nas/', services='/bg/uslugi/web-razrabotka/',
        portfolio='/bg/portfolio/', lab='/bg/', contact='/bg/kontakti/', test='/bg/test/',
        l_about='ЗА НАС', l_services='УСЛУГИ',
        l_work='ПОРТФОЛИО', l_lab='REVERSE LAB',
        l_contact='КОНТАКТИ',
        l_test='АНАЛИЗ НА САЙТ',
        on='bg'),
}

LOGO = ('<img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async">'
        '<span style="font-family:\'Inter Tight\',sans-serif;font-weight:900;'
        'letter-spacing:-.02em;color:#f5f5f0;font-size:14px">CARBON STEALTH</span>')

def new_nav(c):
    def cls(code): return ' class="on"' if code == c['on'] else ''
    return (
        '<nav>\n'
        '  <div class="row">\n'
        '    <a href="%(home)s" class="logo">%(logo)s</a>\n'
        '    <div class="nav-links">\n'
        '      <a href="%(about)s">%(l_about)s</a>\n'
        '      <a href="%(services)s">%(l_services)s</a>\n'
        '      <a href="%(portfolio)s">%(l_work)s</a>\n'
        '      <a href="%(lab)s">%(l_lab)s</a>\n'
        '      <a href="%(contact)s">%(l_contact)s</a>\n'
        '      <a href="%(test)s" class="active pill">%(l_test)s</a>\n'
        '      <span class="nav-lang">'
        '<a href="/test/"%(it)s>IT</a>'
        '<a href="/en/test/"%(en)s>EN</a>'
        '<a href="/bg/test/"%(bg)s>BG</a>'
        '</span>\n'
        '    </div>\n'
        '  </div>\n'
        '</nav>'
    ) % dict(c, logo=LOGO, it=cls('it'), en=cls('en'), bg=cls('bg'))

# CSS: old navbar block -> new (adds pill + lang switch, matches SPA border/colour)
OLD_CSS = (
    'nav .nav-links{display:flex;gap:18px;align-items:center}\n'
    'nav .nav-links a{color:#ccc;font-size:10px;letter-spacing:.2em;text-transform:uppercase}\n'
    'nav .nav-links a:hover{color:#00e5ff}\n'
    'nav .nav-links a.active{color:#00e5ff;border-bottom:1px solid rgba(0,229,255,.4);padding-bottom:2px}\n'
    'nav a.back{color:#999;text-decoration:none;font-size:10px;letter-spacing:.2em}\n'
    'nav a.back:hover{color:#00e5ff}\n'
    '@media(max-width:760px){nav .nav-links a:not(.active){display:none}}'
)
NEW_CSS = (
    'nav .nav-links{display:flex;gap:16px;align-items:center}\n'
    'nav .nav-links>a{color:#C9D1D6;font-size:9px;letter-spacing:.2em;text-transform:uppercase;transition:color .18s ease}\n'
    'nav .nav-links>a:hover{color:#00e5ff}\n'
    'nav .nav-links a.pill{color:#00e5ff;border:1px solid rgba(0,229,255,.35);padding:5px 10px}\n'
    'nav .nav-links a.pill:hover{background:rgba(0,229,255,.08)}\n'
    'nav .nav-lang{display:inline-flex;gap:5px;align-items:center}\n'
    'nav .nav-lang a{font-size:9px;letter-spacing:.12em;padding:3px 6px;color:#7C868D;border:1px solid rgba(245,245,240,.10)}\n'
    'nav .nav-lang a.on{color:#00e5ff;border-color:rgba(0,229,255,.4)}\n'
    '@media(max-width:760px){nav .nav-links>a:not(.active){display:none}}'
)
OLD_BORDER = 'border-bottom:1px solid rgba(0,229,255,0.1)}'
NEW_BORDER = 'border-bottom:1px solid rgba(245,245,240,.08)}'

def replace_nav(s):
    i = s.find('<nav>'); j = s.find('</nav>')
    if i == -1 or j == -1: return None
    return s[:i], s[j + len('</nav>'):]

def main():
    for path, cfg in LANGS.items():
        s = io.open(path, encoding='utf-8').read()
        if 'nav-lang' in s:
            print('skip (already homogeneous):', path); continue
        parts = replace_nav(s)
        if not parts:
            print('WARN no <nav> in', path); continue
        head, tail = parts
        s = head + new_nav(cfg) + tail
        if OLD_CSS in s:
            s = s.replace(OLD_CSS, NEW_CSS)
        else:
            print('WARN nav CSS block not matched in', path)
        s = s.replace(OLD_BORDER, NEW_BORDER)
        io.open(path, 'w', encoding='utf-8').write(s)
        print('patched header:', path)

if __name__ == '__main__':
    main()
