#!/usr/bin/env bash
# deploy-check: allow-no-errexit — библиотека; зарежда се със source от install-mods.sh (set -euo pipefail)
# mods-lib.sh — чистите решения на install-mods.sh: кои модове, кои Workshop addon-и, кои пътища и конфиги.
# Без root, без мрежа и без сървър — тестват се от test/modpack.test.mjs.

[[ -n "${CS2DM_MODS_LIB_LOADED:-}" ]] && return 0
CS2DM_MODS_LIB_LOADED=1

# Workshop addon-ът със звуците на quakesounds (Kandru). Лицензът на звуците е неясен — виж README.md.
CS2DM_QUAKE_ADDON=3461824328
# Без тях DM не тръгва — не се изключват. multiaddonmanager се решава от addon-ите, не от списъка.
CS2DM_CORE_MODS="metamod counterstrikesharp deathmatch"
# Демотата (DemoRecorder): папката е и в config/DemoRecorder.json, и в systemd/cs2-demos-clean.*
CS2DM_DEMO_DIR=/opt/cs2/server/game/csgo/addons/counterstrikesharp/data/demos

# Стойност от env файла (последният ред), без кавичките около нея. Липсва ли → празно.
cs2dm_env_get() { # файл ключ
  local v
  v="$(sed -n "s/^$2=//p" "$1" 2>/dev/null | tail -1 || true)"
  v="${v%\"}"
  v="${v#\"}"
  printf '%s' "$v"
}

# Флаг 0/1: празно → стойността по подразбиране; всичко друго → код 1.
cs2dm_flag() { # стойност по-подразбиране
  local v="${1:-$2}"
  [[ "$v" == 0 || "$v" == 1 ]] || return 1
  printf '%s' "$v"
}

# Цяло число в [мин, макс]; празно → по подразбиране. Иначе код 1.
cs2dm_int() { # стойност по-подразбиране мин макс
  local v="${1:-$2}"
  [[ "$v" =~ ^[0-9]{1,6}$ ]] || return 1
  (( 10#$v >= $3 && 10#$v <= $4 )) || return 1
  printf '%s' "$((10#$v))"
}

# mm_extra_addons: addon-ите на собственика (в неговия ред) + звуците на quakesounds накрая, без повторения.
# Невалиден запис → код 1 (тогава нищо не се инсталира).
cs2dm_addon_list() { # CS2_WORKSHOP_ADDONS quake(0|1)
  local owner="${1//[[:space:]\"]/}" quake="$2" out="" id
  local ids=()
  if [[ -n "$owner" ]]; then
    [[ "$owner" =~ ^[0-9]{6,12}(,[0-9]{6,12})*$ ]] || return 1
    IFS=, read -r -a ids <<<"$owner"
  fi
  [[ "$quake" == 1 ]] && ids+=("$CS2DM_QUAKE_ADDON")
  for id in "${ids[@]}"; do
    [[ ",$out," == *",$id,"* ]] && continue
    out="${out:+$out,}$id"
  done
  printf '%s' "$out"
}

# CS2DM_SKIP_MODS → нормализиран списък. Само имена от mods.lock; ядрото и multiaddonmanager → код 1.
cs2dm_skip_list() { # CS2DM_SKIP_MODS mods.lock
  local raw="${1//[[:space:]]/}" lock="$2" name out=""
  local names=()
  [[ -z "$raw" ]] && return 0
  [[ "$raw" =~ ^[a-z0-9-]+(,[a-z0-9-]+)*$ ]] || return 1
  IFS=, read -r -a names <<<"$raw"
  for name in "${names[@]}"; do
    [[ " $CS2DM_CORE_MODS multiaddonmanager " == *" $name "* ]] && return 1
    awk -F'\t' -v n="$name" '$1 == n { found = 1 } END { exit !found }' "$lock" || return 1
    [[ ",$out," == *",$name,"* ]] || out="${out:+$out,}$name"
  done
  printf '%s' "$out"
}

# 0 = модът НЕ се слага (изключен, без addon-и за MultiAddonManager, звуците са спрени).
cs2dm_mod_skipped() { # име skip-списък addon-и quake(0|1)
  [[ ",$2," == *",$1,"* ]] && return 0
  [[ "$1" == multiaddonmanager && -z "$3" ]] && return 0
  [[ "$1" == quakesounds && "$4" != 1 ]] && return 0
  return 1
}

# Какво се маха от game/csgo/, когато модът е изключен. Metamod плъгин спира с махането на своя .vdf
# (файловете остават); плъгин на CSS — с папката си (install-mods.sh го слага наново от кеша).
cs2dm_mod_paths() { # име
  case "$1" in
    multiaddonmanager) printf '%s\n' addons/metamod/multiaddonmanager.vdf ;;
    serverlistplayersfix) printf '%s\n' addons/metamod/serverlistplayersfix_mm.vdf ;;
    quakesounds) printf '%s\n' addons/counterstrikesharp/plugins/QuakeSounds ;;
    cosmetics) printf '%s\n' addons/counterstrikesharp/plugins/Cosmetics ;;
    demorecorder) printf '%s\n' addons/counterstrikesharp/plugins/DemoRecorder ;;
    cheatertroll) printf '%s\n' addons/counterstrikesharp/plugins/CheaterTroll ;;
    metablock) printf '%s\n' addons/counterstrikesharp/plugins/MetaBlock ;;
    *) return 1 ;;
  esac
}

# Нашият конфиг: server/mods/config/<Име>.json → configs/plugins/<Име>/<Име>.json. Празно = без наш конфиг.
# cheatertroll пази списъка с читъри в собствения си конфиг — никога не го презаписваме.
cs2dm_mod_config() { # име
  case "$1" in
    quakesounds) printf 'QuakeSounds' ;;
    cosmetics) printf 'Cosmetics' ;;
    demorecorder) printf 'DemoRecorder' ;;
    metablock) printf 'MetaBlock' ;;
  esac
  return 0
}
