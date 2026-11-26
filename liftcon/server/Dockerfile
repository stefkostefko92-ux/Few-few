# LiftCon — приложението (формата + /admin) и генераторът на сайта за публикуване от панела.
# Контекст на билда: папката liftcon/ (docker-compose.yml). Крайният образ: dist/, продукционни зависимости,
# Prisma схема + миграции, статиката на панела и генераторът (build.mjs + src + статичните активи).
# Образът е закован по digest (същият като rilievi). Тича като непривилегирования потребител node.
FROM node:22-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS base
ENV TZ=UTC
# openssl — за Prisma; ca-certificates — за HTTPS към Brevo.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY server/package.json server/package-lock.json server/tsconfig.json ./
RUN npm ci
COPY server/prisma ./prisma
COPY server/src ./src
RUN npm run build

FROM base AS deps
COPY server/package.json server/package-lock.json ./
COPY server/prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4370 SITE_SRC=/app/site SITE_DIR=/srv/site CONTENT_DEFAULTS=/app/content-defaults.json
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server/package.json ./
COPY --chown=node:node server/prisma ./prisma
COPY --chown=node:node server/admin-static ./admin-static
# Генераторът на сайта (нула зависимости) и статичните активи, които той копира при всяко публикуване.
COPY --chown=node:node build.mjs ./site/build.mjs
COPY --chown=node:node src ./site/src
COPY --chown=node:node public/assets/fonts ./site/public/assets/fonts
COPY --chown=node:node public/assets/brand ./site/public/assets/brand
COPY --chown=node:node public/assets/promo ./site/public/assets/promo
COPY --chown=node:node public/img ./site/public/img
COPY --chown=node:node public/favicon.ico ./site/public/favicon.ico
RUN node site/build.mjs --dump-content /app/content-defaults.json && chown node:node /app/content-defaults.json
USER node
EXPOSE 4370
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4370/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Миграциите (`migrate deploy`, никога `db push`) преди старта; бекъпът на базата го прави deploy.sh преди това.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/server.js"]
