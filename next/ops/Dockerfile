# Multi-stage image for the API (and later collector/worker). Built from the next/ directory:
#   docker build -f ops/Dockerfile -t pulse-api .
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @pulse/web build && pnpm --filter @pulse/api build

FROM base AS api
ENV NODE_ENV=production
COPY --from=build /app /app
USER node
EXPOSE 4100
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://localhost:4100/livez').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]

FROM caddy:2 AS web
COPY ops/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv/app
