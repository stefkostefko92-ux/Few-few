#!/bin/bash
# certbot deploy hook (/etc/letsencrypt/renewal-hooks/deploy/): пуска се САМО след
# успешно подновяване. Без него `certonly --webroot` подновява файла, но nginx
# продължава да сервира стария сертификат от паметта до следващия рестарт.
set -euo pipefail
if command -v nginx >/dev/null 2>&1 && nginx -t >/dev/null 2>&1; then
  systemctl reload nginx
fi
