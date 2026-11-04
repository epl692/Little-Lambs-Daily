# Little Lambs Daily

Offline-first childcare daily-log PWA on [Sync-PWA-Framework](https://github.com/epl692/Sync-PWA-Framework). Full spec: [SPEC.md](SPEC.md). Choices and framework gaps: [DECISIONS.md](DECISIONS.md).

## Setup

Needs Node 20+.

```bash
git clone --recurse-submodules <this repo>   # or: git submodule update --init
npm install
```

## Everyday commands

| Command | What it does |
|---|---|
| `npm run build` | Builds the Svelte UI (`ui/dist/ui.js`), then the PWA into `dist/` |
| `npm run serve` | Serves `dist/` at http://localhost:4180 |
| `npm run build:dev` | Unhashed dev build with `window.__syncHost` |
| `npm run check` | Resolves modules and lints schemas |
| `npm run verify` | Static installability checks on `dist/` |
| `npm test` | Unit and contract tests |
| `npm run typecheck` / `npm run lint` | Types (TS + Svelte) and ESLint |
| `npm run relay` | Local relay at ws://localhost:8787 (`BLOB_DIR=./blobs` for photos) |
| `npm run e2e` | Playwright (once e2e tests exist; run `npx playwright install chromium` first) |

## Layout

See SPEC.md section 10. `modules/daycare` is the framework module, `ui/` the Svelte app mounted by its root view,
`infra/identity` the invite provider, `relay/` the self-hosted relay (Docker, for Unraid).

## Status

Phases 1 (scaffold) and 2 (data layer + authz validator) done. Next: phase 3 (onboarding and pairing).
