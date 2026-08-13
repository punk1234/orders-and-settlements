# Build stage — runs from the monorepo root so yarn workspaces resolve @orders/shared
FROM node:20-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

COPY package.json yarn.lock ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json

# Only the api + shared package.json files are present, so this resolves
# just those workspaces (apps/web isn't in the build context).
RUN yarn install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN yarn workspace @orders/shared build
RUN yarn workspace @orders/api build

# Runtime stage — smaller image, prod deps only
FROM node:20-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

COPY package.json yarn.lock ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json

RUN yarn install --frozen-lockfile --production

COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist

EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
