# Contact form → register.it SMTP (Hetzner-safe)

Формата (`api/contact.php`) вече е готова: пробва **PHPMailer SMTP → mail() → лог**.
За да тръгнат реални имейли трябват само 3 неща на сървъра: (1) PHPMailer,
(2) env променливи с паролата, (3) правилен порт. Паролата **никога** не влиза в repo.

## Защо не тръгваше досега
- PHPMailer не беше инсталиран (няма `vendor/`) → SMTP се прескачаше.
- `mail()` на Hetzner ползва изходящ **порт 25**, който **Hetzner блокира по подразбиране** (анти-спам) → имейлът не тръгва → пада на лог.
- **Решение:** authenticated SMTP към register.it на **порт 465 (SSL)** или **587 (STARTTLS)** — тези портове **не са блокирани** от Hetzner.

## register.it SMTP параметри
Потвърди ги в панела на register.it (Impostazioni casella → *Server posta in uscita*).
Стандартните за authenticated SMTP:

| Поле | Стойност |
|------|----------|
| Host | `authsmtp.securemail.pro` |
| Порт | **465** (SSL, препоръчан) · алт. **587** (STARTTLS) |
| Security | SSL (за 465) / STARTTLS (за 587) |
| Username | пълният имейл — `info@carbonstealth.eu` |
| Password | паролата на пощата / на SMTP акаунта |

⚠️ register.it понякога иска **активиране на „SMTP autenticato"** за пощата
(https://www.register.it/assistenza/soluzione-invii-email/). Ако 465/587 дава
auth грешка — активирай го от панела. Ако панелът сочи друг хост, просто го
подай през `CS_SMTP_HOST` (виж долу) — нищо в кода не е заковано.

## Стъпки на сървъра (Hetzner)

**1. Инсталирай PHPMailer** (в корена на сайта, където е `composer.json`):
```bash
cd /var/www/carbonstealth   # където е разгънат сайтът
composer install --no-dev --optimize-autoloader
# създава vendor/autoload.php — contact.php автоматично го хваща
```

**2. Задай env променливите в PHP-FPM pool** (напр. `/etc/php/8.5/fpm/pool.d/www.conf`):
```ini
env[CS_SMTP_HOST]      = authsmtp.securemail.pro
env[CS_SMTP_PORT]      = 465
env[CS_SMTP_SECURE]    = ssl
env[CS_SMTP_USER]      = info@carbonstealth.eu
env[CS_SMTP_PASS]      = ТВОЯТА_ПАРОЛА
env[CS_SMTP_FROM]      = info@carbonstealth.eu
env[CS_SMTP_TO]        = info@carbonstealth.eu
```
(за порт 587 сложи `CS_SMTP_PORT=587` и `CS_SMTP_SECURE=tls`)

После презареди:
```bash
sudo systemctl reload php8.5-fpm
```

**3. Тествай от сървъра** (показва целия SMTP диалог):
```bash
cd /var/www/carbonstealth
CS_SMTP_PASS='ТВОЯТА_ПАРОЛА' php scripts/smtp-test.php твоя-личен@имейл.com
```
Търсиш `✅ SENT OK`. Ако гръмне — съобщението от register.it/Hetzner ще е в изхода
(напр. `SMTP connect() failed` = грешен хост/порт; `authentication failed` = парола/активиране).

## Deliverability (да не влиза в spam) — DNS при регистратора
Тъй като пращаш „от" `carbonstealth.eu` през сървърите на register.it:
- **SPF** — добави include-а на register.it в TXT записа на домейна (register.it го дава; типично `include:_spf.securemail.pro` или техния). Пример:
  `v=spf1 include:_spf.securemail.pro ~all`
- **DKIM** — активирай от register.it (ако предлагат) и сложи CNAME/TXT записа.
- **DMARC** — `_dmarc` TXT: `v=DMARC1; p=none; rua=mailto:info@carbonstealth.eu`

## Проверка че всичко работи
1. `php scripts/smtp-test.php` → `✅ SENT OK`.
2. Пусни реалната форма на сайта → трябва да получиш имейла + auto-reply.
3. В админа (INDEXNOW/CONTACTS) съобщенията се логват винаги (дори SMTP да падне) — така не се губи lead.

## Fallback поведение (вече вградено)
`contact.php`: SMTP → ако падне `mail()` → ако падне, **лог във файл** и връща `{"ok":true,"message":"logged"}`. Тоест дори при проблем със SMTP, lead-ът не се губи и се вижда в админа.
