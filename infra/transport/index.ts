// Infrastructure module: the WebSocket relay transport. Like the identity module it may import framework packages.
// The relay URL comes from app settings (`settings.transport.relayUrl`, set in app.config.ts from RELAY_URL).
import { createWebSocketTransport } from '@sync/transport-websocket';
import type { ModuleDefinition } from '@sync/modules';

export default {
  id: 'transport',
  version: '1.0.0',
  provides: {
    transports: [
      {
        id: 'ws',
        create: (ctx) => {
          const url = String(ctx.settings.relayUrl ?? '');
          if (!url) throw new Error('transport.ws needs settings.transport.relayUrl');
          return createWebSocketTransport({ url, id: 'ws' });
        },
      },
    ],
  },
} satisfies ModuleDefinition;
