# syntax=docker/dockerfile:1
# Build context: repository root.

FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@12.18.0

FROM base AS build
WORKDIR /repo
# Manifests first so the dependency layer is cached until a lockfile or package.json changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY packages/ packages/
COPY apps/web/ apps/web/
COPY prettier.config.js ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --offline
RUN pnpm --filter @canopy/web build

FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/drizzle ./apps/web/drizzle
# Release notes for "What's new" (read at run time; .dockerignore keeps Unreleased out).
COPY --chown=node:node changelog/releases ./changelog/releases
ENV CANOPY_CHANGELOG_DIR=/app/changelog
COPY --from=build --chown=node:node /repo/apps/web/server/peer-address.mjs ./peer-address.mjs
COPY --from=build --chown=node:node /repo/apps/web/server/engine-stream.mjs /repo/apps/web/server/engine-stream.utils.mjs ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# peer-address.mjs records the real TCP peer before Next handles the request (see client-ip.ts);
# engine-stream.mjs relays downloads and uploads to the engine outside Next (docs/dev/streaming.md).
CMD ["node", "--import", "./peer-address.mjs", "--import", "./engine-stream.mjs", "apps/web/server.js"]
