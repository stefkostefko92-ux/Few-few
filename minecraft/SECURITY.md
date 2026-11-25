# Сигурност — minecraft/

Общата политика и докладването на уязвимости → `../SECURITY.md`.

## Повърхност

| Изложено | Защита |
| --- | --- |
| `https://mc.carbonstealth.eu` (Pelican Panel) | TLS (nginx), HSTS, лимит на входа (Filament 5/мин. + nginx), 2FA за админите |
| `https://node-mc.carbonstealth.eu` (Wings API) | TLS (nginx); всяка заявка иска токен от панела (JWT за конзолата/файловете) |
| `2022/tcp` (SFTP) | потребител + парола от панела, достъп само до файловете на собствения сървър |
| `25565/tcp` (Minecraft) | offline режим + `enforce-whitelist` (играчите нямат Java акаунти — рискът е в `README.md`); без `op` за играчи |

Панелът (`127.0.0.1:4330`), Wings (`127.0.0.1:4331`), MariaDB и Redis не са достъпни отвън.

## Тайни

`/opt/pelican/.env` (APP_KEY, пароли на MariaDB/Redis) и `/etc/pelican/config.yml` (токенът на нода) —
mode 600, генерирани на сървъра, никога в репото или в архива за деплой. Бекъпите в
`/var/backups/pelican` (700) ги съдържат — копията извън VPS-а се шифроват.

## Известни компромиси

- Pelican е `v1.0.0-rc.1` (release candidate). Следим релийзите в `github.com/pelican/panel` и
  `github.com/pelican/wings` и обновяваме по `README.md` → „Ъпдейт“.
- Wings върви като root (изискване на Pelican — управлява Docker); игровите контейнери вървят като
  непривилегирован потребител `pelican` с лимити на RAM/CPU/диск/PID.
- Плъгините на Paper са чужд код с достъп до света и мрежата на контейнера: само от `hangar.papermc.io`
  / `modrinth.com`, за точната версия, и с бекъп преди качване.
- Портовете на игровите контейнери ги публикува Docker и `ufw` не ги филтрира — затварянето е в
  Hetzner Firewall.
