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
| `npm run build` | Builds the extra files (`build:assets`: ZIP tool, QR decoder), the Svelte UI, then the PWA into `dist/` |
| `npm run serve` | Serves `dist/` at http://localhost:4180 |
| `npm run build:dev` | Unhashed dev build with `window.__syncHost` |
| `npm run check` | Resolves modules and lints schemas |
| `npm run verify` | Static installability checks on `dist/` |
| `npm test` | Unit and contract tests |
| `npm run typecheck` / `npm run lint` | Types (TS + Svelte) and ESLint |
| `npm run relay` | Local relay at ws://localhost:8787 (`BLOB_DIR=./blobs` for photos) |
| `npm run e2e` | Two-browser Playwright tests against the built app and a local relay (builds the dev build itself; run `npx playwright install chromium` once first) |

## Layout

See SPEC.md section 10. `modules/daycare` is the framework module, `ui/` the Svelte app mounted by its root view,
`infra/identity` the invite provider, `relay/` the self-hosted relay (Docker, for Unraid).

## Production setup

See **[DEPLOY.md](DEPLOY.md)**: building for your domain, running the relay (Docker/Unraid) behind HTTPS, first run, a smoke test, updates, backups and troubleshooting.

`framework/` currently points at an unmerged upstream branch (see DECISIONS.md D-009).

## Status


**All ten build phases are done** (see SPEC.md section 11): data layer and authorization, onboarding and pairing, roster and timeline, the add flow, reactions and threads, photos, the parent experience, reports and exports (daily summary, attendance CSV/print, ZIP backup and restore), and polish (sync status, update banner, accessibility, offline cold start, performance checks). Since then: removing people and signing out devices, a daycare name parents see, editing for a whole batch, choosing your own name, editing posted photos, in-app notifications, the daily summary as a picture, QR scanning, a direct device-to-device connection for when the relay is down, and a "Syncing (n)" count. Open items and every place this build differs from the spec are in DECISIONS.md.

**Before cloning works for anyone else:** `framework/` points at a local branch with two small fixes that are not yet upstream (DECISIONS D-019). They have to be pushed first.
