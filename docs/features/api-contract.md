# API contract

`packages/contracts/openapi.yaml` (OpenAPI 3.1) is the single source of truth between web and
engine. Never hand-edit generated code; change the spec and regenerate.

## Generate

```bash
pnpm contracts:gen
```

| Output                                | Tool                     | Used by                            |
| ------------------------------------- | ------------------------ | ---------------------------------- |
| `apps/engine/internal/api/api.gen.go` | oapi-codegen (`go tool`) | `internal/httpapi` (strict server) |
| `packages/contracts/gen/ts/`          | `@hey-api/openapi-ts`    | web, via `@canopy/contracts`       |

- Go: models, chi router and a **strict** server interface; `httpapi.server` implements it, so a
  missing or mistyped operation fails to compile.
- TS: types, Zod schemas (`@canopy/contracts/zod`) and an SDK whose responses are validated with
  Zod. The package compiles to `dist/` on `pnpm install`; the web app imports the compiled output.
- Errors follow the shared model `{ code, params, requestId }`.

## CI

The `Contracts (drift check)` job regenerates everything and fails if the result differs from
what is committed.
