#!/bin/bash
# ═══════════════════════════════════════════════════
# Carbon Stealth VCC — Full Production Deploy
# Run as root on VPS: bash deploy.sh
# ═══════════════════════════════════════════════════
set -e

echo "╔══════════════════════════════════════════════╗"
echo "║  CARBON STEALTH — FULL PRODUCTION DEPLOY     ║"
echo "╚══════════════════════════════════════════════╝"

ARCHIVE="/root/cs-revolution-vps.tar.gz"
WEBROOT="/var/www/carbonstealth.eu"
NGINX_CONF="/etc/nginx/sites-available/carbonstealth.eu"

# 1. Check archive exists
if [ ! -f "$ARCHIVE" ]; then
  echo "✗ Archive not found: $ARCHIVE"
  echo "  Upload it first: scp cs-revolution-vps.tar.gz root@178.104.77.242:/root/"
  exit 1
fi

# 2. Extract archive
echo ""
echo "═══ EXTRACTING ═══"
cd /root
rm -rf cs-revolution/  # clean previous extraction
tar -xzf "$ARCHIVE"
echo "✓ Extracted cs-revolution/"

# 3. FULL COPY — dist to webroot (with --delete to remove stale files)
echo ""
echo "═══ DEPLOYING DIST ═══"
rsync -av --delete --exclude='api/' cs-revolution/dist/ "$WEBROOT/"
echo "✓ All dist files synced to $WEBROOT"

# 4. COPY API FILES (preserve logs)
echo ""
echo "═══ DEPLOYING API ═══"
cp cs-revolution/api/*.php "$WEBROOT/api/"
mkdir -p "$WEBROOT/api/logs"
chmod 750 "$WEBROOT/api/logs"   # PII lives here — never world-readable
echo "✓ API files deployed"

# 5. NGINX CONFIG
echo ""
echo "═══ DEPLOYING NGINX ═══"
cp cs-revolution/nginx/carbonstealth.conf "$NGINX_CONF"
nginx -t
systemctl reload nginx
echo "✓ Nginx config deployed and reloaded"

# 6. PERMISSIONS
echo ""
echo "═══ SETTING PERMISSIONS ═══"
chown -R www-data:www-data "$WEBROOT"
echo "✓ Permissions set"

# 7. VERIFICATION
echo ""
echo "═══ VERIFICATION ═══"

# Check critical files exist
for f in index.html favicon.ico favicon.svg 404.html logo.webp og-image.png og-image-en.png og-image-bg.png robots.txt llms.txt sitemap.xml sitemap-pages.xml sitemap-blog.xml sitemap-geo.xml manifest.webmanifest; do
  if [ -f "$WEBROOT/$f" ]; then
    echo "  ✓ /$f"
  else
    echo "  ✗ MISSING: /$f"
  fi
done

# Check .well-known
echo "  $([ -f "$WEBROOT/.well-known/security.txt" ] && echo '✓' || echo '✗') /.well-known/security.txt"

# Check IndexNow key
echo "  $([ -f "$WEBROOT/cs26a9f3b7d1e4c8592f0a7b3d8e5c1f64.txt" ] && echo '✓' || echo '✗') /cs26...txt (IndexNow key)"

# Check subdirectories
for d in test en/test bg/test en/services/web-development en/about bg/uslugi/web-razrabotka bg/za-nas geo/milano contatti; do
  if [ -f "$WEBROOT/$d/index.html" ]; then
    echo "  ✓ /$d/"
  else
    echo "  ✗ MISSING: /$d/"
  fi
done

# Check API
echo "  $([ -f "$WEBROOT/api/analyze.php" ] && echo '✓' || echo '✗') /api/analyze.php"
echo "  $([ -f "$WEBROOT/api/email-templates.php" ] && echo '✓' || echo '✗') /api/email-templates.php"
echo "  $([ -f "$WEBROOT/api/indexnow.php" ] && echo '✓' || echo '✗') /api/indexnow.php"
echo "  $([ -f "$WEBROOT/api/sse-leads.php" ] && echo '✓' || echo '✗') /api/sse-leads.php"

# HTTP checks
echo ""
echo "═══ LIVE HTTP CHECKS ═══"
for url in \
  "https://carbonstealth.eu/" \
  "https://carbonstealth.eu/test/" \
  "https://carbonstealth.eu/en/test/" \
  "https://carbonstealth.eu/bg/test/" \
  "https://carbonstealth.eu/en/services/web-development/" \
  "https://carbonstealth.eu/bg/uslugi/web-razrabotka/" \
  "https://carbonstealth.eu/en/about/" \
  "https://carbonstealth.eu/bg/za-nas/" \
  "https://carbonstealth.eu/geo/milano/" \
  "https://carbonstealth.eu/llms.txt" \
  "https://carbonstealth.eu/robots.txt" \
  "https://carbonstealth.eu/sitemap-geo.xml" \
  "https://carbonstealth.eu/og-image-en.png" \
  "https://carbonstealth.eu/logo.webp" \
  "https://carbonstealth.eu/favicon.ico" \
  "https://carbonstealth.eu/404.html" \
  "https://carbonstealth.eu/.well-known/security.txt"; do
  CODE=$(curl -sI --max-time 3 "$url" | head -1 | awk '{print $2}')
  echo "  $CODE $url"
done

# Security headers
echo ""
echo "═══ SECURITY HEADERS ═══"
curl -sI https://carbonstealth.eu/ | grep -iE "strict-transport|x-frame|x-content-type|content-security|referrer-policy|permissions-policy"

# 301 redirects
echo ""
echo "═══ 301 REDIRECTS ═══"
curl -sI https://carbonstealth.eu/en/servizi/sviluppo-siti-web/ | grep -iE "HTTP|location" | head -2
curl -sI https://carbonstealth.eu/bg/chi-siamo/ | grep -iE "HTTP|location" | head -2

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  DEPLOY COMPLETE                              ║"
echo "╚══════════════════════════════════════════════╝"
