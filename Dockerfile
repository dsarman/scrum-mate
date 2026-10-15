# syntax=docker/dockerfile:1.7

# ---- build -----------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.5.0 --activate

# Install with only the manifests first so the dependency layer caches.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json    packages/web/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages ./packages
RUN pnpm -r build

# ---- runtime ---------------------------------------------------------------
# The server bundle inlines the shared package and has no runtime dependencies
# beyond what tsup left external (hono, ws, zod), so only those are installed.
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST=/app/web

RUN corepack enable && corepack prepare pnpm@9.5.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @scrum-mate/server \
 && rm -rf /root/.cache

COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/web/dist    ./web

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "packages/server/dist/main.js"]
