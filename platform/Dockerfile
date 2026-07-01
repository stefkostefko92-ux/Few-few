# Многослоен билд за продукционен Next.js + Prisma на VPS (standalone образ).
# Етапи: deps → build (prisma generate && next build) → runtime (slim, non-root).
FROM node:22-slim AS base
ENV TZ=UTC
# openssl е нужен на Prisma engine-а; ca-certificates за изходящи HTTPS проверки.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- Зависимости ---
FROM base AS deps
COPY package.json package-lock.json* ./
# --ignore-scripts: пропускаме postinstall (prisma generate) тук — на този етап
# още няма prisma/schema.prisma. Клиентът се генерира в етапа „build".
RUN npm ci --ignore-scripts

# --- Билд ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# CI/билдът не пипа реална база: страниците с база са force-dynamic, а тук
# подаваме dummy DATABASE_URL само за да генерираме клиента и да билднем.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public
RUN npx prisma generate && npm run build

# --- Продукционен образ (standalone) ---
# next.config.mjs има output: "standalone" — .next/standalone носи минимален
# сървър (node server.js). За entrypoint-а обаче ни трябват и Prisma CLI + tsx
# (migrate/db push/seed), които НЕ са в standalone бандъла — затова носим целия
# node_modules от build етапа. Той съдържа и генерирания Prisma клиент.
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone изход: сървърът + публичните и статичните ресурси.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Пълният node_modules идва ПОСЛЕ standalone, за да „спечели" над неговия
# по-беден набор (пълният носи Prisma CLI, tsx и генерирания Prisma клиент).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Не-root: node:22-slim носи готовия юзър „node" (uid 1000). Правим папките му.
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Здравна проверка вътре в контейнера — леката /api/health (не чука базата тежко).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
# standalone сървърът е node server.js (а не next start).
CMD ["node", "server.js"]
