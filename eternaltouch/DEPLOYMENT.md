# Eternal Touch — Deployment

Target: VPS `178.104.77.242` (Ubuntu 24.04) · Domain: `eternaltouch.it`

---

## One-shot deployment

Copy the tarball to the VPS, then paste this block as `root`:

```bash
set -e

echo "═══════════════════════════════════════════"
echo "  ETERNAL TOUCH — DEPLOYMENT"
echo "═══════════════════════════════════════════"

# 1. Extract project
cd /opt
mkdir -p eternaltouch
cd eternaltouch
tar -xzf /tmp/eternaltouch.tar.gz --strip-components=1
echo "✅ Extracted"

# 2. Generate strong secrets
DB_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
COOKIE_SECRET=$(openssl rand -base64 48 | tr -d '\n')
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')
# Generate the admin password too — never hard-code it in a file that travels.
ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '\n')

# 3. Create .env  (fill SMTP_* with your real Register.it mailbox credentials)
cat > .env <<EOF
DB_PASSWORD=${DB_PASSWORD}
JWT_SECRET=${JWT_SECRET}
COOKIE_SECRET=${COOKIE_SECRET}
SESSION_SECRET=${SESSION_SECRET}
ADMIN_EMAIL=info@eternaltouch.it
ADMIN_PASSWORD=${ADMIN_PASSWORD}
SITE_URL=https://eternaltouch.it
NODE_ENV=production
PORT=4300
SMTP_HOST=authsmtp.register.it
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=info@eternaltouch.it
SMTP_PASS=CHANGE_ME
SMTP_FROM=Eternal Touch <info@eternaltouch.it>
NOTIFY_TO=info@eternaltouch.it
EOF
chmod 600 .env
echo "✅ .env generated with strong random secrets"
echo "🗝️  Generated admin password: ${ADMIN_PASSWORD}  (save it in your password manager now — it is not stored anywhere else)"

# 4. Build + start
docker compose down 2>/dev/null || true
docker compose up -d --build
echo "✅ Containers started"

# 5. Wait for DB ready
echo "⏳ Waiting for DB..."
for i in 1 2 3 4 5 6 7 8 9 10; do
    if docker compose exec -T postgres pg_isready -U eternaltouch >/dev/null 2>&1; then
        echo "✅ DB ready"
        break
    fi
    sleep 2
done

# 6. Run seed (admin user + collections + content)
docker compose exec -T app node prisma/seed.js
echo "✅ DB seeded"

# 7. Nginx config
cp nginx/eternaltouch.conf /etc/nginx/sites-available/
ln -sf /etc/nginx/sites-available/eternaltouch.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
echo "✅ Nginx configured"

# 8. SSL via certbot (installs an auto-reload deploy hook so renewals go live)
certbot --nginx -d eternaltouch.it -d www.eternaltouch.it --non-interactive --agree-tos -m info@eternaltouch.it --redirect \
  --deploy-hook "systemctl reload nginx"
echo "✅ SSL active"

echo ""
echo "═══════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════════"
echo ""
echo "🌐 Site:      https://eternaltouch.it"
echo "🔐 Admin:     https://eternaltouch.it/admin"
echo "📧 Login:     info@eternaltouch.it"
echo "🗝️  Password:  (the generated ADMIN_PASSWORD printed above — stored only in your password manager)"
echo ""
echo "⚠️  Cambia la password admin al primo login (Impostazioni)"
echo "═══════════════════════════════════════════"
```

---

## Prerequisites on VPS

If not already installed:

```bash
# Docker + Compose
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin

# Nginx + Certbot
apt-get install -y nginx certbot python3-certbot-nginx
```

## DNS

Point these records to the VPS:

```
eternaltouch.it       A  178.104.77.242
www.eternaltouch.it   A  178.104.77.242
```

## Useful commands

```bash
cd /opt/eternaltouch

# View logs
docker compose logs -f app
docker compose logs -f postgres

# Restart
docker compose restart app

# Update after code changes
docker compose down
docker compose up -d --build

# Backup database
docker compose exec -T postgres pg_dump -U eternaltouch eternaltouch | gzip > backup-$(date +%F).sql.gz

# Backup uploads
tar -czf uploads-$(date +%F).tar.gz src/public/uploads/

# Reset admin password (if forgotten)
docker compose exec app node -e "
const bcrypt=require('bcryptjs');
const{PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const h=await bcrypt.hash('NewPassword123!',12);
  await p.adminUser.update({where:{email:'info@eternaltouch.it'},data:{password:h}});
  console.log('Reset done');
  process.exit(0);
})();"
```

## Update procedure (subsequent deploys)

When you have a new tarball:

```bash
cd /opt/eternaltouch
docker compose down
tar -xzf /tmp/eternaltouch.tar.gz --strip-components=1
docker compose up -d --build
docker compose logs -f app
```

The `.env` file and uploads volume are preserved across updates.

## Health check

```bash
curl -I https://eternaltouch.it
curl https://eternaltouch.it/sitemap.xml | head -20
curl https://eternaltouch.it/robots.txt
```
