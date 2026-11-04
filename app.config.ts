import type { AppConfig } from '@sync/modules';
import identity from './infra/identity/index';
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
  // Phase 1: nothing to bind yet. Later: authz validator (phase 2), Staff Space (phase 3), createBlobs (phase 7).
  async onReady(_host, _spaces) {},
} satisfies AppConfig;
