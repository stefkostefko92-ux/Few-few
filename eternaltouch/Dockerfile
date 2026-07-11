FROM node:20-alpine

# System dependencies for Sharp (libvips) + Prisma
RUN apk add --no-cache \
    libc6-compat \
    openssl \
    ca-certificates \
    tini

WORKDIR /app

# === Install deps ===
# Copy lockfile + package.json + prisma first (better Docker layer caching)
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install ALL dependencies (prisma is now in dependencies, not devDeps)
RUN npm ci --omit=dev && npx prisma generate

# === Copy source ===
COPY src ./src
COPY docker-startup.sh /app/docker-startup.sh

# === Pre-create upload subdirectories (will be overlaid by bind-mount in compose) ===
RUN mkdir -p /app/src/public/uploads/products \
             /app/src/public/uploads/gallery \
             /app/src/public/uploads/collections \
             /app/src/public/uploads/seed \
             /app/src/public/uploads/hero && \
    chmod +x /app/docker-startup.sh

# === Non-root user ===
RUN addgroup -g 1001 -S nodejs && \
    adduser -S etuser -u 1001 -G nodejs -h /home/etuser -s /bin/sh && \
    mkdir -p /home/etuser/.npm /home/etuser/.config && \
    chown -R etuser:nodejs /app /home/etuser

USER etuser

EXPOSE 4300

# === Healthcheck ===
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --quiet --spider http://localhost:4300/healthz || exit 1

# === Startup ===
# tini handles signals + reaps zombies properly.
# docker-startup.sh is idempotent: detects DB state and only pushes schema
# when needed (avoids Prisma 5.22 "relation already exists" bug).
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/docker-startup.sh"]
