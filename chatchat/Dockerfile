# Многослоен билд за ChatChat (Express 5 + Prisma 6, статичен фронтенд в public/). Крайният образ носи
# само каквото тича: нула компилатори, нула изходен код на TypeScript, непривилегирован потребител.
# Базата е Debian (glibc), не Alpine: argon2 е нативен модул и готовите му prebuild-ове са за glibc;
# Prisma тук ползва debian-openssl-3.0.x — същата цел и в билда, и в крайния образ.
# Образът е закован по digest (индексът за всички архитектури) — същият като в korpora/Dockerfile.
# Обновяване: `docker buildx imagetools inspect node:22-slim` → новият Digest тук (и в korpora).
FROM node:22-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS base
ENV TZ=UTC
# Prisma CLI не звъни до checkpoint.prisma.io (телеметрия) и не търси нова версия при всеки старт.
ENV CHECKPOINT_DISABLE=1
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
# openssl е за Prisma; ca-certificates — за изходящите заявки (Vertex AI, OAuth на Google).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- Зависимости ---
FROM base AS deps
# argon2: обикновено има готов prebuild; ако липсва, node-gyp иска компилатор — той стои само тук.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# --- Билд: prisma generate + TypeScript → dist ---
FROM deps AS build
COPY . .
RUN npm run build

# --- Само продукционните зависимости ---
# `prisma` (CLI) е в dependencies: entrypoint-ът пуска `prisma migrate deploy` при всеки старт.
FROM deps AS prod-deps
RUN npm prune --omit=dev && test -x node_modules/.bin/prisma

# --- Крайният образ ---
FROM base AS runner
# OCR за сканираните PDF и изображенията (§4.1): poppler (pdftoppm — растер на страница) и tesseract с
# италиански, английски и български. Само в крайния образ; викат се през execFile без shell, с таймаут.
# Версиите са заковани (Debian 12 bookworm, като базата): ъпдейт = нова версия тук. Ако Debian махне
# заковната версия (нова поправка по сигурност), билдът спира ПРЕДИ смяната — работещото не се пипа.
ARG TESSERACT_VERSION=5.3.0-2
ARG TESSDATA_VERSION=1:4.1.0-2
ARG POPPLER_VERSION=22.12.0-2+deb12u3
RUN apt-get update && apt-get install -y --no-install-recommends \
    "tesseract-ocr=${TESSERACT_VERSION}" \
    "tesseract-ocr-eng=${TESSDATA_VERSION}" \
    "tesseract-ocr-ita=${TESSDATA_VERSION}" \
    "tesseract-ocr-bul=${TESSDATA_VERSION}" \
    "poppler-utils=${POPPLER_VERSION}" \
  && rm -rf /var/lib/apt/lists/* \
  && tesseract --list-langs 2>&1 | grep -qx bul \
  && tesseract --list-langs 2>&1 | grep -qx ita \
  && pdftoppm -v >/dev/null 2>&1
# Една нишка на tesseract процес — едновременността я управлява опашката (OCR_CONCURRENCY).
ENV OMP_THREAD_LIMIT=1
ENV NODE_ENV=production
ENV PORT=4330
# В контейнера — 0.0.0.0 (иначе публикуваният порт не стига до процеса); навън портът е вързан
# само за 127.0.0.1 в docker-compose.yml.
ENV HOST=0.0.0.0
COPY --from=prod-deps /app/node_modules ./node_modules
# Генерираният клиент е от билда (в deps стадия няма схема — там е само празен stub).
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/dist ./dist
COPY public ./public
COPY prisma ./prisma
COPY package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
# Кодът остава на root, node само го чете: приложението не пише на диска (всичко е в базата), а
# `chown -R` би копирал всеки файл в нов слой и би дал на процеса право да пише собствения си код.
RUN chmod 755 ./docker-entrypoint.sh
USER node
EXPOSE 4330
# /healthz — жизненост на процеса (без базата); готовността с базата е /readyz (Uptime Kuma).
# Същият образ е и worker-ът (`node dist/worker.js`, услугата worker в docker-compose.yml) — той
# няма HTTP и ползва своя HEALTHCHECK от compose (файлът „жив съм“ в /tmp).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4330)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
