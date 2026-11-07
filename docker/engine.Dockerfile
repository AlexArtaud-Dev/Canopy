# syntax=docker/dockerfile:1
# Build context: repository root.

FROM golang:1.26-alpine@sha256:87c65a688975c0b1d4585d204874c45ca78354670e3a5f11368c5a492303d696 AS build
WORKDIR /src
COPY apps/engine/go.mod apps/engine/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY apps/engine/ ./
ARG VERSION=dev
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /out/engine ./cmd/engine

# Distroless: no shell, no package manager. Runs as an unprivileged user by default; compose
# overrides it with PUID:PGID so created files belong to the host user.
FROM gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab
COPY --from=build /out/engine /usr/local/bin/engine
ENV CANOPY_ROOT=/srv/canopy/root
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD ["/usr/local/bin/engine", "healthcheck"]
ENTRYPOINT ["/usr/local/bin/engine"]
