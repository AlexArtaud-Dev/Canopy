GOLANGCI_VERSION := v2.15.0
# Uses a local golangci-lint when installed, otherwise the pinned Docker image.
GOLANGCI := $(shell command -v golangci-lint 2>/dev/null || echo docker run --rm -v "$(CURDIR)":/src -w /src golangci/golangci-lint:$(GOLANGCI_VERSION) golangci-lint)

.PHONY: build test cover cover-gate lint fmt run

# Pure-logic packages must keep at least MIN_COVERAGE % statement coverage (target 100 %);
# I/O edges (database, main) are covered by integration tests instead.
PURE_PKGS := ./internal/config ./internal/healthcheck ./internal/httpapi ./internal/logging ./internal/enginetoken ./internal/fsx ./internal/authz ./internal/listing ./internal/foldersize ./internal/transfer
MIN_COVERAGE := 90

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
	@for pkg in $(PURE_PKGS); do \
		out=$$(go test -count=1 -cover $$pkg) || exit 1; \
		echo "$$out"; \
		pct=$$(echo "$$out" | sed -n 's/.*coverage: \([0-9.]*\)% of statements.*/\1/p'); \
		awk -v p="$$pct" -v min=$(MIN_COVERAGE) 'BEGIN { exit !(p != "" && p + 0 >= min) }' \
			|| { echo "coverage $$pct% below $(MIN_COVERAGE)% in $$pkg"; exit 1; }; \
	done

run:
	go run ./cmd/engine
