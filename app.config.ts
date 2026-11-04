import { createBlobs, defineSyncBlob } from '@sync/blobs';
import { qrToSvg } from '@sync/identity-invite';
import type { AppConfig } from '@sync/modules';
import identity from './infra/identity/index';
import transport from './infra/transport/index';
import { createDaycareAuthz } from './modules/daycare/authz';
import { bridge } from './modules/daycare/bridge';
import daycare from './modules/daycare/index';
import { ACCENT, APP_NAME, RELAY_URL } from './modules/daycare/constants';

bridge.qrToSvg = (text) => qrToSvg(text);

export default {
  name: APP_NAME,
  shortName: 'Lambs Daily',
  description: 'Daily log for a family home daycare',
  themeColor: ACCENT,
  backgroundColor: '#ffffff',
  icons: { src192: 'public/icons/icon-192.png', src512: 'public/icons/icon-512.png', maskable512: 'public/icons/maskable-512.png' },
  modules: [identity, transport, daycare],
  identityProvider: 'identity.invite',
  transports: ['transport.ws'],
  settings: { transport: { relayUrl: RELAY_URL } },
  // The theme script must be a same-origin file: the generated CSP forbids inline scripts.
  assets: ['public/theme-init.js'],
  // The relay must be listed here or the browser will refuse to connect to it.
  connectSrc: [RELAY_URL],

  // A person decides every join and device link, seeing the same five words as the other screen (SPEC 4.3).
  // Needs AppConfig.approveJoin / approveLink (upstream PR epl692/Sync-PWA-Framework#4); see DECISIONS.md D-009.
  approveJoin: (req) => bridge.approveJoin(req),
  approveLink: (device, sas) => bridge.approveLink(device, sas),

  // Runs once the core is open and BEFORE transports start (start-app.ts), so the authz validator is in place before
  // any remote packet arrives. Also where attachments are switched on (photos, SPEC 8).
  async blobs({ core, spaces }) {
    const s = spaces!;
    core.registerValidator(
      createDaycareAuthz({
        members: (space) => s.members(space),
        onMemberChange: (cb) => s.on((e) => e.kind === 'member:changed' && cb(e.space)),
      }),
    );
    const blobs = await createBlobs({ core, keys: s.blobKeys, config: { budgetBytes: 500 * 1024 * 1024 } });
    defineSyncBlob(blobs);
    return blobs;
  },
} satisfies AppConfig;
