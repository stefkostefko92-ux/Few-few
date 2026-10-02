# Многослоен билд за Rendetto (Express + Prisma + EJS). Крайният образ носи само каквото тича:
# нула компилатори, нула изходен код на TypeScript, непривилегирован потребител.
FROM node:22-slim AS base
ENV TZ=UTC
# openssl е за Prisma; ca-certificates — за изходящите заявки (SMTP, проверката на паролите).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- Зависимости ---
FROM base AS deps
# argon2 е нативен модул: обикновено има готов prebuild, но ако липсва, node-gyp иска компилатор —
# той стои само в този слой.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# Playwright е само за тестовете и картинката за споделяне — браузър в образа не трябва.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

# --- Билд: TypeScript → dist, редакторът (three.js + двигателя) → public/editor ---
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
ENV PORT=4320
ENV HOST=0.0.0.0
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/public ./public
COPY prisma ./prisma
# Двигателят се зарежда от диска (общ с браузъра); изгледите и речниците — също.
COPY engine ./engine
COPY views ./views
COPY locales ./locales
COPY package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
# data/ (каталогът от магазините и GeoIP базата) идва като volume от сървъра — не е в образа.
RUN mkdir -p data && chmod +x ./docker-entrypoint.sh && chown -R node:node /app
USER node
EXPOSE 4320
# /health пита базата; при недостъпна база връща 503 и контейнерът се маркира нездрав.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4320)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
