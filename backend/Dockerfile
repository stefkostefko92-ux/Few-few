FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src/
RUN npx tsc

FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma/
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/seed.js && node dist/index.js"]
