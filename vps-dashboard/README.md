# Carbon Stealth VPS Dashboard

Пълен контролен панел за VPS сървър с графичен интерфейс — управлявай **всичко** от
един екран. Един и същ панел върви на всеки от твоите VPS-и и ги контролира и двата
през federation.

> Продукт на **Carbon Stealth VCC** — част от монорепото. Нула runtime зависимости
> (само Node ≥20 stdlib). Български интерфейс.

## Какво може
| Секция | Действия |
|--------|----------|
| **Обзор** | CPU / памет / мрежа / диск на живо (SSE + canvas графики) + 24ч история, uptime, ОС/ядро |
| **Продукти** | health на всеки продукт от монорепото (живи локални URL-и) |
| **Услуги** | systemd list/филтър, start/stop/restart/reload, статус |
| **Docker** | контейнери + stats + логове, start/stop/restart, образи |
| **Процеси** | топ по CPU/памет, kill (SIGTERM/SIGKILL) |
| **Логове** | journal tail + следене на живо, филтър по unit/приоритет |
| **Деплой** | releases/архиви + пускане на `autodeploy.sh` (избор на проекти) с жив изход |
| **Ъпдейти** | apt upgradable, security-only / пълен upgrade като фонова задача |
| **Сигурност** | ufw, отворени портове, fail2ban, SSH конфиг, TLS сертификати (дни до изтичане), последни входове |
| **Бекъпи** | известни бекъп папки + releases за rollback |
| **Крон/таймери** | systemd таймери + crontab-и |
| **Файлове** | браузър + преглед (само четене) |
| **Терминал** | пълен уеб shell (bash), одитиран, изход на живо |
| **Агенти** | флотът от `agents.json` + пускане на агентските инструменти (oversee, secret-scan, deploy-check…) |
| **Задачи** | всички фонови задачи + жив изход + спиране |
| **Одит** | append-only дневник на всяко действие |
| **Захранване** | reboot / poweroff |

Всичко се превключва между възлите (локален + peer-и) от падащото меню горе вляво.

## Бърз старт (локално, dev)
```bash
cd vps-dashboard
npm run dev          # печата еднократна парола; отвори http://127.0.0.1:7700
```

## Инсталация на сървъра
```bash
# 1) Еднократно: създава конфиг (тайни + парола), systemd услуга, вдига панела.
sudo bash deploy/install.sh
#    → админ паролата се записва в /etc/vps-dashboard/initial-admin-credential.txt (mode 600)

# 2) Публикувай зад Nginx + TLS (препоръчително + Basic-auth):
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/vps-dashboard.conf
#    смени server_name → твоя домейн, после:
sudo ln -s /etc/nginx/sites-available/vps-dashboard.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d vps1.carbonstealth.eu
#    и в config.json сложи "trustProxy": true
```
Оттам нататък деплоят е автоматичен през канона на репото: `deploy/autodeploy.sh`
разгръща и `vps-dashboard` (rsync + рестарт; конфигът/state оцеляват).

## Двата VPS-а (federation)
На **всеки** сървър инсталирай панела и им дай общ `peerToken`:
```bash
# На VPS №1 в /etc/vps-dashboard/config.json:
{ "peerToken": "<общ-дълъг-таен-низ>",
  "peers": [ { "id": "vps2", "name": "VPS Две", "url": "https://vps2.carbonstealth.eu", "token": "<общ-дълъг-таен-низ>" } ] }
# На VPS №2 — огледално, peer сочи към VPS №1.
```
Сега от единия панел превключваш към другия възел и го управляваш изцяло (вкл. живи
графики и терминал) — заявките се проксират сигурно с Bearer токена.

## Сигурност
Панелът управлява целия сървър → третирай го като най-чувствителния вход. Слуша само на
`127.0.0.1`, публично само зад TLS. Пълните защити и моделът на заплахата → [`SECURITY.md`](./SECURITY.md).

## Разработка
`npm run lint && npm test` (нула зависимости, `node --test`). Детайли → [`CLAUDE.md`](./CLAUDE.md).
