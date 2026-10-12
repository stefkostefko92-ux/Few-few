// provision-chatchat.test.mjs — deploy/provision/chatchat-host.sh, пуснат ИСТИНСКИ (bash) върху временна
// „машина“: apt-get, dpkg-query, systemctl, ufw, docker, sshd, curl, gpg, timedatectl, chronyc, ss, ip,
// getent и logrotate са ФАЛШИВИ изпълними файлове в PATH, които пазят състояние (инсталирани пакети,
// включени услуги, правила на ufw) във временна папка. Истинските им двойници на тази машина са скрити от
// PATH. Проверява се: --check не пипа НИЩО (и казва какво би сменил), прилагането е идемпотентно (вторият
// пробег — 0 промени), чуждото не се пипа, unit-ите са същите като от chatchat/deploy/timers-install.sh.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(root, "deploy", "provision", "chatchat-host.sh");
const isRoot = process.getuid?.() === 0;
const FPR = "9DC858229FC7DD38854AE2D88D81803C0EBFCD88";
const FAKED = ["apt-get", "dpkg-query", "systemctl", "ufw", "docker", "sshd", "curl", "gpg", "timedatectl", "chronyc",
  "ss", "ip", "getent", "logrotate", "nginx", "certbot"];
const REAL_GETENT = ["/usr/bin/getent", "/bin/getent"].find((p) => existsSync(p)) ?? "getent";

// Системните инструменти без фалшифицираните: symlink-ове в отделна папка, която заменя PATH.
let sysbin;
before(() => {
  sysbin = mkdtempSync(join(tmpdir(), "provision-sysbin-"));
  for (const d of ["/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]) {
    if (!existsSync(d)) continue;
    for (const n of readdirSync(d)) {
      if (FAKED.includes(n) || existsSync(join(sysbin, n))) continue;
      try { symlinkSync(join(d, n), join(sysbin, n)); } catch { /* дубликат през /bin → /usr/bin */ }
    }
  }
});
after(() => rmSync(sysbin, { recursive: true, force: true }));

const FAKE_DOCKER = `#!/usr/bin/env bash
echo "docker $*" >> "$LOG"
case "$*" in
  "version --format {{.Server.Version}}") echo "\${DOCKER_VERSION:-29.8.2}" ;;
  "compose version") exit 0 ;;
esac
`;
const FAKES = {
  "dpkg-query": `#!/usr/bin/env bash\ngrep -qx "\${*: -1}" "$S/pkgs" 2>/dev/null && printf 'install ok installed' || exit 1\n`,
  "apt-get": `#!/usr/bin/env bash
echo "apt-get $*" >> "$LOG"
if [ "$1" = install ] || [[ " $* " == *" install "* ]]; then
  for a in "$@"; do
    case "$a" in -*|install) ;; *) echo "$a" >> "$S/pkgs" ;; esac
    if [ "$a" = docker-ce ]; then printf '%s' ${JSON.stringify(FAKE_DOCKER)} > "$BIN/docker"; chmod 755 "$BIN/docker"; fi
  done
fi
`,
  systemctl: `#!/usr/bin/env bash
echo "systemctl $*" >> "$LOG"
case "$1" in
  is-enabled) grep -qx "$2" "$S/enabled" 2>/dev/null ;;
  is-active) grep -qx "$2" "$S/active" 2>/dev/null ;;
  enable) shift; [ "$1" = --now ] && shift; for u in "$@"; do echo "$u" >> "$S/enabled"; echo "$u" >> "$S/active"; done ;;
esac
`,
  ufw: `#!/usr/bin/env bash
echo "ufw $*" >> "$LOG"
case "$*" in
  "show added") echo "Added user rules (see 'ufw status' for running firewall):"; if [ -s "$S/ufw" ]; then cat "$S/ufw"; else echo "(None)"; fi ;;
  status) if [ -f "$S/ufw-active" ]; then echo "Status: active"; else echo "Status: inactive"; fi ;;
  "allow "*) echo "ufw allow $2" >> "$S/ufw" ;;
  "default deny incoming") mkdir -p "$PROVISION_ETC/default"; echo 'DEFAULT_INPUT_POLICY="DROP"' > "$PROVISION_ETC/default/ufw" ;;
  "--force enable") touch "$S/ufw-active" ;;
esac
`,
  sshd: `#!/usr/bin/env bash\necho "port \${SSHD_PORT:-22}"\n`,
  curl: `#!/usr/bin/env bash\necho "curl $*" >> "$LOG"\nprev=""; for a in "$@"; do [ "$prev" = -o ] && echo KEY > "$a"; prev="$a"; done\n`,
  gpg: `#!/usr/bin/env bash\necho "fpr:::::::::\${KEY_FPR}:"\n`,
  timedatectl: `#!/usr/bin/env bash\necho "\${CLOCK:-no}"\n`,
  chronyc: `#!/usr/bin/env bash\necho "Leap status     : Normal"\n`,
  ss: `#!/usr/bin/env bash\nfor p in \${BUSY_PORTS:-}; do case "$*" in *":$p") echo "LISTEN 0 4096 0.0.0.0:$p 0.0.0.0:*" ;; esac; done\n`,
  ip: `#!/usr/bin/env bash\nfor a in \${HOST_ADDRS:-}; do echo "2: eth0    inet $a/32 scope global eth0"; done\n`,
  getent: `#!/usr/bin/env bash
case "$1" in
  ahostsv4|ahostsv6) f="$S/dns-$1-$2"; [ -f "$f" ] && sed 's/$/ STREAM x/' "$f" || exit 2 ;;
  *) exec ${REAL_GETENT} "$@" ;;
esac
`,
  logrotate: `#!/usr/bin/env bash\necho "logrotate $*" >> "$LOG"\n`,
};

function layout() {
  const base = mkdtempSync(join(tmpdir(), "provision-"));
  const L = { base, bin: join(base, "bin"), S: join(base, "state"), etc: join(base, "etc"), opt: join(base, "opt", "few-few"),
    sbin: join(base, "sbin"), logs: join(base, "var-log-chatchat"), log: join(base, "calls.txt") };
  for (const d of [L.bin, L.S, L.etc]) mkdirSync(d, { recursive: true });
  for (const [n, body] of Object.entries(FAKES)) {
    writeFileSync(join(L.bin, n), body);
    chmodSync(join(L.bin, n), 0o755);
  }
  writeFileSync(join(L.etc, "os-release"), "ID=ubuntu\nVERSION_CODENAME=noble\nUBUNTU_CODENAME=noble\n");
  writeFileSync(L.log, "");
  return L;
}
const withLayout = (body) => {
  const L = layout();
  try { body(L); } finally { rmSync(L.base, { recursive: true, force: true }); }
};
const hasDocker = (L, version = "29.8.2") => {
  writeFileSync(join(L.bin, "docker"), FAKE_DOCKER);
  chmodSync(join(L.bin, "docker"), 0o755);
  return version;
};

function provision(L, args = [], env = {}) {
  const res = spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { HOME: L.base, PATH: `${L.bin}:${sysbin}`, LOG: L.log, S: L.S, BIN: L.bin, KEY_FPR: FPR,
      FEW_FEW_ROOT: L.opt, PROVISION_ETC: L.etc, CHATCHAT_SBIN: L.sbin, CHATCHAT_LOG_DIR: L.logs, ...env },
  });
  const calls = readFileSync(L.log, "utf8");
  writeFileSync(L.log, "");
  return { status: res.status, out: res.stdout + res.stderr, calls };
}

function snapshot(dir, skip) {
  const out = {};
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (p === skip) continue;
      const st = statSync(p);
      out[p] = `${(st.mode & 0o7777).toString(8)} ${st.uid}:${st.gid} ` +
        (st.isDirectory() ? "dir" : createHash("sha256").update(readFileSync(p)).digest("hex"));
      if (st.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return out;
}
const mode = (p) => (statSync(p).mode & 0o777).toString(8);
const MUTATING = /apt-get (update|install)|ufw (allow|default|--force)|systemctl (enable|daemon-reload|start|restart)|logrotate|curl /;
const opts = { skip: !isRoot && "иска root (chown 1000, install -o)" };

test("--check на празна машина: изход 2, казва какво би сменил и НЕ пипа нищо", opts, () => withLayout((L) => {
  const before = snapshot(L.base, L.log);
  const r = provision(L, ["--check"]);
  assert.equal(r.status, 2, r.out);
  for (const want of ["apt-get install", "nginx", "cryptsetup", "Docker Engine", "ufw allow 22/tcp", "ufw allow 443/tcp",
    "ufw --force enable", "chrony", "fail2ban", "chatchat-staging", "chatchat-backup.timer", "logrotate.d/chatchat"]) {
    assert.ok(r.out.includes(want), `${want}\n${r.out}`);
  }
  assert.doesNotMatch(r.calls, MUTATING, r.calls);
  assert.deepEqual(snapshot(L.base, L.log), before, "файловата система и състоянието — същите");
}));

test("прилагане: пакети, Docker от официалното репо (проверен ключ), ufw, папките, unit-ите, logrotate; вторият пробег — 0 промени", opts, () => withLayout((L) => {
  const r = provision(L);
  assert.equal(r.status, 0, r.out);
  const pkgs = readFileSync(join(L.S, "pkgs"), "utf8");
  for (const p of ["nginx", "certbot", "python3-certbot-nginx", "cryptsetup", "ufw", "fail2ban", "unattended-upgrades", "age",
    "docker-ce", "docker-compose-plugin", "chrony"]) assert.match(pkgs, new RegExp(`^${p}$`, "m"), p);
  // Docker: ключът е проверен по отпечатък, източникът е deb822 с Signed-By.
  assert.match(r.calls, /curl -fsSL --retry 3 https:\/\/download\.docker\.com\/linux\/ubuntu\/gpg/);
  const src = readFileSync(join(L.etc, "apt", "sources.list.d", "docker.sources"), "utf8");
  assert.match(src, /^Suites: noble$/m);
  assert.match(src, /^Signed-By: \/etc\/apt\/keyrings\/docker\.asc$/m);
  assert.ok(existsSync(join(L.etc, "apt", "keyrings", "docker.asc")));
  // ufw: 22/80/443, по подразбиране отказ, включен.
  assert.equal(readFileSync(join(L.S, "ufw"), "utf8"), "ufw allow 22/tcp\nufw allow 80/tcp\nufw allow 443/tcp\n");
  assert.ok(existsSync(join(L.S, "ufw-active")));
  // Папките и правата.
  const sh = join(L.opt, "shared");
  assert.equal(mode(join(sh, "chatchat")), "700");
  assert.equal(statSync(join(sh, "chatchat", "attachments")).uid, 1000);
  assert.equal(mode(join(sh, "chatchat", "attachments")), "700");
  assert.equal(mode(join(sh, "chatchat", "eval-reports")), "755");
  assert.equal(mode(join(sh, "chatchat", "backups", "daily")), "700");
  for (const d of ["releases", "eval-runs", "attachments"]) assert.ok(existsSync(join(sh, "chatchat-staging", d)), d);
  assert.equal(mode(join(L.etc, "nginx", "chatchat-staging")), "750");
  assert.equal(mode(join(L.etc, "nginx", "chatchat-staging", "allow.conf")), "640");
  // Unit-ите (пътят е вписан), скриптовете, таймерите, logrotate.
  assert.match(readFileSync(join(L.etc, "systemd", "system", "chatchat-backup.service"), "utf8"), new RegExp(`ReadWritePaths=${sh}/chatchat/backups/daily`));
  assert.equal(mode(join(L.sbin, "chatchat-backup")), "700");
  assert.match(readFileSync(join(L.S, "enabled"), "utf8"), /chatchat-backup\.timer[\s\S]*chatchat-retention\.timer/);
  assert.equal(readFileSync(join(L.etc, "logrotate.d", "chatchat"), "utf8"), readFileSync(join(root, "chatchat", "deploy", "logrotate", "chatchat"), "utf8"));
  assert.match(readFileSync(join(L.etc, "apt", "apt.conf.d", "20auto-upgrades"), "utf8"), /Unattended-Upgrade "1"/);

  const again = provision(L);
  assert.equal(again.status, 0, again.out);
  assert.match(again.out, /готово: 0 промени/);
  assert.doesNotMatch(again.calls, MUTATING, again.calls);
  const check = provision(L, ["--check"]);
  assert.equal(check.status, 0, check.out);
  assert.match(check.out, /всичко е на място/);
}));

test("unit-ите от provision са байт по байт тези от timers-install.sh (един източник)", opts, () => withLayout((L) => {
  assert.equal(provision(L).status, 0);
  const other = join(L.base, "systemd-from-deploy");
  const otherSbin = join(L.base, "sbin-from-deploy");
  mkdirSync(other);
  mkdirSync(otherSbin);
  const res = spawnSync("bash", ["-c", `source "${join(root, "chatchat", "deploy", "timers-install.sh")}"; install_timers`], {
    encoding: "utf8",
    env: { PATH: `${L.bin}:${sysbin}`, LOG: L.log, S: L.S, CHATCHAT_SHARED: join(L.opt, "shared", "chatchat"),
      CHATCHAT_SYSTEMD_DIR: other, CHATCHAT_SBIN: otherSbin, CHATCHAT_AGE: "false-age-missing" },
  });
  assert.equal(res.status, 0, res.stderr);
  for (const u of readdirSync(other)) {
    assert.equal(readFileSync(join(other, u), "utf8"), readFileSync(join(L.etc, "systemd", "system", u), "utf8"), u);
  }
  assert.equal(readdirSync(other).length, 4);
}));

test("съществуващ Docker не се пипа (и стар — само предупреждение, не ъпдейт с рестарт на всичко)", opts, () => withLayout((L) => {
  hasDocker(L);
  const r = provision(L, [], { DOCKER_VERSION: "28.1.0" });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /Docker Engine 28\.1\.0 < 29\.5\.1/);
  assert.doesNotMatch(readFileSync(join(L.S, "pkgs"), "utf8"), /docker-ce/);
  assert.doesNotMatch(r.calls, /download\.docker\.com/);
  assert.ok(!existsSync(join(L.etc, "apt", "sources.list.d", "docker.sources")));
}));

test("ключ на Docker с чужд отпечатък: отказ, източникът не се записва", opts, () => withLayout((L) => {
  const r = provision(L, [], { KEY_FPR: "0000000000000000000000000000000000000000" });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /непознат отпечатък/);
  assert.ok(!existsSync(join(L.etc, "apt", "sources.list.d", "docker.sources")));
  assert.ok(!existsSync(join(L.etc, "apt", "keyrings", "docker.asc")));
}));

test("SSH на друг порт: firewall-ът не се пипа (иначе машината се заключва)", opts, () => withLayout((L) => {
  hasDocker(L);
  const r = provision(L, [], { SSHD_PORT: "2222" });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /sshd слуша на: 2222/);
  assert.doesNotMatch(r.calls, /ufw (allow|default|--force)/);
}));

test("чужди правила на ufw остават (само се докладват)", opts, () => withLayout((L) => {
  hasDocker(L);
  writeFileSync(join(L.S, "ufw"), "ufw allow 22/tcp\nufw allow 51820/udp\n");
  const r = provision(L);
  assert.equal(r.status, 0, r.out);
  assert.match(readFileSync(join(L.S, "ufw"), "utf8"), /^ufw allow 51820\/udp$/m);
  assert.match(r.out, /допуска и други правила[^\n]*51820\/udp/);
  assert.doesNotMatch(r.calls, /ufw delete|ufw reset/);
}));

test("80/443 държи друг (Caddy): nginx не се слага", opts, () => withLayout((L) => {
  hasDocker(L);
  const r = provision(L, [], { BUSY_PORTS: "443" });
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(readFileSync(join(L.S, "pkgs"), "utf8"), /^nginx$/m);
  assert.match(r.out, /80\/443 държи друга услуга/);
}));

test("синхронизиран часовник (timesyncd): chrony не се слага; съществуващи 20auto-upgrades и allow.conf не се пипат", opts, () => withLayout((L) => {
  hasDocker(L);
  const auto = join(L.etc, "apt", "apt.conf.d", "20auto-upgrades");
  mkdirSync(dirname(auto), { recursive: true });
  writeFileSync(auto, 'APT::Periodic::Unattended-Upgrade "0";\n');
  const allow = join(L.etc, "nginx", "chatchat-staging", "allow.conf");
  mkdirSync(dirname(allow), { recursive: true });
  writeFileSync(allow, "allow 198.51.100.7;\n");
  const r = provision(L, [], { CLOCK: "yes" });
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(readFileSync(join(L.S, "pkgs"), "utf8"), /^chrony$/m);
  assert.equal(readFileSync(auto, "utf8"), 'APT::Periodic::Unattended-Upgrade "0";\n');
  assert.match(r.out, /изключва автоматичните кръпки/);
  assert.equal(readFileSync(allow, "utf8"), "allow 198.51.100.7;\n");
}));

test("грешни права на наша папка се поправят; чужд корен (/opt/few-few) не се пипа", opts, () => withLayout((L) => {
  hasDocker(L);
  mkdirSync(join(L.opt, "shared", "chatchat"), { recursive: true });
  chmodSync(L.opt, 0o711);
  chmodSync(join(L.opt, "shared", "chatchat"), 0o755);
  const r = provision(L);
  assert.equal(r.status, 0, r.out);
  assert.equal(mode(join(L.opt, "shared", "chatchat")), "700");
  assert.equal(mode(L.opt), "711");
}));

// ── --dns ─────────────────────────────────────────────────────────────────────────────────────────────
test("--dns: A сочи машината → 0; липсващ A или чужд адрес → 1 (certbot още не)", () => withLayout((L) => {
  const dns = (name, fam, addr) => writeFileSync(join(L.S, `dns-ahostsv${fam}-${name}`), `${addr}\n`);
  dns("chatchat.carbonstealth.eu", 4, "203.0.113.10");
  dns("staging-chatchat.carbonstealth.eu", 4, "203.0.113.10");
  let r = provision(L, ["--dns"], { HOST_ADDRS: "203.0.113.10" });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /staging-chatchat\.carbonstealth\.eu → 203\.0\.113\.10 \(тази машина\)/);
  rmSync(join(L.S, "dns-ahostsv4-staging-chatchat.carbonstealth.eu"));
  r = provision(L, ["--dns"], { HOST_ADDRS: "203.0.113.10" });
  assert.equal(r.status, 1);
  assert.match(r.out, /staging-chatchat\.carbonstealth\.eu: НЯМА A запис/);
  r = provision(L, ["--dns"], { SERVER_IPV4: "198.51.100.1" });
  assert.equal(r.status, 1);
  assert.match(r.out, /НЕ е адрес на тази машина/);
}));

test("скриптът: set -euo pipefail, main не е в `||` (иначе set -e се изключва вътре), чист за deploy-check", () => {
  const src = readFileSync(SCRIPT, "utf8");
  assert.match(src, /^set -euo pipefail$/m);
  assert.match(src, /^if \[ "\$\{BASH_SOURCE\[0\]\}" = "\$0" \]; then main "\$@"; fi$/m);
  const lint = spawnSync(process.execPath, [join(root, "tools", "vps", "deploy-check.mjs"), SCRIPT], { encoding: "utf8" });
  assert.equal(lint.status, 0, lint.stdout);
});
