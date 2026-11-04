# Build context is the repo root (so the framework submodule is included): docker compose -f relay/docker-compose.yml up -d --build
FROM node:22-alpine
WORKDIR /app
COPY framework/ ./
RUN npm ci --no-audit --no-fund
ENV PORT=8787 BLOB_DIR=/data/blobs BLOB_TTL_DAYS=90
VOLUME /data
EXPOSE 8787
CMD ["npx", "tsx", "packages/relay-server/src/server.ts"]
