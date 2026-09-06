FROM node:22-alpine AS base
RUN apk add --no-cache curl
WORKDIR /app

FROM base AS deps
COPY package.json yarn.lock ./
COPY script/install-git-hooks.mjs ./script/install-git-hooks.mjs
COPY apps/ingest-worker/package.json ./apps/ingest-worker/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY .npmrc ./
RUN yarn install --frozen-lockfile --ignore-scripts

FROM base AS builder
COPY package.json yarn.lock ./
COPY apps/ingest-worker ./apps/ingest-worker
COPY apps/web/lib/db ./apps/web/lib/db
COPY packages/shared ./packages/shared
COPY .npmrc ./
COPY --from=deps /app/node_modules ./node_modules
RUN yarn workspace @personal-gpt/shared build
RUN yarn workspace ingest-worker build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY package.json yarn.lock ./
COPY apps/ingest-worker/package.json ./apps/ingest-worker/
COPY packages/shared/package.json ./packages/shared/
COPY .npmrc ./
RUN yarn install --frozen-lockfile --production --ignore-scripts && yarn cache clean
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/ingest-worker/dist ./apps/ingest-worker/dist
WORKDIR /app/apps/ingest-worker
EXPOSE 3001
ENV INGEST_WORKER_PORT=3001
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD curl -fsS http://localhost:3001/health || exit 1
CMD ["node", "dist/apps/ingest-worker/src/main.js"]
