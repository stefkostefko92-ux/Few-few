# Linketto — многослоен билд за продукция (Next.js 15 + Prisma + sharp).
# Крайният образ носи само prod зависимостите, генерирания Prisma клиент и
# `.next`; върви като непривилегирован потребител (моделът на zabobovdol/Minyor).
# Здравната проба е в docker-compose.yml (node fetch към /api/health — в slim няма curl).
#
# Защо node:22-slim, а не alpine: Prisma разпознава libssl по системната
# библиотека, а sharp и Prisma engine-ите имат glibc сборки по подразбиране —
# по-малко движещи се части от musl варианта.
FROM node:22-slim AS base
ENV TZ=UTC
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- Зависимости (с dev — нужни са за билда: typescript, tailwind, eslint) ---
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# --- Билд: prisma generate + next build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Билдът не се свързва с база (страниците с БД са динамични), но Prisma иска
# валиден URL в средата. Тайна няма — това е фиктивен адрес само за билда.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
# .next/cache е кешът на webpack от билда (стотици MB) — в рънтайм не трябва;
# `next start` си създава нов за оптимизираните изображения.
RUN npm run build && rm -rf .next/cache

# --- Само prod зависимости. `prisma` е в dependencies нарочно: CLI-ят пуска
# `prisma migrate deploy` от този образ. Генерираният клиент (node_modules/.prisma)
# и engine-ите остават след prune — проверява се на следващия ред.
FROM build AS prod-deps
RUN npm prune --omit=dev --no-audit --no-fund \
  && test -d node_modules/.prisma/client \
  && test -x node_modules/.bin/prisma \
  && node -e "require('sharp')"

# --- Продукционен образ ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
# Качените снимки (DATA_DIR) — монтира се стабилен път от хоста (docker-compose.yml).
ENV DATA_DIR=/data
# По-малко malloc арени: паралелните sharp декодирания държат ~160–220 MB по-малко RSS
# при mem_limit 1g (Разбивача, Н1: 925–959 → 731–790 MB).
ENV MALLOC_ARENA_MAX=2
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs \
  && install -d -o 1001 -g 1001 -m 750 /data
# Кодът е собственост на root (само за четене за nextjs): пробив в процеса не може да подмени
# собствения си код, дори коренът да не е read_only. Пише се само в /data (томът) и в кеша на
# `next start` — /app/.next/cache, който в Compose е tmpfs (docker-compose.yml, read_only: true).
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
# `next start` чете конфига и в рънтайм (poweredByHeader, bodySizeLimit).
COPY --from=build /app/next.config.mjs ./next.config.mjs
RUN install -d -o 1001 -g 1001 -m 700 /app/.next/cache
USER nextjs
EXPOSE 3000
# Направо `next start`, не `npm run start`: npm пише дневник в ~/.npm (коренът е само за четене) и
# е излишен посредник за SIGTERM при `docker stop`.
CMD ["node", "node_modules/next/dist/bin/next", "start"]
