#!/usr/bin/env bash
# demos-clean.sh — чисти SourceTV демотата на cs2dm (плъгинът DemoRecorder): по-стари от N дни + таван.
#
# Пуска го cs2-demos-clean.timer на всеки час като потребителя cs2 (без мрежа, пише само в папката).
# Срокът (14 дни) е обещан в политиката за поверителност — app/src/content.ts RETENTION.demosDays.
# Таванът пази диска на споделения VPS: над него се трият най-старите записи, преди да изтече срокът.
#   demos-clean.sh <папка> <дни> [таван-GB]      таванът: аргумент, иначе CS2DM_DEMO_MAX_GB, иначе 10
set -euo pipefail

dir="${1:?папка с демотата}"
days="${2:?срок в дни}"
max_gb="${3:-${CS2DM_DEMO_MAX_GB:-10}}"
[[ "$days" =~ ^[1-9][0-9]{0,2}$ ]] || { echo "demos-clean: срокът е 1–999 дни" >&2; exit 2; }
[[ "$max_gb" =~ ^[1-9][0-9]{0,3}$ ]] || { echo "demos-clean: таванът е 1–9999 GB" >&2; exit 2; }
[[ -d "$dir" ]] || exit 0

# 1) Срокът — в минути (find -mtime закръгля до цели денонощия).
find "$dir" -maxdepth 1 -type f -name '*.dem' -mmin "+$((days * 1440))" -delete

# 2) Таванът — най-старите първо. Записът, който тече в момента (пипан преди < 10 мин), остава.
max_bytes=$((max_gb * 1024 * 1024 * 1024))
mapfile -t files < <(find "$dir" -maxdepth 1 -type f -name '*.dem' -printf '%T@\t%s\t%p\n' | sort -n)
total=0
for row in "${files[@]}"; do
  rest="${row#*$'\t'}"
  total=$((total + ${rest%%$'\t'*}))
done
now="$(date +%s)"
for row in "${files[@]}"; do
  (( total > max_bytes )) || break
  mtime="${row%%$'\t'*}"
  rest="${row#*$'\t'}"
  size="${rest%%$'\t'*}"
  path="${rest#*$'\t'}"
  (( now - ${mtime%.*} < 600 )) && continue
  rm -f -- "$path"
  total=$((total - size))
done
