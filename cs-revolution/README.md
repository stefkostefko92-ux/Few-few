# Carbon Stealth Revolution

The most advanced single-page website ever built. 2,054 lines of React + Three.js + Web Audio + Speech Synthesis + Claude AI.

## Quick Start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # Production build → dist/
```

## Deploy to VPS (178.104.77.242)

### Option A: Direct deploy
```bash
# On local machine: build
npm install && npm run build

# Upload dist/ to VPS
scp -r dist/* root@178.104.77.242:/var/www/carbonstealth.eu/dist/

# Copy nginx config
scp nginx/carbonstealth.conf root@178.104.77.242:/etc/nginx/sites-available/carbonstealth.eu

# On VPS: enable and reload
ssh root@178.104.77.242
ln -sf /etc/nginx/sites-available/carbonstealth.eu /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### Option B: Full deploy script
```bash
# On VPS, clone/upload project then:
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

### Option C: Docker
```bash
docker compose up -d --build
# Serves on port 8090, reverse proxy with your main Nginx
```

## Structure

```
cs-revolution/
├── src/
│   ├── App.jsx          # Main component (2,054 lines)
│   └── main.jsx         # React entry point
├── public/
│   ├── favicon.svg      # CS monogram
│   ├── robots.txt       # AI bots allowed (AEO)
│   ├── sitemap.xml      # 14 URLs with hreflang
│   ├── manifest.webmanifest
│   └── .well-known/
│       └── security.txt
├── nginx/
│   └── carbonstealth.conf  # Full Nginx config with SSL, security, caching
├── scripts/
│   └── deploy.sh        # One-click VPS deploy
├── Dockerfile           # Multi-stage build
├── docker-compose.yml
├── package.json
├── vite.config.js
└── index.html
```

## Features

- 3 languages (IT/EN/BG) with auto-detection by timezone
- Admin dashboard (Ctrl+Shift+A) monitoring 7 CS sites
- 8,000 particle text formation with mouse repulsion (GLSL shaders)
- BIOS boot sequence reading real device hardware
- Claude AI terminal with Speech Synthesis
- 6 JSON-LD schemas (Organization, WebSite, FAQPage, LocalBusiness, ItemList, Speakable)
- 30+ browser APIs used simultaneously

## Tech Stack

React 18 · Vite 6 · Three.js · Web Audio API · Speech Synthesis · Anthropic API
Canvas 2D (5 layers) · SVG Filters · GLSL Shaders · CSS Animations

## Company

Carbon Stealth VCC · EIK BG208725180
ul. Samuil 3, Bobov Dol 2670, Bulgaria
info@carbonstealth.eu
