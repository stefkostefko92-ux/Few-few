# syntax=docker/dockerfile:1
# Multi-stage build for the KAGURA backend (GDD §11.4). Prisma 7 uses the pg
# driver adapter, so no query-engine binary is needed in the runtime image.

# ---- build: install dev deps, generate the Prisma client, compile to dist/ ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build   # prisma generate + tsc -p tsconfig.build.json -> dist/

# ---- runtime: production deps only, run compiled JS as a non-root user ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# --ignore-scripts skips the postinstall `prisma generate` (the generated client
# is already compiled into dist/ from the build stage); @prisma/client runtime
# is a normal prod dependency.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
# Run migrations out-of-band (e.g. a release job: `npm run migrate:deploy`),
# not here — every replica must not race `migrate deploy` on boot.
CMD ["node", "dist/index.js"]
