# syntax=docker/dockerfile:1.6
# ─── Stage 1: dependencies ──────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
# Use npm ci for reproducible installs (requires package-lock.json)
# Falls back to install if no lock file (first-time setup)
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# ─── Stage 2: prisma generate ───────────────────────────────────────────────
FROM node:22-alpine AS prisma
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
COPY --from=deps /app/node_modules ./node_modules
RUN npx prisma generate

# ─── Stage 3: runtime ───────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl wget tini
WORKDIR /app
ENV NODE_ENV=production

# Copy node_modules + generated prisma client from previous stages
COPY --from=prisma /app/node_modules ./node_modules
COPY --from=prisma /app/prisma ./prisma

# Copy application source
COPY . .

# Make entrypoint executable
RUN chmod +x /app/docker-entrypoint.sh

# Run as non-root for security (per standard 5)
# node user (uid 1000) ships pre-created on official images
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Health check — used by Docker for restart logic
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/health || exit 1

# tini ensures proper signal handling for graceful shutdown
ENTRYPOINT ["/sbin/tini", "--", "/app/docker-entrypoint.sh"]
CMD ["node", "src/index.js"]
