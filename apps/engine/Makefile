GOLANGCI_VERSION := v2.15.0
# Uses a local golangci-lint when installed, otherwise the pinned Docker image.
GOLANGCI := $(shell command -v golangci-lint 2>/dev/null || echo docker run --rm -v "$(CURDIR)":/src -w /src golangci/golangci-lint:$(GOLANGCI_VERSION) golangci-lint)

.PHONY: build test cover cover-gate lint fmt run

# Pure-logic packages must stay fully covered; I/O edges (database, main) are tested by integration.
FULL_COVERAGE_PKGS := ./internal/config ./internal/healthcheck ./internal/httpapi ./internal/logging

build:
	go build -trimpath -o bin/engine ./cmd/engine

test:
	go test -race -coverprofile=coverage.out ./...

cover: test
	go tool cover -func=coverage.out

lint:
	$(GOLANGCI) run ./...

fmt:
	$(GOLANGCI) fmt ./...

cover-gate:
	@for pkg in $(FULL_COVERAGE_PKGS); do \
		out=$$(go test -count=1 -cover $$pkg) || exit 1; \
		echo "$$out"; \
		echo "$$out" | grep -q "coverage: 100.0% of statements" || { echo "coverage below 100% in $$pkg"; exit 1; }; \
	done

run:
	go run ./cmd/engine
