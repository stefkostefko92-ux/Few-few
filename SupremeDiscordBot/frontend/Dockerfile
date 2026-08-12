# syntax=docker/dockerfile:1.6
# ─── Stage 1: build ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build

# ─── Stage 2: serve via nginx-unprivileged (runs as non-root by default) ────
FROM nginxinc/nginx-unprivileged:alpine AS runtime
# БЕЗ `apk add` — образът вече носи busybox wget, а HEALTHCHECK-ът долу ползва
# само флагове, които busybox разбира (`-q -O`). Единствената причина за apk тук
# беше `--spider` (флаг на GNU wget). Така build-ът НЕ зависи от Alpine CDN:
# преходен DNS отказ към dl-cdn.alpinelinux.org събаряше целия деплой
# (реален провал 11.08.2026).

# Copy built assets + nginx config
COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf
# Базовите заглавия за сигурност — един източник, включен във всяка локация
# (виж коментара в самия файл). Без него nginx отказва да стартира.
COPY --chown=nginx:nginx nginx-security-headers.conf /etc/nginx/security-headers.conf

# nginx-unprivileged uses port 8080 (no privileged binding)
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
