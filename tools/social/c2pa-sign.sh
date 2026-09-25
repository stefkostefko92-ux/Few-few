#!/usr/bin/env bash
# c2pa-sign.sh — добавя Content Credentials (C2PA) с AI-disclosure към клип
# (Социалджията v2.0). EU AI Act чл. 50 иска машинно-четима маркировка за
# значително AI-генерирано/редактирано съдържание (в сила от 2 авг. 2026).
# ВАЖНО: платформите често свалят C2PA при качване → сложи и ВИДИМ „AI-generated" етикет.
#
# Употреба:  bash tools/social/c2pa-sign.sh in.mp4 out.mp4 [--ai]
# Зависимост: c2patool (https://github.com/contentauth/c2pa-rs). Казва ясно, ако липсва.
set -euo pipefail
in="${1:?вход}"; out="${2:?изход}"; ai="${3:-}"
command -v c2patool >/dev/null || { echo "✘ Липсва c2patool. Инсталирай: cargo install c2patool (или виж releases)"; exit 1; }

assertions='[{"label":"stds.schema-org.CreativeWork","data":{"@context":"https://schema.org","@type":"CreativeWork","creator":"Carbon Stealth"}}]'
if [ "$ai" = "--ai" ]; then
  # Декларирай генеративен AI принос (c2pa.actions с digitalSourceType trainedAlgorithmicMedia).
  assertions='[{"label":"c2pa.actions","data":{"actions":[{"action":"c2pa.created","digitalSourceType":"http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"}]}}]'
fi

manifest="$(mktemp).json"
printf '{"claim_generator":"few-few/clip.sh","assertions":%s}' "$assertions" > "$manifest"
c2patool "$in" -m "$manifest" -o "$out" -f
rm -f "$manifest"
echo "✔ Подписан с Content Credentials → $out"
[ "$ai" = "--ai" ] && echo "ℹ Маркиран като AI-генериран. ДОБАВИ И ВИДИМ етикет в самото видео/описание (платформите свалят C2PA)."
