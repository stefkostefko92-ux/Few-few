FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY prisma ./prisma/
# Prisma CLI е зависимост на образа (не npx): нито build-ът, нито стартът теглят нищо от мрежата.
RUN node node_modules/prisma/build/index.js generate
COPY src ./src/
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health >/dev/null || exit 1
# Схемата (db push — без изтриване на данни), seed (роли + хеширане на стари ПИН-ове), после сървърът.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js db push --skip-generate && node src/seed.js && node src/index.js"]
