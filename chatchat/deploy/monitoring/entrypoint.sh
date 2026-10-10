#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# chatchat/deploy/monitoring/entrypoint.sh — входът на Prometheus и Alertmanager в
# docker-compose.monitoring.yml (POSIX sh: образите са busybox, без bash).
#
#   entrypoint.sh prometheus   [аргументи на prometheus…]
#   entrypoint.sh alertmanager [аргументи на alertmanager…]
#
# Двата не четат променливи на средата в конфига си, затова шаблонът от репото (само за четене) се
# изобразява в /tmp (tmpfs, 600) със ПРОВЕРЕНИ стойности — нищо непроверено не стига до sed/YAML:
# адресите и имената минават през строг шаблон (без „|“, „&“, „\“, кавички и нови редове). Невалидна
# настройка → изход 64 и ясна причина в `docker compose logs`; контейнерът не тръгва с половин конфиг.
#
# RENDER_ONLY=1 — само изобразява (тестовете: promtool/amtool върху резултата); RENDER_DIR, TEMPLATE_DIR,
# RULES_DIR, SECRETS_DIR — пътищата (подразбиранията са тези в контейнера).
# ─────────────────────────────────────────────────────────────────────────────
set -eu
umask 077

OUT="${RENDER_DIR:-/tmp}"
TEMPLATES="${TEMPLATE_DIR:-/etc/chatchat-monitoring}"
RULES="${RULES_DIR:-/etc/prometheus/rules}"
SECRETS="${SECRETS_DIR:-/run/secrets}"
EMAIL='[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}'

die() {
  printf 'chatchat-monitoring: %s\n' "$*" >&2
  exit 64
}

# Цялата стойност ($2) отговаря на шаблона ($1); един ред, нищо друго.
valid() {
  [ "$(printf '%s' "$2" | wc -l)" -eq 0 ] && printf '%s\n' "$2" | grep -Eqx "$1"
}

render_prometheus() {
  base="${PUBLIC_BASE_URL:-}"
  base="${base%/}"
  valid 'https://[A-Za-z0-9.-]+(:[0-9]{1,5})?' "$base" ||
    die "PUBLIC_BASE_URL трябва да е https://<домейн> — пробата отвън няма цел; Prometheus не тръгва."
  valid '/[A-Za-z0-9._/-]+' "$RULES" || die "необичаен RULES_DIR."
  sed -e "s|__PUBLIC_BASE_URL__|$base|g" -e "s|__RULES_DIR__|$RULES|g" \
    "$TEMPLATES/prometheus.yml" >"$OUT/prometheus.yml"
}

render_alertmanager() {
  to="${ALERT_EMAIL_TO:-}"
  from="${ALERT_EMAIL_FROM:-}"
  host="${ALERT_SMTP_SMARTHOST:-smtp-relay.brevo.com:2525}"
  user=""
  [ -r "$SECRETS/smtp-user" ] && user="$(tr -d '\r\n' <"$SECRETS/smtp-user")"
  valid "$EMAIL(,$EMAIL)*" "$to" || die "ALERT_EMAIL_TO липсва или не е имейл (няколко — със запетая, без интервали)."
  valid "$EMAIL" "$from" || die "ALERT_EMAIL_FROM (или MAIL_FROM_EMAIL) липсва или не е имейл — подател, проверен в Brevo."
  valid '[A-Za-z0-9.-]+:[0-9]{1,5}' "$host" || die "ALERT_SMTP_SMARTHOST трябва да е хост:порт."
  valid '[A-Za-z0-9@._+-]{1,254}' "$user" || die "няма SMTP потребител във файла smtp-user (SMTP login от Brevo)."
  [ -s "$SECRETS/smtp-password" ] || die "няма SMTP ключ във файла smtp-password (Brevo → SMTP & API → SMTP)."
  valid '/[A-Za-z0-9._/-]+' "$SECRETS" || die "необичаен SECRETS_DIR."
  sed -e "s|__ALERT_EMAIL_TO__|$to|g" -e "s|__ALERT_EMAIL_FROM__|$from|g" \
    -e "s|__SMTP_SMARTHOST__|$host|g" -e "s|__SMTP_USER__|$user|g" -e "s|__SECRETS_DIR__|$SECRETS|g" \
    "$TEMPLATES/alertmanager.yml" >"$OUT/alertmanager.yml"
}

what="${1:-}"
[ $# -gt 0 ] && shift
case "$what" in
  prometheus)
    render_prometheus
    [ -z "${RENDER_ONLY:-}" ] || exit 0
    exec /bin/prometheus --config.file="$OUT/prometheus.yml" "$@"
    ;;
  alertmanager)
    render_alertmanager
    [ -z "${RENDER_ONLY:-}" ] || exit 0
    exec /bin/alertmanager --config.file="$OUT/alertmanager.yml" "$@"
    ;;
  *) die "употреба: entrypoint.sh prometheus|alertmanager [аргументи…]" ;;
esac
