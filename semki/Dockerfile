# Многослоен билд за Semki Bot (discord.js + Express + Prisma + EJS). Крайният образ носи само каквото
# тича: нула компилатори, нула изходен код на TypeScript, непривилегирован потребител.
# Образът е закован по digest (същият като rilievi/korpora): същият таг утре не носи тихо друг образ.
# Обновяване: `docker buildx imagetools inspect node:22-slim` → новият Digest тук.
FROM node:22-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS base
ENV TZ=UTC
# openssl е за Prisma; ca-certificates — за HTTPS към Discord.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- Зависимости ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- Билд: prisma generate + TypeScript → dist, браузърният код (three.js) → public/js ---
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
ENV PORT=4340
ENV HOST=0.0.0.0
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY prisma ./prisma
COPY views ./views
COPY --from=build /app/public ./public
COPY package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
# Кодът остава на root, node само го чете — процесът няма право да пише собствения си код.
RUN chmod 755 ./docker-entrypoint.sh
USER node
EXPOSE 4340
# /health пита базата; при недостъпна база връща 503 и контейнерът се маркира нездрав.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4340)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
