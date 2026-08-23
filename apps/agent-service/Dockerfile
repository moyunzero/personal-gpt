# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN apk add --no-cache curl
WORKDIR /app

FROM base AS deps
COPY package.json yarn.lock ./
COPY apps/agent-service/package.json ./apps/agent-service/
COPY packages/shared/package.json ./packages/shared/
RUN yarn install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json yarn.lock ./
COPY apps/agent-service ./apps/agent-service
COPY packages/shared ./packages/shared
RUN yarn workspace @personal-gpt/shared build
RUN yarn workspace agent-service build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY package.json yarn.lock ./
COPY apps/agent-service/package.json ./apps/agent-service/
COPY packages/shared/package.json ./packages/shared/
RUN yarn install --frozen-lockfile --production && yarn cache clean
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/agent-service/dist ./apps/agent-service/dist
WORKDIR /app/apps/agent-service
EXPOSE 3002
ENV AGENT_SERVICE_PORT=3002
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD curl -fsS http://localhost:3002/health || exit 1
CMD ["node", "dist/main.js"]
