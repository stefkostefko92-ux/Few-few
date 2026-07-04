# Tanoth license server — tiny, dependency-free Node service.
FROM node:20-alpine

WORKDIR /app
COPY license-server.mjs ./

# Persisted bindings live in a volume, writable by the unprivileged user.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node

ENV PORT=8787 \
    LICENSE_DB=/data/bindings.json
EXPOSE 8787

# LICENSE_SECRET MUST be supplied at runtime (-e LICENSE_SECRET=...), never baked.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["node", "license-server.mjs"]
