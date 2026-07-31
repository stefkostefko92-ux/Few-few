# Staffe — immagine di produzione (Next.js 15 + Prisma) per VPS, dietro reverse proxy.
# Build multistadio: le dipendenze e la compilazione restano fuori dall'immagine finale.
#
# Costruzione/avvio:  docker compose up -d --build   (vedi DEPLOY.md)

FROM node:22-slim AS base
ENV TZ=UTC
# openssl serve ai motori di query di Prisma; ca-certificates a TLS in uscita (SMTP).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── Dipendenze ────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
# --ignore-scripts: qui lo schema Prisma non c'è ancora; il client si genera
# nello stadio "build". Evita anche script postinstall di terze parti.
RUN npm ci --ignore-scripts

# ── Compilazione ──────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Valori FITTIZI solo per la compilazione: `next build` non deve toccare un
# database reale (le pagine che leggono dati sono force-dynamic) e non deve
# fallire sul controllo di lunghezza di AUTH_SECRET. Non sono segreti e non
# arrivano nell'immagine finale: gli ENV di questo stadio restano qui.
ENV DATABASE_URL="postgresql://staffe:build@127.0.0.1:5432/staffe?schema=public"
ENV AUTH_SECRET="solo-per-la-compilazione-non-un-segreto-32+"
# public/ potrebbe non esistere ancora (manifest PWA, sw.js, icone): la creiamo
# per non far fallire la COPY nello stadio finale.
RUN mkdir -p public && npx prisma generate && npm run build

# ── Immagine finale ───────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Gli allegati vivono in un volume, non nell'immagine e non sotto public/.
ENV UPLOAD_DIR=/app/uploads

# node_modules COMPLETI (con le devDependencies) di proposito: la CLI `prisma`
# (migrazioni all'avvio) e `tsx` (seed) stanno in devDependencies. Con
# `npm ci --omit=dev` il contenitore non potrebbe applicare lo schema e
# `npx prisma` proverebbe a scaricare dalla rete al primo avvio (in produzione
# non deve succedere). Spostare `prisma`/`tsx` in dependencies è una scelta del
# pacchetto, non del deploy: finché stanno lì, si copia tutto.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY deploy/docker-entrypoint.sh ./docker-entrypoint.sh

# Utente non privilegiato (l'immagine node ha già `node`, uid 1000).
RUN chmod +x ./docker-entrypoint.sh \
  && mkdir -p /app/uploads /app/.next/cache \
  && chown -R node:node /app
USER node

EXPOSE 3000
# L'entrypoint attende il database e applica lo schema, poi avvia `next start`.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]

# ── Variante "standalone" (immagine molto più leggera) ────────────────────────
# Next 15 sa produrre un server autonomo, ma serve UNA riga in next.config.mjs:
#     const nextConfig = { output: 'standalone', … }
# Senza quella riga `.next/standalone/server.js` NON viene generato, quindi qui
# usiamo la variante classica (node_modules + `next start`), che funziona così
# com'è. Quando la riga ci sarà, lo stadio finale diventa:
#     COPY --from=build /app/.next/standalone ./
#     COPY --from=build /app/.next/static ./.next/static
#     COPY --from=build /app/public ./public
#     COPY --from=build /app/prisma ./prisma
#     CMD ["node", "server.js"]
# Attenzione: in quel caso servono ancora la CLI `prisma` e i motori di query
# per le migrazioni all'avvio (o si spostano in un contenitore dedicato).
