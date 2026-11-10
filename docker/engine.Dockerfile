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

# 7-Zip (official static build, checksum pinned per architecture): 7z, RAR, ISO and more.
FROM alpine:3.24@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf AS sevenzip
ARG TARGETARCH
ARG SEVENZIP_VERSION=26.05
RUN apk add --no-cache xz && set -eu;     case "$TARGETARCH" in       amd64) arch=x64; sum=22cf82fcc6eb7474f1d5bb4f02c0f8ebd573a718089d6833dc30f8350a3b232e ;;       arm64) arch=arm64; sum=0b71f6cfc34669b3bf69f2347efd3429f77020665003a13b9cdc53b784270421 ;;       *) echo "no 7-Zip build for $TARGETARCH" >&2; exit 1 ;;     esac;     file="7z$(echo "$SEVENZIP_VERSION" | tr -d .)-linux-$arch.tar.xz";     wget -q -O "/tmp/$file" "https://github.com/ip7z/7zip/releases/download/$SEVENZIP_VERSION/$file";     echo "$sum  /tmp/$file" | sha256sum -c -;     mkdir -p /out; xz -dc "/tmp/$file" | tar -x -C /out 7zzs;     mv /out/7zzs /out/7zz; chmod 0755 /out/7zz

# Variant with ffmpeg (target `ffmpeg`): video thumbnails, and videos the browser cannot play
# (MKV with HEVC, AC-3...) converted on the fly. Larger, so it is a separate image.
FROM alpine:3.24@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf AS ffmpeg
RUN apk add --no-cache ffmpeg ca-certificates
COPY --from=build /out/engine /usr/local/bin/engine
COPY --from=sevenzip /out/7zz /usr/local/bin/7zz
ENV CANOPY_ROOT=/srv/canopy/root
# Same unprivileged user as the distroless image.
USER 65532:65532
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3     CMD ["/usr/local/bin/engine", "healthcheck"]
ENTRYPOINT ["/usr/local/bin/engine"]

# Default target. Distroless: no shell, no package manager. Runs as an unprivileged user by default; compose
# overrides it with PUID:PGID so created files belong to the host user.
FROM gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab
COPY --from=build /out/engine /usr/local/bin/engine
COPY --from=sevenzip /out/7zz /usr/local/bin/7zz
ENV CANOPY_ROOT=/srv/canopy/root
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD ["/usr/local/bin/engine", "healthcheck"]
ENTRYPOINT ["/usr/local/bin/engine"]
