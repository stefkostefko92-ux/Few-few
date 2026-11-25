#!/usr/bin/env python3
"""„Прочети още“ под всяка статия от блога: 3 най-близки по тема статии на същия език (idempotent).

Одитът (02.11.2026) показа, че 31 от 90-те статии имат най-много един линк от текста на друга
страница — стигат се само през хъба /blog/ и менюто, а Google разбира темата на страница и
по това кой и с какъв текст я свързва. Блокът е между <!--cs-related--> и <!--/cs-related-->,
стои точно преди футъра и се пресмята наново при всяко пускане.

Близост = общи значещи думи в заглавието, подзаглавията и текста (думите, които са в почти
всяка статия на езика — „сайт“, „бизнес“ — не се броят).

Стъпка от веригата след генераторите (виж CLAUDE.md). Пуска се от cs-revolution/:
  python3 scripts/related-posts.py
"""
import glob
import html
import math
import os
import re
from collections import Counter

BLOGS = {"it": ("public/blog", "/blog/"), "en": ("public/en/blog", "/en/blog/"), "bg": ("public/bg/blog", "/bg/blog/")}
HEAD = {"it": "Leggi anche", "en": "Read next", "bg": "Прочети още"}
MARK = re.compile(r"<!--cs-related-->.*?<!--/cs-related-->\n?", re.S)
FOOTER = '<div class="ft">'
N = 3


def text_of(s):
    s = MARK.sub("", s)
    body = s[s.find("<body"):s.find(FOOTER)] if FOOTER in s else s
    body = re.sub(r"<(script|style|nav|noscript)\b.*?</\1>", " ", body, flags=re.S)
    return html.unescape(re.sub(r"<[^>]+>", " ", body))


def title_of(s):
    m = re.search(r"<h1[^>]*>(.*?)</h1>", s, re.S) or re.search(r"<title>(.*?)</title>", s, re.S)
    t = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip()
    return re.sub(r"\s*\|\s*Carbon Stealth.*$", "", t)


def words(t):
    return [w for w in re.findall(r"\w+", t.lower()) if len(w) > 3 and not w.isdigit()]


def block(lang, items):
    li = "".join(
        f'<li style="margin:0 0 10px"><a href="{href}" style="color:#00e5ff;text-decoration:none">{html.escape(title)} &rarr;</a></li>'
        for href, title in items)
    return ('<!--cs-related--><section class="cs-related" style="max-width:800px;margin:8px auto 40px;padding:0 24px">'
            f'<h2 style="font-size:18px;letter-spacing:.04em;margin:0 0 14px">{HEAD[lang]}</h2>'
            f'<ul style="list-style:none;padding:0;margin:0;line-height:1.5">{li}</ul></section><!--/cs-related-->\n')


def run(lang, folder, prefix):
    posts = {}
    for f in sorted(glob.glob(os.path.join(folder, "*", "index.html"))):
        s = open(f, encoding="utf-8").read()
        if FOOTER not in s or 'noindex' in (re.search(r'<meta name="robots" content="([^"]*)"', s) or [None, ""])[1]:
            continue
        slug = os.path.basename(os.path.dirname(f))
        t = title_of(s)
        posts[slug] = (f, s, t, Counter(words(t) * 4 + words(text_of(s))))
    df = Counter(w for *_, c in posts.values() for w in set(c))
    common = {w for w, n in df.items() if n > 0.4 * len(posts)}
    idf = {w: math.log(len(posts) / n) for w, n in df.items()}

    def vec(c):
        return {w: (1 + math.log(n)) * idf[w] for w, n in c.items() if w not in common}

    vecs = {k: vec(v[3]) for k, v in posts.items()}
    norm = {k: math.sqrt(sum(x * x for x in v.values())) or 1 for k, v in vecs.items()}
    changed = 0
    for slug, (f, s, _, _) in posts.items():
        a = vecs[slug]
        score = sorted(((sum(a[w] * b.get(w, 0) for w in a) / (norm[slug] * norm[o]), o)
                        for o, b in vecs.items() if o != slug), reverse=True)[:N]
        new = MARK.sub("", s)
        new = new.replace(FOOTER, block(lang, [(prefix + o + "/", posts[o][2]) for _, o in score]) + FOOTER, 1)
        if new != s:
            open(f, "w", encoding="utf-8").write(new)
            changed += 1
    return len(posts), changed


def main():
    for lang, (folder, prefix) in BLOGS.items():
        n, c = run(lang, folder, prefix)
        print(f"related-posts [{lang}]: {n} статии, променени {c}")


if __name__ == "__main__":
    main()
