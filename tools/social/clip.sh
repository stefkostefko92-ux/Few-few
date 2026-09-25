#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# clip.sh — скриптуем pipeline за къси клипове (9:16) за social media.
# Превръща дълго видео в готов за публикуване вертикален клип с captions,
# изрязани паузи, дукната музика, нормализиран звук и thumbnail.
#
# Подкоманди:
#   check                      — проверка кои инструменти са налични
#   reframe   IN OUT [mode]    — 16:9 → 9:16 (mode: crop|blur, по подр. crop)
#   srt       IN OUT.srt [lang]— транскрипция → SRT (WhisperX, дума по дума)
#   captions  IN SRT OUT       — изгаряне на karaoke captions (safe zone)
#   autocut   IN OUT           — изрязване на тишината (auto-editor)
#   duck      VOICE MUSIC OUT  — музика дукната под гласа (sidechain)
#   norm      IN OUT           — loudness -14 LUFS, true-peak -1.5 dBTP
#   thumb     IN OUT.jpg [ss]  — кадър за корица (по подр. 1s)
#   all       IN OUT [lang]    — autocut → reframe → srt → captions → norm → thumb
#
# Зависимости (виж requirements.txt): ffmpeg (задължително), whisperx, auto-editor.
# Скриптът проверява наличността и казва ясно какво липсва (не гадае).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

die(){ printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }
ok(){  printf '\033[32m✔ %s\033[0m\n' "$*"; }
inf(){ printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
have(){ command -v "$1" >/dev/null 2>&1; }

need_ffmpeg(){ have ffmpeg || die "Липсва ffmpeg. Инсталирай: apt-get install -y ffmpeg"; }

# Целеви спецификации (всички 3 платформи: TikTok/Reels/Shorts)
W=1080; H=1920; FPS=30
# Safe zone за captions: централна 4:5 зона, далеч от UI отгоре/долу/вдясно
CAP_STYLE="Fontname=DejaVu Sans,Fontsize=18,Bold=1,Outline=3,Shadow=0,MarginV=300"

cmd_check(){
  inf "Проверка на инструментите:"
  for t in ffmpeg whisperx auto-editor yt-dlp; do
    if have "$t"; then ok "$t — наличен"; else printf '\033[33m… %s — липсва\033[0m\n' "$t"; fi
  done
  echo "ffmpeg е задължителен; whisperx (captions) и auto-editor (autocut) са по избор."
}

cmd_reframe(){ # IN OUT [crop|blur]
  need_ffmpeg; local in="$1" out="$2" mode="${3:-crop}"
  [ -f "$in" ] || die "Няма входен файл: $in"
  if [ "$mode" = "blur" ]; then
    ffmpeg -y -i "$in" -filter_complex \
      "[0]scale=${W}:${H},boxblur=20[bg];[0]scale=${W}:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1" \
      -r "$FPS" -c:a copy "$out"
  else
    ffmpeg -y -i "$in" -vf "crop=ih*9/16:ih,scale=${W}:${H},setsar=1" -r "$FPS" -c:a copy "$out"
  fi
  ok "Reframe ($mode) → $out"
}

cmd_srt(){ # IN OUT.srt [lang]
  have whisperx || die "Липсва whisperx. Инсталирай: pipx install whisperx (виж requirements.txt)"
  local in="$1" out="${2:-subs.srt}" lang="${3:-bg}" dir
  dir="$(dirname "$out")"
  whisperx "$in" --model large-v3 --language "$lang" --highlight_words True \
    --output_format srt --output_dir "$dir"
  ok "SRT (дума по дума, $lang) в $dir"
}

cmd_captions(){ # IN SRT OUT
  need_ffmpeg; local in="$1" srt="$2" out="$3"
  [ -f "$srt" ] || die "Няма SRT: $srt (генерирай с: clip.sh srt …)"
  ffmpeg -y -i "$in" -vf "subtitles='${srt}':force_style='${CAP_STYLE}'" -c:a copy "$out"
  ok "Captions (safe zone) → $out"
}

cmd_autocut(){ # IN OUT
  have auto-editor || die "Липсва auto-editor. Инсталирай: pipx install auto-editor"
  ffmpeg_ok=1; auto-editor "$1" --edit audio:threshold=4% --margin 0.2sec -o "$2"
  ok "Изрязани паузи → $2"
}

cmd_duck(){ # VOICE MUSIC OUT
  need_ffmpeg
  ffmpeg -y -i "$1" -i "$2" -filter_complex \
    "[1:a][0:a]sidechaincompress=threshold=0.015:ratio=15:attack=30:release=800[duck];[0:a][duck]amix=inputs=2:duration=first" \
    "$3"
  ok "Дукната музика под гласа → $3"
}

cmd_norm(){ # IN OUT  (2-pass loudnorm → -14 LUFS, TP -1.5)
  need_ffmpeg; local in="$1" out="$2" stats
  inf "Измерване (pass 1)…"
  stats="$(ffmpeg -i "$in" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 \
    | awk '/^\{/{f=1} f{print} /^\}/{f=0}')"
  local mi mtp mlra mthr
  mi=$(printf '%s' "$stats"   | grep input_i        | sed 's/[^0-9.-]//g')
  mtp=$(printf '%s' "$stats"  | grep input_tp       | sed 's/[^0-9.-]//g')
  mlra=$(printf '%s' "$stats" | grep input_lra      | sed 's/[^0-9.-]//g')
  mthr=$(printf '%s' "$stats" | grep input_thresh   | sed 's/[^0-9.-]//g')
  inf "Прилагане (pass 2)…"
  ffmpeg -y -i "$in" -af \
    "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${mi}:measured_TP=${mtp}:measured_LRA=${mlra}:measured_thresh=${mthr}:linear=true" \
    -c:v copy "$out"
  ok "Loudness -14 LUFS → $out"
}

cmd_thumb(){ # IN OUT.jpg [ss]
  need_ffmpeg; ffmpeg -y -ss "${3:-00:00:01}" -i "$1" -vframes 1 -q:v 2 "$2"
  ok "Thumbnail → $2"
}

cmd_all(){ # IN OUT [lang]
  need_ffmpeg; local in="$1" out="$2" lang="${3:-bg}" tmp
  tmp="$(mktemp -d)"
  inf "Pipeline: autocut → reframe → srt → captions → norm → thumb"
  if have auto-editor; then auto-editor "$in" --edit audio:threshold=4% --margin 0.2sec -o "$tmp/cut.mp4"; else cp "$in" "$tmp/cut.mp4"; printf '\033[33m… auto-editor липсва — пропускам autocut\033[0m\n'; fi
  cmd_reframe "$tmp/cut.mp4" "$tmp/9x16.mp4" crop
  if have whisperx; then
    whisperx "$tmp/9x16.mp4" --model large-v3 --language "$lang" --highlight_words True --output_format srt --output_dir "$tmp"
    cmd_captions "$tmp/9x16.mp4" "$tmp/9x16.srt" "$tmp/cap.mp4"
  else
    cp "$tmp/9x16.mp4" "$tmp/cap.mp4"; printf '\033[33m… whisperx липсва — без captions\033[0m\n'
  fi
  cmd_norm "$tmp/cap.mp4" "$out"
  cmd_thumb "$out" "${out%.*}.jpg"
  rm -rf "$tmp"
  ok "Готов клип → $out (+ корица ${out%.*}.jpg). Не забравяй AI етикет, ако е синтетично."
}

sub="${1:-check}"; shift || true
case "$sub" in
  check) cmd_check ;;
  reframe) cmd_reframe "$@" ;;
  srt) cmd_srt "$@" ;;
  captions) cmd_captions "$@" ;;
  autocut) cmd_autocut "$@" ;;
  duck) cmd_duck "$@" ;;
  norm) cmd_norm "$@" ;;
  thumb) cmd_thumb "$@" ;;
  all) cmd_all "$@" ;;
  *) die "Непозната подкоманда: $sub (виж коментара в началото на скрипта)";;
esac
