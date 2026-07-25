#!/usr/bin/env bash
# ОСТАРЯЛ пряк път (сочеше PM2 деплоя). Деплоят на panev минава през каноничния
# скрипт на монорепото:
#
#   еднократна подготовка на сървъра:  sudo bash panev/scripts/bootstrap-vps.sh
#   деплой на кода:                    sudo PROJECTS="panev" bash deploy/autodeploy.sh
#
# Виж panev/DEPLOY.md.
exec "$(dirname "$0")/scripts/deploy.sh" "$@"
