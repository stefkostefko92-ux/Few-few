#!/usr/bin/env bash
# repurpose.sh — 1 дълго видео → много shorts (Социалджията v2.1).
# Реже дългото на сегменти по сцени/тишина, после прекарва всеки през clip.sh
# (9:16, captions, -14 LUFS, thumbnail). Хората избират победителите за публикуване.
#
# Употреба:  bash tools/social/repurpose.sh long.mp4 out_dir [bg] [--by scene|time] [--len 45]
# Зависимости: ffmpeg (+ по избор scenedetect/auto-editor). clip.sh е до него.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
die(){ printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }
ok(){  printf '\033[32m✔ %s\033[0m\n' "$*"; }
inf(){ printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
have(){ command -v "$1" >/dev/null 2>&1; }

in="${1:?вход}"; outdir="${2:?изходна папка}"; lang="${3:-bg}"
by="time"; seglen="45"
shift 3 2>/dev/null || shift $#
while [ $# -gt 0 ]; do case "$1" in --by) by="$2"; shift 2;; --len) seglen="$2"; shift 2;; *) shift;; esac; done
have ffmpeg || die "Липсва ffmpeg"
mkdir -p "$outdir/segments"

if [ "$by" = "scene" ] && have scenedetect; then
  inf "Сегментиране по СЦЕНИ (scenedetect)…"
  scenedetect -i "$in" detect-adaptive split-video -o "$outdir/segments" -f '$VIDEO_NAME-$SCENE_NUMBER' || true
else
  [ "$by" = "scene" ] && inf "scenedetect липсва — режа по ВРЕМЕ на ${seglen}s." || inf "Режа по ВРЕМЕ на ${seglen}s."
  ffmpeg -y -i "$in" -c copy -map 0 -segment_time "$seglen" -f segment -reset_timestamps 1 \
    "$outdir/segments/seg_%03d.mp4"
fi

n=0
for seg in "$outdir/segments"/*.mp4; do
  [ -f "$seg" ] || continue
  n=$((n+1))
  out="$outdir/short_$(printf '%02d' "$n").mp4"
  inf "Клип $n: $(basename "$seg") → $(basename "$out")"
  bash "$here/clip.sh" all "$seg" "$out" "$lang" || die "clip.sh се провали на $seg"
done
[ "$n" -gt 0 ] || die "Няма сегменти — провери входа/инструмента."
ok "$n shorts в $outdir/. Прегледай, избери победителите, добави AI етикет при синтетично, после публикувай (виж publish.md)."
