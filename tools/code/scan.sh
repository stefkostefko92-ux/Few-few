#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scan.sh — оркестратор на SAST/SCA/secret сканиране за Кодаджията v2.0.
# Пуска реалните инструменти върху промяната, събира SARIF/JSON и оставя
# адъюдикацията (reachability/feasibility) на агента. Инструментите намират
# кандидати; агентът ги доказва или изхвърля.
#
# Подкоманди:
#   check                 — кои инструменти са налични
#   sast   [PATH]         — Semgrep/Opengrep (custom правила за репо-идиомите)
#   deps                  — osv-scanner (известни CVE по зависимости) + SBOM (syft)
#   secrets [--diff]      — gitleaks (изтекли тайни; --diff = само staged)
#   all    [PATH]         — sast + deps + secrets, резюме
#
# Зависимости (всички по избор; скриптът пропуска липсващите):
#   semgrep|opengrep, osv-scanner, syft, gitleaks
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
die(){ printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }
ok(){  printf '\033[32m✔ %s\033[0m\n' "$*"; }
inf(){ printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
miss(){ printf '\033[33m… %s липсва — пропускам\033[0m\n' "$*"; }
have(){ command -v "$1" >/dev/null 2>&1; }

cmd_check(){
  for t in semgrep opengrep osv-scanner syft gitleaks; do
    have "$t" && ok "$t" || miss "$t"
  done
  echo "Инсталация: pipx install semgrep · brew install osv-scanner syft gitleaks (или виж README)."
}

sast_bin(){ have semgrep && echo semgrep || { have opengrep && echo opengrep; }; }

cmd_sast(){ # [PATH]
  local bin; bin="$(sast_bin)"; [ -n "$bin" ] || { miss "semgrep/opengrep"; return; }
  local path="${1:-.}"
  inf "SAST ($bin) върху $path — custom правила + auto config"
  "$bin" scan --error --sarif --output semgrep.sarif \
    --config "$here/semgrep-rules.yml" --config auto "$path" || true
  ok "SAST → semgrep.sarif (адъюдикирай находките: достижим ли е sink-ът от потребителски вход?)"
}

cmd_deps(){
  if have osv-scanner; then
    inf "SCA (osv-scanner)"; osv-scanner scan --recursive . --format json --output osv.json || true
    ok "Зависимости → osv.json"
  else miss "osv-scanner"; fi
  if have syft; then syft scan dir:. -o cyclonedx-json=sbom.json >/dev/null 2>&1 && ok "SBOM → sbom.json"; else miss "syft"; fi
}

cmd_secrets(){ # [--diff]
  have gitleaks || { miss "gitleaks"; return; }
  if [ "${1:-}" = "--diff" ]; then
    inf "Secret scan (gitleaks, staged)"; gitleaks protect --staged --redact --report-path gitleaks.json || true
  else
    inf "Secret scan (gitleaks, цяло дърво)"; gitleaks detect --redact --report-path gitleaks.json || true
  fi
  ok "Тайни → gitleaks.json"
}

cmd_all(){ cmd_sast "${1:-.}"; cmd_deps; cmd_secrets; echo; ok "Готово. Адъюдикирай: всяка находка с доказуема source→sink пътека остава; иначе → FP."; }

sub="${1:-check}"; shift || true
case "$sub" in
  check) cmd_check;; sast) cmd_sast "$@";; deps) cmd_deps;; secrets) cmd_secrets "$@";; all) cmd_all "$@";;
  *) die "Непозната подкоманда: $sub";;
esac
