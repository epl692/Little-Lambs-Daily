import type { ModuleDefinition } from '@sync/modules';
import { mount } from '../../ui/dist/ui.js';
import { bridge } from './bridge';
import { APP_NAME, APP_VERSION, DAYCARE_NAME } from './constants';
import { child } from './schema/child';
import { comment } from './schema/comment';
import { entry } from './schema/entry';
import { profile } from './schema/profile';
import { reaction } from './schema/reaction';
import { brand, familyIndex, settings, staffInvite } from './schema/staff';

/**
 * The single `daycare` module: every object type (SPEC 5) and one root view that mounts the Svelte UI. The UI never
 * sees framework internals: it gets a thin typed `api` built from ctx. Authorization lives in ./authz.ts, not in schemas.
 */
export default {
  id: 'daycare',
  version: '0.3.0',
  // The UI manages Spaces (invites, members, device linking) and reads every Space this device belongs to.
  access: { spaces: { read: 'any', write: 'any', manage: true } },
  provides: {
    types: [child, entry, comment, reaction, settings, familyIndex, staffInvite, brand, profile],
    views: {
      root: (ctx) =>
        class DaycareRoot extends HTMLElement {
          #unmount: (() => void) | undefined;
          connectedCallback(): void {
            this.#unmount = mount(this, { appName: APP_NAME, version: APP_VERSION, daycareName: DAYCARE_NAME, data: ctx.data, blobs: ctx.blobs, spaces: ctx.spaces, bridge, sync: bridge.sync });
          }
          disconnectedCallback(): void {
            this.#unmount?.();
          }
        },
    },
  },
} satisfies ModuleDefinition;
