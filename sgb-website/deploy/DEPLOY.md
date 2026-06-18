# Ръководство за инсталация на VPS

Стъпка по стъпка за хостинг на уебсайта на СГБ върху Ubuntu/Debian сървър.

## 1. Изисквания

- VPS с Ubuntu 22.04+ / Debian 12+
- Домейн, насочен към IP адреса на сървъра (A запис, напр. `bg.sgbbg.com`)
- Node.js 20 LTS или по-нов

```bash
# Node.js 20 (ако липсва)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential

# Инструменти
sudo apt-get install -y nginx git
```

> `build-essential` е нужен за компилиране на `better-sqlite3`.

## 2. Сваляне на кода

```bash
sudo mkdir -p /var/www && cd /var/www
sudo git clone <ВАШИЯТ_REPO_URL> sgb-website
cd sgb-website/sgb-website          # папката с приложението
sudo chown -R $USER:$USER /var/www/sgb-website
npm ci --omit=dev
```

## 3. Конфигурация

```bash
cp .env.example .env
openssl rand -hex 32                # копирайте резултата в SESSION_SECRET
nano .env
```

Задължително задайте:
- `SITE_URL=https://bg.sgbbg.com`
- `SESSION_SECRET=<генерирания низ>`
- `TRUST_PROXY=1`
- `ADMIN_PASSWORD=<силна парола>`

Инициализирайте базата и администратора:

```bash
npm run setup
```

## 4. Стартиране на процеса

### Вариант А — PM2 (препоръчан)

```bash
sudo npm i -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # изпълнете подадената команда, за да стартира при reboot
```

### Вариант Б — systemd

```bash
sudo cp deploy/sgb-website.service /etc/systemd/system/
# редактирайте WorkingDirectory/User при нужда
sudo systemctl daemon-reload
sudo systemctl enable --now sgb-website
sudo systemctl status sgb-website
```

## 5. Nginx и SSL

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/sgb
# редактирайте server_name и пътищата според вашия домейн/папка
sudo ln -s /etc/nginx/sites-available/sgb /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Безплатен SSL сертификат
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d bg.sgbbg.com -d www.bg.sgbbg.com
```

Certbot автоматично подновява сертификата.

## 6. Проверка

- Отворете `https://bg.sgbbg.com` — началната страница.
- `https://bg.sgbbg.com/admin` — вход в панела.
- `https://bg.sgbbg.com/sitemap.xml` и `/robots.txt` — SEO.

## 7. След инсталацията

1. Влезте в `/admin` и сменете паролата си (Потребители → Смяна на паролата).
2. Попълнете данните в **Настройки** (контакти, социални мрежи).
3. Прегледайте и адаптирайте правните страници (Страници).
4. Добавете първите статии и брой на вестника.
5. Регистрирайте сайта в Google Search Console и подайте `sitemap.xml`.

## Резервни копия

```bash
# База данни + качени файлове
tar czf sgb-backup-$(date +%F).tar.gz data/ public/uploads/
```

## Актуализация

```bash
cd /var/www/sgb-website/sgb-website
git pull
npm ci --omit=dev
pm2 reload sgb-website      # или: sudo systemctl restart sgb-website
```

## Често срещани проблеми

| Проблем | Решение |
|---|---|
| `better-sqlite3` грешка при инсталация | Инсталирайте `build-essential` (gcc/make) и преинсталирайте. |
| 502 Bad Gateway | Проверете дали процесът работи: `pm2 status` / `systemctl status sgb-website`. |
| Качването на PDF е блокирано | Увеличете `client_max_body_size` в Nginx (вече е 60M). |
| Сесиите не се запазват | Уверете се, че `TRUST_PROXY=1` и сайтът работи по HTTPS. |
