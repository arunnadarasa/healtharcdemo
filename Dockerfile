# API only (Express + SNOMED RF2 SQLite via better-sqlite3). For Fly.io Option B — Lovable proxies here.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
# `npm ci` requires a perfectly synced lockfile; use install for Docker builds when lock drifts.
RUN npm install --omit=dev --no-audit --no-fund

COPY server ./server

ENV NODE_ENV=production
ENV PORT=8787
# Persistent volume (see fly.toml): place snomed-rf2.db here, or RF2 tree + let index build.
ENV SNOMED_RF2_SQLITE_PATH=/data/snomed-rf2.db

EXPOSE 8787

CMD ["node", "server/index.js"]
