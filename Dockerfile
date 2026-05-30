# ============================================================
# Nexus Dominion — multi-stage production Dockerfile
# ============================================================

# ---- Stage 1: build everything (client SPA + server bundle) ----
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
COPY client/package*.json client/
COPY server/package*.json server/
RUN npm ci --no-audit --no-fund
COPY client client
COPY server server
RUN npm run build --workspace client \
 && npm run build --workspace server

# ---- Stage 2: production runtime ----
FROM node:20-alpine AS runner
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production

# Bring server runtime deps only.
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server/package*.json server/
RUN npm ci --omit=dev --no-audit --no-fund --workspace server --include-workspace-root \
  && npm cache clean --force

# Bring built artifacts
COPY --from=builder /app/server/dist server/dist
COPY --from=builder /app/client/dist client/dist
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

RUN mkdir -p /app/data && addgroup -S app && adduser -S app -G app \
  && chown -R app:app /app
USER app

EXPOSE 4000
ENV PORT=4000 \
    DB_PATH=/app/data/nexus-dominion.db \
    CORS_ORIGIN=*

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "server/dist/server.js"]
