# syntax=docker/dockerfile:1.6
# ─── Stage 1: dependencies ──────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# ─── Stage 2: runtime ───────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN apk add --no-cache wget tini
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Run as non-root for security
RUN chown -R node:node /app
USER node

EXPOSE 3001

# Bot exposes /health on its internal HTTP server (port 3001)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3001/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--import", "./src/instrument.js", "src/index.js"]
