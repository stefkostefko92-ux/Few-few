# syntax=docker/dockerfile:1

# Stage 1 — изгражда статичния admin SPA (с общия пакет).
FROM node:22-slim AS build
WORKDIR /app

COPY packages/shared/package.json packages/shared/package-lock.json packages/shared/
RUN cd packages/shared && npm ci
COPY packages/shared/tsconfig.json packages/shared/
COPY packages/shared/src packages/shared/src
RUN cd packages/shared && npm run build

COPY apps/admin/package.json apps/admin/package-lock.json apps/admin/
RUN cd apps/admin && npm ci
COPY apps/admin/ apps/admin/
# Празен VITE_API_BASE_URL = same-origin (Caddy сервира SPA и проксира API-то).
RUN cd apps/admin && npm run build

# Stage 2 — Caddy сервира статиката и проксира API-то с автоматичен HTTPS.
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/admin/dist /srv
