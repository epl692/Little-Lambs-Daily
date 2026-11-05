# Deploying Little Lambs Daily

Two pieces: the **app** (static files you put on any HTTPS web host) and the **relay** (a small Docker service that passes
encrypted data between devices and holds photos until every device has them). Everything is end-to-end encrypted: the relay
and the web host never see names, notes or photos in readable form.

> These steps follow the files in this repo (`relay/docker-compose.yml`, `relay/Dockerfile`, the build scripts). The app and the
> relay are tested together on a developer machine; the Docker image and the reverse-proxy snippets below have not yet been run on
> an Unraid box, so do the smoke test in section 5 before inviting parents.

## 1. What you need

- A domain you control, with two names, for example `lambs.example.com` (the app) and `relay.example.com` (the relay).
- Somewhere to host static files over **HTTPS** (Cloudflare Pages, Netlify, GitHub Pages, or your own Nginx/Caddy). HTTPS is
  required: phones will not install the app, run its offline cache, or open the camera without it.
- A machine that is always on for the relay (an Unraid server works well) with Docker, and a reverse proxy that can terminate
  TLS and pass WebSockets (Nginx Proxy Manager, Caddy, Traefik).

## 2. Build the app

1. Edit `modules/daycare/constants.ts`:
   - `RELAY_URL = 'wss://relay.example.com'` (must be `wss://` when the app is served over HTTPS).
   - `APP_NAME`, `DAYCARE_NAME` and `ACCENT` if you want different defaults.
   The relay address is baked into the build because the page's security policy only allows connections to that one address.
   Changing relays means building again.
2. Build:
   ```bash
   git clone --recurse-submodules https://github.com/epl692/Little-Lambs-Daily.git
   cd Little-Lambs-Daily
   npm ci
   npm run build
   npm run verify      # static installability checks on dist/
   ```
3. Upload everything in `dist/` to your host. Headers worth setting:
   - `sw.js` and `index.html`: `Cache-Control: no-cache` (so updates are noticed straight away).
   - Everything else is content-hashed and can be cached for a long time.
   - `.webmanifest` served as `application/manifest+json`.

## 3. Run the relay

On the relay machine, from the repo root:

```bash
docker compose -f relay/docker-compose.yml up -d --build
```

- It listens on port 8787 and stores encrypted photos in the `relay-data` volume (`BLOB_DIR=/data/blobs`).
  **Photos only reach a second device if this is set.** The compose file sets it.
- On Unraid, map the volume to a share such as `/mnt/user/appdata/little-lambs-relay` so it is included in your backups.
- `BLOB_TTL_DAYS` (default 90): the relay forgets photos after this long. Devices that already have a photo keep it; a device
  added later will not be able to fetch photos older than this. Raise it (and the optional size caps in the compose file) if you
  want a longer window.

Put the reverse proxy in front, with TLS, forwarding `relay.example.com` to port 8787 **with WebSocket upgrade enabled**.

Caddy:

```
relay.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

Nginx (inside the `server` block for `relay.example.com`):

```
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}
```

In Nginx Proxy Manager, tick **Websockets Support** on the proxy host.

## 4. First run

1. Open the app on your phone, tap **I’m the provider**, enter your name. That creates the daycare.
2. Add a family and a child, then **Invite a parent**. Show the QR code or send the link. The parent opens it, enters their name and
   relationship, and you see five words on both screens: if they match, tap **Words match, approve**.
3. Everyone: **Add to Home Screen** (Share → Add to Home Screen on iPhone; the install prompt or ⋮ menu on Android).
4. Add a second provider from Settings → Staff if needed.

## 5. Smoke test before real use

- [ ] Open the app on two phones. Both show **Synced** (top right). Turn one phone's Wi-Fi and data off: it shows **Offline**.
- [ ] While offline, log a diaper; turn the connection back on; the other phone receives it.
- [ ] Post a photo from the provider phone; the parent phone shows the thumbnail and opens the full photo.
- [ ] Settings → Reports and exports: download an attendance CSV and a backup ZIP.
- [ ] Airplane mode, close the app completely, reopen it: it still opens and shows today's entries.
- [ ] Join as a parent by scanning the invite QR code with the app's **Scan the QR code** button (needs HTTPS for the camera).
- [ ] Settings → Link another device on one phone, scan its code from a second phone, confirm the five words match.
- [ ] Turn the relay off (or both phones' Wi-Fi off and on to one shared network with no internet). Settings → **Connect two devices**: swap the two codes; the sync button should read **Synced (direct)** and a new entry should appear on the other phone.
- [ ] Settings → Notifications: switch it on, put the app in the background on one phone, reply to a card from the other; a notification appears.

## 6. The framework submodule

`framework/` currently points at a branch of the framework with two small fixes that are not merged upstream yet (device linking
through a relay; a "changes waiting" count). Push those branches and merge them upstream (DECISIONS.md D-019) before building from a
fresh clone, or the clone will not find the pinned commit.

## 7. Updating

- **App:** build again and upload `dist/`. Phones notice in the background and show **“A new version is ready” → Reload**. Nobody is
  interrupted mid-entry.
- **Relay:** `git pull`, then `docker compose -f relay/docker-compose.yml up -d --build`. Keep the volume.
- The `framework/` submodule is pinned; update it only deliberately (see `DECISIONS.md` D-009).

## 8. Backups and recovery

- Every device keeps a full copy of what it can see. The relay passes changes along and holds them in memory (after a relay restart,
  devices simply resend what it is missing); photos are kept on its disk for `BLOB_TTL_DAYS`. So losing one phone loses nothing:
  sign in on a new device (**Link another device**). Losing **every** device and the relay at once is what the file backup is for.
- Take an occasional file backup: **Settings → Reports and exports → Download ZIP** (with photos ticked). To rebuild a daycare on a
  new device, set up as the provider and use **Restore from a backup** (families and children are recreated; invite the parents
  again). What a restore cannot bring back is listed in `DECISIONS.md` D-018.
- Back up the relay's volume too; it is cheap insurance for photos.

## 9. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Pill stays **Offline** on every phone | `RELAY_URL` wrong, not `wss://`, or the proxy is not forwarding WebSockets. Tap the pill to see the address the app is using. |
| Text syncs but photos never arrive on the other phone | The relay has no `BLOB_DIR`, or its volume is full or read-only. |
| “A new version is ready” never appears | `sw.js` is being cached by the host or a CDN. Set `Cache-Control: no-cache` on it. |
| Camera or install option is missing | The app is being served over plain HTTP. |
| "Scan the QR code" says the camera is blocked | The browser's camera permission for the site is off; allow it, or paste the link instead. |
| Direct connection times out | The two devices must be on the same Wi-Fi, and the network must not isolate clients (some guest networks do). There is no internet relay for this; it is same-network only. |
| The sync button says "Syncing (n)" for a long time | The relay is reachable but not acknowledging: check its logs and disk space. Changes are safe on the device meanwhile. |
| Photos show a spinner for a while on a parent's phone | They retry by themselves for about a minute while the relay finishes receiving them; if the provider posted offline they appear after the provider reconnects. |

## 10. Checks to do by hand before launch

Automated tests cover a lot (see `tests/`), but these need a person:

- Use the app once with a screen reader (VoiceOver on iPhone, TalkBack on Android) through: add an entry, read the timeline, react.
- Print an attendance report and a daily summary from a real phone or laptop and read the result.
- On iPhone Safari: install to the Home Screen, take a photo from the camera picker, open it full screen, **Save**.
- Try a very old or low-end phone for the timeline with a busy day.
