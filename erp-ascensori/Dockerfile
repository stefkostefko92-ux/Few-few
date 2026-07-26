# Многослоен билд за продукционен Next.js + Prisma на VPS.
FROM node:22-slim AS base
ENV TZ=Europe/Rome
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- Зависимости ---
FROM base AS deps
COPY package.json package-lock.json* ./
# --ignore-scripts: postinstall-ът вика `prisma generate`, а на този етап още
# няма prisma/schema.prisma. Клиентът се генерира в етапа „build".
RUN npm ci --ignore-scripts

# --- Билд ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Билдът НЕ докосва базата: страниците са клиентски, а тайните се четат мързеливо.
# Фиктивният URL е нужен само защото Prisma иска променливата да съществува.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN npx prisma generate && npm run build

# --- Продукционен образ ---
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Пълните `node_modules` (не standalone) са СЪЗНАТЕЛЕН избор: автоматизмите
# `scadenze:check` и `retention` се пускат с `tsx` и импортват `src/**` през
# алиаса `@/*`. Standalone билд не носи нито `src/`, нито `tsconfig.json`, нито
# `tsx` (той е devDependency) — cron-ът би се чупил МЪЛЧАЛИВО, а точно той
# изпълнява законовата функция на продукта (срокове) и GDPR прочистването.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY docker-entrypoint.sh ./docker-entrypoint.sh
# ПЪТЯТ НА ТОМА СЕ СЪЗДАВА ТУК, НЕ ОТ DOCKER. Именуван том, монтиран на път,
# който не съществува в образа, се създава `root:root 0755` — процесът върви
# като uid 1001 и първото качване на сертификат гърми с `EACCES`, при това
# `/api/readyz` продължава да е зелен. Правата се пренасят от образа само ако
# пътят вече е там.
RUN chmod +x ./docker-entrypoint.sh \
  && useradd --system --uid 1001 --home /app erp \
  && mkdir -p /var/lib/erp-ascensori/allegati \
  && chown -R erp:erp /app /var/lib/erp-ascensori
USER erp

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
