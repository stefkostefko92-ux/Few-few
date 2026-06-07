# syntax=docker/dockerfile:1

# Production образ за API-то и worker-а (един образ, две команди).
FROM node:22-slim AS build
WORKDIR /app

# Prisma се нуждае от openssl на runtime и при generate.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# 1) Споделен пакет — изгражда се преди API (file: зависимост).
COPY packages/shared/package.json packages/shared/package-lock.json packages/shared/
RUN cd packages/shared && npm ci
COPY packages/shared/tsconfig.json packages/shared/
COPY packages/shared/src packages/shared/src
RUN cd packages/shared && npm run build

# 2) API зависимости (кеширан слой преди копиране на кода).
COPY apps/api/package.json apps/api/package-lock.json apps/api/
RUN cd apps/api && npm ci

# 3) API код → Prisma client + компилация.
COPY apps/api/ apps/api/
RUN cd apps/api && npx prisma generate && npm run build

ENV NODE_ENV=production
WORKDIR /app/apps/api

# API: прилага миграциите, seed-ва референтните данни (идемпотентно) и стартира.
# Worker-ът подменя командата в compose.
CMD ["sh", "-lc", "npx prisma migrate deploy && node dist/prisma/seed.js && node dist/src/server.js"]
