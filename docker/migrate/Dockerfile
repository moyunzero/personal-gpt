FROM node:22-alpine
WORKDIR /app
COPY package.json yarn.lock ./
COPY script/install-git-hooks.mjs ./script/install-git-hooks.mjs
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN yarn install --frozen-lockfile --ignore-scripts
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
RUN yarn workspace @personal-gpt/shared build
CMD ["yarn", "workspace", "web", "migration:run"]
