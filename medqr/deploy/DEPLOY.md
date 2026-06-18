# Разгръщане на MedQR в продукция (Hetzner / ЕС)

Ръководство за втвърдено пускане на MedQR на сървър под наем (напр. Hetzner Cloud,
Ubuntu 24.04 LTS). Приложението работи зад reverse proxy, който поема TLS, а самото
то слуша само на localhost.

Това е оперативно ръководство. Сигурността на приложението (криптиране, 2FA, CSP и
т.н.) е вградена в кода; тук става дума за средата около него.

## 0. Преди всичко

- Насочете DNS записа `medqr.carbonstealth.eu` (A/AAAA) към публичния IP на сървъра.
- Генерирайте ключ за криптиране: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- Подгответе SMTP данни (за потвърждение на имейл и нулиране на парола).

## 1. Втвърждаване на сървъра (базово)

```bash
# Потребител без root + SSH само с ключ
adduser --disabled-password medqr
# В /etc/ssh/sshd_config: PasswordAuthentication no, PermitRootLogin no
systemctl restart ssh

# Защитна стена: само SSH + HTTP(S)
ufw default deny incoming
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw enable

# Автоматични security ъпдейти
apt install -y unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades
```

## 2. Node.js и кодът

```bash
# Node 22 LTS (през NodeSource или nvm)
mkdir -p /opt/medqr && chown medqr:medqr /opt/medqr
sudo -u medqr git clone <repo> /opt/medqr   # или копирайте само medqr/ съдържанието
cd /opt/medqr
sudo -u medqr npm ci --omit=dev
```

## 3. Конфигурация и тайни

```bash
install -d -m 750 -o medqr -g medqr /etc/medqr
cat > /etc/medqr/medqr.env <<'ENV'
NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=https://medqr.carbonstealth.eu
ENCRYPTION_KEY=<64 hex символа>
MAIL_FROM=MedQR <no-reply@medqr.carbonstealth.eu>
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
ENV
chmod 600 /etc/medqr/medqr.env && chown medqr:medqr /etc/medqr/medqr.env
```

`ENCRYPTION_KEY` се пази САМО тук (и в офлайн копие на сигурно място). Загубата му
прави всички криптирани данни невъзстановими; изтичането му обезсмисля криптирането.

## 4. Услуга (systemd)

Файлът `deploy/systemd/medqr.service` е силно ограничен (sandboxing): без нови
привилегии, само `data/` е записваем, забранени са повечето системни извиквания.

```bash
cp deploy/systemd/medqr.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now medqr
systemctl status medqr
```

## 5. Reverse proxy и TLS

Изберете един от двата (примерите са в `deploy/`):

- **Caddy** (`deploy/caddy/Caddyfile`) — автоматичен Let's Encrypt, най-малко
  настройка. Препоръчително.
- **nginx** (`deploy/nginx/medqr.conf`) — с `certbot` за сертификатите.

И двата подават `X-Forwarded-Proto`/`X-Forwarded-For`, които приложението очаква
(`trust proxy` е включен). HSTS, CSP и другите заглавия се задават от приложението.

## 6. Защита на ниво мрежа

- **fail2ban** (`deploy/fail2ban/medqr.conf`) — банва IP-та с много 401/429 по
  чувствителните пътища. Допълва вградения lockout на ниво акаунт.
- По избор поставете сайта зад **Cloudflare** (WAF + DDoS защита). Тогава четете
  реалния IP от `CF-Connecting-IP` и ограничете достъпа до сървъра само до
  Cloudflare диапазоните.

## 7. Бекъпи

`deploy/backup.sh` прави консистентно копие на SQLite и го криптира с `age`.

```bash
apt install -y age
# Генерирайте ключова двойка веднъж и пазете ПРИВАТНИЯ ключ офлайн:
age-keygen -o /root/medqr-backup-key.txt   # съдържа и публичния "age1..." ключ
# Cron (дневно):
echo '15 3 * * * AGE_RECIPIENT=age1... /opt/medqr/deploy/backup.sh' | crontab -u medqr -
```

Тествайте възстановяване периодично: `age -d -i key.txt файл.age > medqr.sqlite`.
Съхранявайте копие извън сървъра (друга локация/доставчик в ЕС).

## 8. Мониторинг и логове

- `journalctl -u medqr -f` за логовете на приложението.
- Външен uptime монитор към `https://medqr.carbonstealth.eu/` (напр. на 1 мин).
- По избор: централизирани логове (Loki/ELK) и аларми при ръст на 401/5xx.
- Одит логът е tamper-evident (hash-верига) — целостта се проверява програмно.

## 9. Мащабиране към висока наличност (когато стане нужно)

SQLite е подходящ за един сървър. За HA с няколко инстанции:

- Мигрирайте към **управляван PostgreSQL** в ЕС. Слоят за достъп до данни е
  капсулиран (`src/db.js`, `src/profiles.js`, `src/auth.js`), така че смяната е
  локализирана; криптирането в покой остава на ниво приложение.
- Преместете сесиите/лимитите в споделено хранилище (напр. Redis), за да не зависят
  от конкретната инстанция.
- Сложете няколко инстанции зад load balancer; пазете `ENCRYPTION_KEY` в секрет-мениджър
  (HashiCorp Vault или KMS на доставчика).

## 10. Контролен списък преди „на живо"

- [ ] `NODE_ENV=production`, валиден `ENCRYPTION_KEY`, `PUBLIC_BASE_URL` по HTTPS.
- [ ] TLS работи; HTTP се пренасочва към HTTPS; HSTS присъства.
- [ ] systemd услугата се вдига при рестарт; правата на `.env` са 600.
- [ ] Бекъпите текат и възстановяването е тествано.
- [ ] fail2ban/WAF са активни; защитната стена пропуска само 22/80/443.
- [ ] Правни: подписан DPA с Hetzner, готови DPIA и политики (виж проучването).
