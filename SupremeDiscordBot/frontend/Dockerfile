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
USER root
RUN apk add --no-cache wget
USER nginx

# Copy built assets + nginx config
COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf

# nginx-unprivileged uses port 8080 (no privileged binding)
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
