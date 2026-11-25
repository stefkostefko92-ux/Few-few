# Tanoth license server — tiny, dependency-free Node service.
# Node 22 LTS (Node 20 reached end of life on 2026-04-30).
FROM node:22-alpine

WORKDIR /app
COPY license-server.mjs ./

# Persisted bindings live in a volume, writable by the unprivileged user.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node

ENV PORT=8787 \
    LICENSE_DB=/data/bindings.json
EXPOSE 8787

# No signing secret exists here: the server only verifies with the public key.
# LICENSE_ADMIN_TOKEN (enables /unbind) is supplied at runtime, never baked.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["node", "license-server.mjs"]
