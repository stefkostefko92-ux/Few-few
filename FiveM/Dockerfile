# Многоетапен билд: крайният образ носи само каквото се изпълнява.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Билдът не се свързва с база (страниците с БД са dynamic и падат меко), но
# Prisma иска валиден URL, за да генерира клиента без шум.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Не се работи като root: пробив в процеса не бива да значи пробив в контейнера.
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/.next ./.next
COPY --from=builder --chown=app:app /app/public ./public
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./package.json
COPY --from=builder --chown=app:app /app/prisma ./prisma
COPY --from=builder --chown=app:app /app/scripts ./scripts
COPY --from=builder --chown=app:app /app/src ./src
COPY --from=builder --chown=app:app /app/tsconfig.json ./tsconfig.json
USER app
EXPOSE 3000
CMD ["npm", "run", "start"]
