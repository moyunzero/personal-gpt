FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat curl
WORKDIR /app

FROM base AS deps
COPY package.json yarn.lock ./
COPY script/install-git-hooks.mjs ./script/install-git-hooks.mjs
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN yarn install --frozen-lockfile --ignore-scripts

FROM base AS builder
COPY package.json yarn.lock ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
COPY --from=deps /app/node_modules ./node_modules
ENV NEXT_TELEMETRY_DISABLED=1
ENV CI=true
ENV DATABASE_URL=postgresql://personal_gpt:personal_gpt@postgres:5432/personal_gpt
ENV REDIS_URL=redis://redis:6379
ENV AUTH_SECRET=ci-build-placeholder
ENV EMAIL_SERVER=smtp://localhost:1025
ENV EMAIL_FROM=noreply@example.com
ENV ASTRA_DB_COLLECTION=ci_dummy_collection
ENV ASTRA_DB_API_ENDPOINT=https://ci-dummy.example.com
ENV ASTRA_DB_APPLICATION_TOKEN=AstraCS:ci-dummy-token
ENV GOOGLE_GENERATIVE_AI_API_KEY=ci-dummy-google-key
ENV GROQ_API_KEY=ci-dummy-groq-key
ENV NIM_API_KEY=ci-dummy-nim-key
RUN touch apps/web/.env
RUN yarn workspace @personal-gpt/shared build
RUN yarn workspace web build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
WORKDIR /app
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD curl -fsS http://localhost:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]
