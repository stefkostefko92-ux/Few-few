#!/usr/bin/env bash
# Билд на плъгина CarbonStealth: тестове на логиката → publish в out/CarbonStealth/.
# DeathmatchAPI.dll (само за компилиране) се взема от архива в server/mods/mods.lock след проверка
# на sha256 — същият архив, който install-mods.sh слага на сървъра. Идемпотентен.
#   bash scripts/build.sh            # нужен е .NET SDK (global.json)
set -euo pipefail

cd "$(dirname "$0")/.."
readonly ROOT="$PWD"
readonly LOCK="$ROOT/../server/mods/mods.lock"
readonly LIB="$ROOT/lib"
readonly OUT="$ROOT/out/CarbonStealth"

die() { echo "build: $*" >&2; exit 1; }

command -v dotnet >/dev/null || die "липсва dotnet (SDK от global.json)"

if [[ ! -f "$LIB/DeathmatchAPI.dll" ]]; then
  command -v unzip >/dev/null || die "липсва unzip"
  line="$(awk -F'\t' '$1 == "deathmatch" { print $3 "\t" $4 }' "$LOCK")"
  [[ -n "$line" ]] || die "няма ред deathmatch в mods.lock"
  url="${line%%$'\t'*}"
  sha="${line##*$'\t'}"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL --proto '=https' --retry 3 -o "$tmp/dm.zip" "$url"
  echo "$sha  $tmp/dm.zip" | sha256sum -c --quiet - || die "sha256 на Deathmatch.zip не съвпада — спирам"
  unzip -q -j "$tmp/dm.zip" 'addons/counterstrikesharp/shared/DeathmatchAPI/DeathmatchAPI.dll' -d "$tmp/x"
  mkdir -p "$LIB"
  install -m 0644 "$tmp/x/DeathmatchAPI.dll" "$LIB/DeathmatchAPI.dll"
fi

export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
# Заключено възстановяване: пакетите трябва да съвпадат с packages.lock.json (версия + хеш).
dotnet test tests/CarbonStealth.Logic.Tests --nologo -v quiet -p:RestoreLockedMode=true
rm -rf "$OUT"
dotnet publish src/CarbonStealth -c Release --nologo -v quiet -p:RestoreLockedMode=true -o "$OUT"
# Само наши файлове + Npgsql/Redis; API-тата ги дава CounterStrikeSharp при изпълнение.
for f in CounterStrikeSharp.API.dll DeathmatchAPI.dll; do
  [[ ! -e "$OUT/$f" ]] || die "$f не бива да е в out/ (две копия на типовете в процеса)"
done
echo "build: OK → $OUT"
