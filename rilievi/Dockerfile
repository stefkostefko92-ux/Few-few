# Многослоен билд за Rilievi Impianti (Express + Prisma + EJS). Крайният образ носи само каквото тича:
# нула компилатори, нула изходен код на TypeScript, непривилегирован потребител.
# Образът е закован по digest (същият като korpora): същият таг утре не носи тихо друг образ.
# Обновяване: `docker buildx imagetools inspect node:22-slim` → новият Digest тук.
FROM node:22-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS base
ENV TZ=UTC
# openssl е за Prisma; ca-certificates — за SMTP; fonts-dejavu-core — DejaVu Sans за PDF-а (кирилица).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*
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
RUN chmod 755 ./docker-entrypoint.sh
USER node
EXPOSE 4330
# /health пита базата; при недостъпна база връща 503 и контейнерът се маркира нездрав.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4330)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
