# Little Lambs Daily

Offline-first childcare daily-log PWA on [Sync-PWA-Framework](https://github.com/epl692/Sync-PWA-Framework). Full spec: [SPEC.md](SPEC.md). Choices and framework gaps: [DECISIONS.md](DECISIONS.md).

## Setup

Needs Node 20+.

```bash
git clone --recurse-submodules <this repo>   # or: git submodule update --init
npm install
```

## Run it with Docker

One command starts the app and the relay. You need Docker with Compose, and the framework submodule checked out.

```bash
git clone --recurse-submodules https://github.com/epl692/Little-Lambs-Daily.git
cd Little-Lambs-Daily
cp .env.example .env          # on Windows PowerShell: Copy-Item .env.example .env
docker compose up -d --build
```

Then open **http://localhost:8080** on the same computer. The first build takes a few minutes. (If `framework/` is empty, run `git submodule update --init` first; the build stops with a message if it is.)

What starts:

| Service | What it is | Port |
|---|---|---|
| `app` | the built app, served by nginx | 8080 |
| `relay` | the self-hosted relay; photos are kept in the `relay-data` volume | 8787 |

Day to day: `docker compose ps` to see them, `docker compose logs -f relay` for the relay's log, `docker compose down` to stop (your data stays in the volume; `down -v` deletes it).

**Using it from phones.** Phones cannot reach `localhost`, and browsers only install the app, run its offline cache and open the camera on a secure (HTTPS) address. For real use:

1. Point two names at the machine, for example `lambs.example.com` and `relay.example.com`, and open ports 80 and 443.
2. In `.env` set `RELAY_URL=wss://relay.example.com`, `APP_DOMAIN=lambs.example.com` and `RELAY_DOMAIN=relay.example.com`.
3. Start with the bundled Caddy, which gets the HTTPS certificates by itself:

```bash
docker compose --profile tls up -d --build
```

Then open `https://lambs.example.com`. Prefer your own reverse proxy (Nginx Proxy Manager, Traefik, Unraid)? Skip the `tls` profile and forward the two names to ports 8080 and 8787, with WebSockets enabled for the relay.

**Good to know**
- `RELAY_URL` is baked into the app when it is built, because the page's security policy only allows that one address. Change it in `.env`, then run `docker compose up -d --build` again.
- To update: `git pull`, `git submodule update --init`, then `docker compose up -d --build`. Phones show "A new version is ready".
- Back up the `relay-data` volume, and use Settings → Reports and exports for a file backup (see [DEPLOY.md](DEPLOY.md)).
- The files are `Dockerfile` (app), `relay/Dockerfile` (relay), `docker-compose.yml`, `docker/nginx.conf` and `docker/Caddyfile`. They were written without Docker on the machine that wrote them, so they have **not been built yet**: if the first build fails, the message will point at the step.

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
