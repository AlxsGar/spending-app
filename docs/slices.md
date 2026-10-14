# Slices

One row per slice. The coordinator keeps this file current.

Status values: `proposed`, `in progress`, `awaiting user test`, `done`, `dropped`.

| # | Slice | Branch | Status | Notes |
|---|-------|--------|--------|-------|
| 1 | Tooling: typecheck, lint, Jest | slice/tooling | done | Dev deps approved: eslint, eslint-config-expo, jest, jest-expo, @types/jest, @testing-library/react-native, react-test-renderer@19.2.3 (pinned to match react@19.2.3; RNTL peer dep, latest resolves to 19.3.0 which conflicts). Lint fix: rewrite use-color-scheme.web.ts; fallback is a per-file rule disable with a comment. Approved out-of-brief changes required for typecheck: `tsconfig.json` adds `"types": ["jest"]` (TS 6 no longer auto-includes `@types/*`); `src/css.d.ts` declares `*.css` modules (Expo template CSS imports failed typecheck). |
