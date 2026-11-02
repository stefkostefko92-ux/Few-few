#!/usr/bin/env python3
"""Временно извън индекса на търсачките: noindex за цял хост в nginx на VPS-а (idempotent, с връщане).

За поддомейн, чийто код не е в това репо и който още не трябва да е в Google (tretimart.carbonstealth.eu:
canonical сочи tretimart.bg, който не съществува, а robots.txt сочи http://localhost/sitemap.xml).

Какво прави в HTTPS server блока на хоста:
  * `add_header X-Robots-Tag "noindex, follow" always;` на ниво server И във всеки location,
    който има свои add_header (nginx не наследява add_header в такъв location). В location без
    add_header се копират и заглавията на server блока — иначе HSTS и др. биха изчезнали там;
  * истински /robots.txt („Allow: /“ — за да виждат ботовете noindex-а; без грешния Sitemap).
Всеки вмъкнат ред носи маркер `# cs-seo-noindex`. Преди промяната — копие; след нея `nginx -t`,
reload и проверка с curl; при какъвто и да е провал — копието се връща и nginx се презарежда.

  sudo python3 deploy/seo-noindex-host.py tretimart.carbonstealth.eu          # прилага
  sudo python3 deploy/seo-noindex-host.py tretimart.carbonstealth.eu --undo   # маха (когато хостът трябва да е в Google)
"""
import glob
import os
import re
import shutil
import subprocess
import sys
import time

MARK = "# cs-seo-noindex"
CONF_GLOBS = ["/etc/nginx/sites-enabled/*", "/etc/nginx/conf.d/*.conf"]


def die(msg):
    print(f"\033[31m✘ {msg}\033[0m", file=sys.stderr)
    sys.exit(1)


def blocks(text, lo, hi):
    """Преки под-блокове `<header> { … }` в text[lo:hi] → (header_start, open, close); пропуска коментари и низове."""
    out, i, depth, start, hdr = [], lo, 0, None, lo
    while i < hi:
        c = text[i]
        if c == "#":
            i = text.find("\n", i)
            i = hi if i < 0 else i
            continue
        if c in "\"'":
            j = i + 1
            while j < hi and text[j] != c:
                j += 2 if text[j] == "\\" else 1
            i = j + 1
            continue
        if c == "{":
            if depth == 0:
                start = i
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                out.append((hdr, start, i))
                hdr = i + 1
        elif c == ";" and depth == 0:
            hdr = i + 1
        i += 1
    return out


def direct(text, open_, close):
    """Директивите на самия блок (без вложените блокове)."""
    inner, last = [], open_ + 1
    for h, o, c in blocks(text, open_ + 1, close):
        inner.append(text[last:h])
        last = c + 1
    inner.append(text[last:close])
    return re.sub(r"#[^\n]*", "", "".join(inner))


def server_blocks(text, host):
    res = []
    for h, o, c in blocks(text, 0, len(text)):
        if re.sub(r"#[^\n]*", "", text[h:o]).strip() != "server":
            continue
        d = direct(text, o, c)
        names = " ".join(re.findall(r"\bserver_name\s+([^;]+);", d)).split()
        if host in names and re.search(r"\blisten\s+[^;]*443", d):
            res.append((o, c))
    return res


def apply(text, host):
    srv = server_blocks(text, host)
    if not srv:
        return None
    for o, c in sorted(srv, reverse=True):          # отзад напред, за да не се местят индексите
        if MARK in text[o:c]:                        # вече приложено (всички вмъквания стават наведнъж)
            continue
        d = direct(text, o, c)
        server_hdrs = [l.strip() for l in d.splitlines() if l.strip().startswith("add_header")]
        ind = re.search(r"\n([ \t]+)\S", text[o:c])
        ind = ind.group(1) if ind else "    "
        edits = []
        for h, lo, lc in blocks(text, o + 1, c):
            head = re.sub(r"#[^\n]*", "", text[h:lo]).strip()
            if not head.startswith("location"):
                continue
            own = [l for l in direct(text, lo, lc).splitlines() if l.strip().startswith("add_header")]
            lines = ['add_header X-Robots-Tag "noindex, follow" always;']
            if not own:
                lines = server_hdrs + lines
            edits.append((lo + 1, "".join(f"\n{ind}{ind}{l} {MARK}" for l in lines)))
        has_robots = re.search(r"location\s+=\s*/robots\.txt\s*\{", text[o:c])
        top = f'\n{ind}add_header X-Robots-Tag "noindex, follow" always; {MARK}'
        if not has_robots:
            top += (f'\n{ind}location = /robots.txt {{ default_type text/plain; '
                    f'add_header X-Robots-Tag "noindex, follow" always; '
                    f'return 200 "User-agent: *\\nAllow: /\\n"; }} {MARK}')
        else:
            print(f"! {host}: вече има location = /robots.txt — оставям го както е")
        edits.append((o + 1, top))
        for pos, ins in sorted(edits, reverse=True):
            text = text[:pos] + ins + text[pos:]
    return text


def undo(text):
    return "\n".join(l for l in text.split("\n") if MARK not in l)


def sh(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def main():
    if len(sys.argv) < 2:
        die("Употреба: sudo python3 seo-noindex-host.py <host> [--undo]")
    host, rollback_only = sys.argv[1], "--undo" in sys.argv
    if os.geteuid() != 0:
        die("Пусни като root (sudo).")
    files = []
    for g in CONF_GLOBS:
        for f in glob.glob(g):
            real = os.path.realpath(f)
            if os.path.isfile(real) and real not in files:
                files.append(real)
    targets = {}
    for f in files:
        s = open(f, encoding="utf-8").read()
        new = undo(s) if rollback_only else apply(s, host)
        if new is not None and new != s and (rollback_only and MARK in s or not rollback_only):
            targets[f] = (s, new)
    if not targets:
        print(f"✔ {host}: няма какво да се променя (вече е направено или хостът не е намерен в nginx)")
        found = any(server_blocks(open(f, encoding='utf-8').read(), host) for f in files)
        sys.exit(0 if found or rollback_only else 1)
    bdir = f"/root/nginx-backup-{time.strftime('%Y%m%d-%H%M%S')}"
    os.makedirs(bdir, exist_ok=True)
    for f, (old, new) in targets.items():
        shutil.copy2(f, os.path.join(bdir, os.path.basename(f)))
        open(f, "w", encoding="utf-8").write(new)
        print(f"• {f} (копие: {bdir})")

    def restore(why):
        for f in targets:
            shutil.copy2(os.path.join(bdir, os.path.basename(f)), f)
        if sh("systemctl", "reload", "nginx").returncode != 0:
            sh("nginx", "-s", "reload")
        die(f"{why} — върнах предишния конфиг ({bdir}).")

    t = sh("nginx", "-t")
    if t.returncode != 0:
        restore("nginx -t не мина:\n" + t.stderr.strip())
    r = sh("systemctl", "reload", "nginx")
    if r.returncode != 0:                             # без systemd (контейнер) — сигнал направо към nginx
        r = sh("nginx", "-s", "reload")
    if r.returncode != 0:
        restore("reload на nginx не мина: " + r.stderr.strip())
    time.sleep(1)
    if not rollback_only:
        res = sh("curl", "-sk", "--noproxy", "*", "-o", "/dev/null", "-D", "-", "--resolve", f"{host}:443:127.0.0.1", f"https://{host}/")
        rob = sh("curl", "-sk", "--noproxy", "*", "--resolve", f"{host}:443:127.0.0.1", f"https://{host}/robots.txt")
        if "x-robots-tag: noindex" not in res.stdout.lower() or "localhost" in rob.stdout:
            restore("проверката след reload не намери noindex / robots.txt е още грешен")
        print(f"\033[32m✔ {host}: noindex за търсачките, robots.txt без localhost — nginx презареден\033[0m")
    else:
        print(f"\033[32m✔ {host}: noindex махнат — nginx презареден\033[0m")


if __name__ == "__main__":
    main()
