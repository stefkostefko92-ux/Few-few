#!/usr/bin/env python3
"""Finalize static pages: inject the WhatsApp float + service-worker registration
+ a11y CSS (focus-visible, prefers-reduced-motion) before </body>.

Idempotent — skips pages that already have it. Run after regenerating any
static cluster:  python3 scripts/inject-widgets.py
(The SPA shell handles these itself via src/main.jsx + App.jsx.)
"""
import glob, os

WA_PATH = ("M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.1 1.6 5.9L4 29l8.3-1.6c1.7.9 3.6 1.4 5.7 1.4 "
           "6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7.7.7-3.6-.2-.4"
           "c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.5-9.9 10-9.9s10 4.4 10 9.9-4.5 10.2-9.9 10.2zm5.5-7.4"
           "c-.3-.2-1.8-.9-2-.9-.3-.1-.5-.2-.7.2-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5"
           "-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.2-.2.2-.3.3-.5.1-.2.1-.4 0-.5"
           "-.1-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1"
           "c.2.2 2.1 3.3 5.2 4.6.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.5.3-.7.3-1.4.2-1.5"
           "-.1-.2-.3-.2-.6-.4z")

SNIPPET = (
    '<style>:focus-visible{outline:2px solid #00e5ff;outline-offset:2px}'
    '.wa-float{position:fixed;right:20px;bottom:20px;z-index:9998;width:56px;height:56px;border-radius:50%;'
    'background:#25D366;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(37,211,102,.35);transition:transform .18s ease}'
    '.wa-float:hover{transform:scale(1.08)}'
    '@media(prefers-reduced-motion:reduce){*{animation:none !important;transition-duration:.001ms !important;scroll-behavior:auto !important}}</style>'
    '<a class="wa-float" href="https://wa.me/393792969699" target="_blank" rel="noopener" aria-label="WhatsApp">'
    '<svg width="30" height="30" viewBox="0 0 32 32" fill="#fff" aria-hidden="true"><path d="' + WA_PATH + '"/></svg></a>'
    "<script>if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}</script>"
)

MARKER = 'class="wa-float"'
SKIP = {'offline.html'}

def main():
    n = 0
    for f in glob.glob('public/**/*.html', recursive=True):
        if os.path.basename(f) in SKIP:
            continue
        s = open(f, encoding='utf-8').read()
        if MARKER in s or '</body>' not in s:
            continue
        idx = s.rfind('</body>')
        s = s[:idx] + SNIPPET + s[idx:]
        open(f, 'w', encoding='utf-8').write(s)
        n += 1
    print(f'injected widgets into {n} static pages')

if __name__ == '__main__':
    main()
