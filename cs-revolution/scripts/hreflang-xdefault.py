#!/usr/bin/env python3
"""x-default → английската версия на всяка страница (idempotent).

hreflang="x-default" е версията, която Google показва на човек, чийто език не е сред
it/en/bg — германец, французин, холандец, испанец. Досега сочеше италианската страница,
а за Европа общият език е английският. Италианците (it), българите (bg) и англоговорящите (en)
продължават да получават своята версия; променя се само това, което виждат всички останали.

Стъпка от веригата след генераторите (виж CLAUDE.md). Пуска се от cs-revolution/:
  python3 scripts/hreflang-xdefault.py
"""
import glob
import re

XD = re.compile(r'(<link rel="alternate" hreflang="x-default" href=")([^"]+)(")')
EN = re.compile(r'<link rel="alternate" hreflang="en" href="([^"]+)"')


def fix(path):
    s = open(path, encoding="utf-8").read()
    en = EN.search(s)
    if not en or not XD.search(s):
        return False
    new = XD.sub(lambda m: m.group(1) + en.group(1) + m.group(3), s)
    if new == s:
        return False
    open(path, "w", encoding="utf-8").write(new)
    return True


def main():
    files = ["index.html"] + glob.glob("public/**/*.html", recursive=True)
    changed = sum(fix(f) for f in files)
    print(f"hreflang-xdefault: x-default → en на {changed} страници (от {len(files)})")


if __name__ == "__main__":
    main()
