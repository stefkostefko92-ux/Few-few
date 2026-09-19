# Многослоен билд за Piuma (Express + Prisma + BullMQ) на VPS.
# Крайният образ носи само каквото тича: нула компилатори, нула източници, непривилегирован потребител.
FROM node:22-slim AS base
ENV TZ=UTC
# openssl е за Prisma; ca-certificates — за изходящите заявки към Instagram/Anthropic.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- Зависимости ---
FROM base AS deps
# `argon2` е нативен модул. Обикновено идва с готов prebuild за тази платформа, но ако
# липсва, `node-gyp` иска компилатор — държим ги ТУК, а не в крайния образ.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# Без `--ignore-scripts`: install скриптът на argon2 трябва да се изпълни, иначе
# нативната връзка липсва и хеширането на паролата пада чак по време на работа.
RUN npm ci

# --- Билд ---
FROM deps AS build
COPY . .
RUN npm run build

# --- Продукционни зависимости (без devDependencies) ---
# `prisma` (CLI-то) е същинска производствена зависимост, не развойна: entrypoint-ът пуска
# `prisma migrate deploy` при всеки старт. Оставено в devDependencies, `prune` го маха и
# контейнерът гърми при първия старт — затова е в `dependencies`, а не се дърпа с npx.
FROM deps AS prod-deps
RUN npm prune --omit=dev && test -x node_modules/.bin/prisma

# --- Крайният образ ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=4310
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY prisma ./prisma
# Изгледите, речниците и статиката се четат от диска по време на работа.
COPY views ./views
COPY locales ./locales
COPY public ./public
COPY package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && chown -R node:node /app
# Непривилегирован потребител — образът няма нужда от root, за да слуша на 4310.
USER node
EXPOSE 4310
# `/health` пита базата; при недостъпна база връща 503 и контейнерът се маркира нездрав.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4310)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
