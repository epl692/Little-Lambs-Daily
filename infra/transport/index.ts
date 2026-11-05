// Infrastructure module: the WebSocket relay transport. Like the identity module it may import framework packages.
// The relay URL comes from app settings (`settings.transport.relayUrl`, set in app.config.ts from RELAY_URL).
import { createWebRtcTransport } from '@sync/transport-webrtc';
import { createWebSocketTransport } from '@sync/transport-websocket';
import type { ModuleDefinition } from '@sync/modules';
import { bridge } from '../../modules/daycare/bridge';

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
          const t = createWebSocketTransport({ url, id: 'ws' });
          // The sync pill (SPEC 6.8) shows what this transport reports.
          bridge.sync.publish({ url, state: t.state });
          t.on('state', (state, detail) => bridge.sync.publish({ state, detail, ...(state === 'ready' ? { connectedAt: Date.now() } : {}) }));
          let last = 0;
          t.on('message', () => {
            const now = Date.now();
            if (now - last > 3000) bridge.sync.publish({ lastMessageAt: (last = now) }); // packets come in bursts; do not redraw for each
          });
          return t;
        },
      },
      {
        // Devices on the same Wi-Fi can sync straight to each other when the relay cannot be reached (SPEC 8). Paired by hand with two codes.
        id: 'rtc',
        create: () => {
          const t = createWebRtcTransport({});
          let peers = 0;
          t.on('peerConnected', () => bridge.sync.publish({ direct: ++peers }));
          t.on('peerDisconnected', () => bridge.sync.publish({ direct: (peers = Math.max(0, peers - 1)) }));
          bridge.direct = {
            createOffer: () => t.createOffer(),
            acceptOffer: (code) => t.acceptOffer(code),
            acceptAnswer: (id, code) => t.acceptAnswer(id, code),
            cancel: (id) => t.cancelPairing(id),
          };
          return t;
        },
      },
    ],
  },
} satisfies ModuleDefinition;
