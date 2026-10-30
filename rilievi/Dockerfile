# Многослоен билд за Rilievi Impianti (Express + Prisma + EJS). Крайният образ носи само каквото тича:
# нула компилатори, нула изходен код на TypeScript, непривилегирован потребител.
# Образът е закован по digest (същият като korpora): същият таг утре не носи тихо друг образ.
# Обновяване: `docker buildx imagetools inspect node:22-slim` → новият Digest тук.
FROM node:22-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS base
ENV TZ=UTC
# openssl е за Prisma; ca-certificates — за SMTP; fonts-dejavu-core — DejaVu Sans за PDF-а (кирилица);
# poppler-utils — pdftoppm: картинката на табелата е самият ѝ PDF (src/cartelli/vista.ts), само наш PDF.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates fonts-dejavu-core \
    poppler-utils \
  && rm -rf /var/lib/apt/lists/* \
  && pdftoppm -v
WORKDIR /app

# --- Зависимости ---
FROM base AS deps
# argon2 е нативен модул: обикновено има готов prebuild, но ако липсва, node-gyp иска компилатор —
# той стои само в този слой.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# Playwright е само за e2e теста — браузър в образа не трябва.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

# --- Билд: TypeScript → dist, шрифтовете (@fontsource) → public/fonts ---
FROM deps AS build
COPY . .
RUN npm run build

# --- Само продукционните зависимости ---
# `prisma` (CLI) е в dependencies: entrypoint-ът пуска `prisma migrate deploy` при всеки старт.
FROM deps AS prod-deps
RUN npm prune --omit=dev && test -x node_modules/.bin/prisma

# --- Крайният образ ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=4330
ENV HOST=0.0.0.0
ENV PDF_FONT_DIR=/usr/share/fonts/truetype/dejavu
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/public ./public
COPY prisma ./prisma
# Официалните модули на доставчиците (PDF + карта на полетата) — изходът е самият оригинал.
COPY assets ./assets
COPY views ./views
COPY locales ./locales
COPY package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
# Кодът остава на root, node само го чете — процесът няма право да пише собствения си код.
# Снимките и клиповете — томът `media` (docker-compose.yml); новият том поема собственика от образа.
RUN chmod 755 ./docker-entrypoint.sh && install -d -o node -g node -m 750 /data/media
USER node
EXPOSE 4330
# /health пита базата; при недостъпна база връща 503 и контейнерът се маркира нездрав.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4330)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]

# --- Фоновият процес на снимките и клиповете (src/worker.ts) ---
# Същият код и същите зависимости + ffmpeg (H.264/AAC, zscale за HDR). Само тук: приложението, което
# приема заявките от мрежата, няма ffmpeg. Миграциите ги прилага приложението — тук entrypoint няма.
FROM runner AS worker
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/* \
  && ffmpeg -hide_banner -encoders | grep -q libx264
USER node
# Жив е, докато докосва файла си (на 15 s и на всеки цикъл); увиснал — Docker го маркира нездрав.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const f=require('node:path').join(require('node:os').tmpdir(),'rilievi-worker.alive');process.exit(Date.now()-require('node:fs').statSync(f).mtimeMs<60000?0:1)"
ENTRYPOINT []
CMD ["node", "dist/worker.js"]
