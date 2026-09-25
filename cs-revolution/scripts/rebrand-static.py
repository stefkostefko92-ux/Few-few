#!/usr/bin/env python3
"""Ребрандиране на статичните страници по новото лого — идемпотентно.

Прилага се и върху генерираните public/**/index.html, и върху шаблоните в
scripts/generate-*.py, така че регенерация да не върне стария вид.

Какво сменя (нищо друго):
  * логото в навигацията: 24px → 30px (новият lockup е 2.35:1, като стария,
    затова width/height остават в същото съотношение: 56×24 → 70×30);
  * тънката линия под навигацията: циан 10% → 22% + мек циан ореол (мотивът
    на светещия пръстен от логото).
Пуска се без аргументи от cs-revolution/. Повторно пускане не променя нищо.
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RULES = [
    # (какво, с какво) — обикновени низове, без regex, за да са предвидими
    ('.nav img{height:24px}',
     '.nav img{height:30px;filter:drop-shadow(0 0 6px rgba(0,229,255,.28))}'),
    ('border-bottom:1px solid rgba(0,229,255,.1);padding:12px 20px;z-index:1000;',
     'border-bottom:1px solid rgba(0,229,255,.22);box-shadow:0 1px 18px rgba(0,229,255,.1);padding:12px 20px;z-index:1000;'),
    ('<img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24"',
     '<img src="/logo.png" alt="Carbon Stealth VCC" width="70" height="30"'),
    # the geo / service-city generators wrote the logo without dimensions (layout shift)
    ('<img src="/logo.png" alt="Carbon Stealth VCC">', '<img src="/logo.png" alt="Carbon Stealth VCC" width="70" height="30">'),
]
# Ценоразписът (scripts/generate-pricing.py) получава място в навигацията, точно преди
# контактите. (пазач, какво, с какво): прилага се САМО ако пазачът липсва във файла —
# новият низ съдържа стария като опашка, иначе всяко пускане би добавяло линк.
GUARDED = [
    # футър: подчертани линкове (axe link-in-text-block) и контраст на текста (#666 → #8a949b)
    ('.ft a{text-decoration:underline}', 'font-size:9px;color:#666;margin-top:60px}',
     'font-size:9px;color:#8a949b;margin-top:60px}.ft a{text-decoration:underline}'),
    ('.ft a{text-decoration:underline}', '.ft{', '.ft a{text-decoration:underline}.ft{'),
    ('href="/prezzi/"', '<a href="/contatti/">CONTATTI</a></div></nav>',
     '<a href="/prezzi/">PREZZI</a><a href="/contatti/">CONTATTI</a></div></nav>'),
    ('href="/en/pricing/"', '<a href="/en/contact/">CONTACT</a></div></nav>',
     '<a href="/en/pricing/">PRICING</a><a href="/en/contact/">CONTACT</a></div></nav>'),
    ('href="/bg/ceni/"', '<a href="/bg/kontakti/">КОНТАКТИ</a></div></nav>',
     '<a href="/bg/ceni/">ЦЕНИ</a><a href="/bg/kontakti/">КОНТАКТИ</a></div></nav>'),
]


def rebrand(path):
    with open(path, encoding='utf-8') as f:
        src = f.read()
    out = src
    for a, b in RULES:
        out = out.replace(a, b)
    for guard, a, b in GUARDED:
        if guard not in out:
            out = out.replace(a, b)
    if out != src:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(out)
        return True
    return False


def main():
    targets = sorted(glob.glob(os.path.join(ROOT, 'public', '**', 'index.html'), recursive=True))
    targets += sorted(glob.glob(os.path.join(ROOT, 'scripts', 'generate-*.py')))
    changed = sum(rebrand(p) for p in targets)
    print(f'проверени {len(targets)} файла, променени {changed}')
    # Проверка: нито една страница не е останала със стария размер на логото
    stale = [p for p in targets if p.endswith('.html') and 'width="56" height="24"' in open(p, encoding='utf-8').read()]
    # Проверка: всяка страница с навигация има линк към цените
    stale += [p for p in targets if p.endswith('.html') and 'class="nav"' in open(p, encoding='utf-8').read()
              and not any(u in open(p, encoding='utf-8').read() for u in ('/prezzi/', '/en/pricing/', '/bg/ceni/'))]
    if stale:
        print('ОСТАНАЛИ със стар размер:', *stale[:5], sep='\n  ')
        sys.exit(1)


if __name__ == '__main__':
    main()
