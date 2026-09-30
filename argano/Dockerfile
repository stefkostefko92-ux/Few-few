# Argano: Next.js 15 + Prisma (PostgreSQL) + the report renderer (Python ReportLab with the DejaVu fonts).
FROM node:22-bookworm-slim AS base
ENV TZ=UTC NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# dependencies: the Prisma engines and the prebuilt argon2 binding come with the install
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npx next build

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 PYTHON_BIN=python3 REPORT_FONT_DIR=/usr/share/fonts/truetype/dejavu
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-reportlab fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/report ./report
COPY --from=build /app/docs ./docs
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/messages ./messages
COPY --from=build /app/package.json /app/next.config.mjs /app/tsconfig.json ./
COPY --chmod=755 docker-entrypoint.sh ./docker-entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
