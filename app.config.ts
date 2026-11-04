import { createBlobs, defineSyncBlob } from '@sync/blobs';
import type { AppConfig } from '@sync/modules';
import identity from './infra/identity/index';
import { createDaycareAuthz } from './modules/daycare/authz';
import daycare from './modules/daycare/index';
import { ACCENT, APP_NAME } from './modules/daycare/constants';

export default {
  name: APP_NAME,
  shortName: 'Lambs Daily',
  description: 'Daily log for a family home daycare',
  themeColor: ACCENT,
  backgroundColor: '#ffffff',
  icons: { src192: 'public/icons/icon-192.png', src512: 'public/icons/icon-512.png', maskable512: 'public/icons/maskable-512.png' },
  modules: [identity, daycare],
  identityProvider: 'identity.invite',
  // The theme script must be a same-origin file: the generated CSP forbids inline scripts.
  assets: ['public/theme-init.js'],
  // Add the relay origin here (wss://...) once it has a URL. See DECISIONS.md.
  // connectSrc: ['wss://relay.example.com'],

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
  // Later: Staff Space + family Space setup and bindSpace (phase 3).
  async onReady(_host, _spaces) {},
} satisfies AppConfig;
