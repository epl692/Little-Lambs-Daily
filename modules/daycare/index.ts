import type { ModuleDefinition } from '@sync/modules';
import { mount } from '../../ui/dist/ui.js';
import { APP_NAME, DAYCARE_NAME } from './constants';

/**
 * The single `daycare` module. Phase 1: no object types yet (schemas arrive in phase 2), one root view that mounts the
 * Svelte UI. The UI never sees framework internals: it gets a thin typed `api` built from ctx.
 */
export default {
  id: 'daycare',
  version: '0.1.0',
  provides: {
    types: [],
    views: {
      root: (ctx) =>
        class DaycareRoot extends HTMLElement {
          #unmount: (() => void) | undefined;
          connectedCallback(): void {
            this.#unmount = mount(this, { appName: APP_NAME, daycareName: DAYCARE_NAME, data: ctx.data, blobs: ctx.blobs, spaces: ctx.spaces });
          }
          disconnectedCallback(): void {
            this.#unmount?.();
          }
        },
    },
  },
} satisfies ModuleDefinition;
