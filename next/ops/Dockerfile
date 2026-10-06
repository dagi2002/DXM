# Builds every Pulse service from the next/ directory:
#   docker build -f ops/Dockerfile --target api -t pulse-api .
# Services are single self-contained bundles, so runtime images carry no node_modules.
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @pulse/sdk build \
 && pnpm --filter @pulse/web build \
 && pnpm --filter @pulse/api --filter @pulse/collector --filter @pulse/worker --filter @pulse/jobs build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /srv
USER node

FROM runtime AS migrate
COPY --from=build /app/packages/jobs/dist/migrate.js ./migrate.mjs
COPY --from=build /app/packages/db/drizzle ./drizzle
ENV MIGRATIONS_DIR=/srv/drizzle
CMD ["node", "migrate.mjs"]

FROM runtime AS api
COPY --from=build /app/apps/api/dist/server.js ./server.mjs
EXPOSE 4100
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://localhost:4100/livez').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]

FROM runtime AS collector
COPY --from=build /app/apps/collector/dist/server.js ./server.mjs
COPY --from=build /app/packages/sdk/dist ./sdk
ENV SDK_DIST_DIR=/srv/sdk
EXPOSE 4200
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://localhost:4200/livez').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]

FROM runtime AS worker
COPY --from=build /app/apps/worker/dist/main.js ./main.mjs
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:4250/livez').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "main.mjs"]

FROM caddy:2 AS web
COPY ops/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv/app
