/**
 * Things only app code can supply, handed to the UI through this singleton (app.config.ts and the daycare module are
 * bundled together, so they share this one instance). Imports nothing from @sync/*.
 *
 *  - approvals: the framework asks the app to approve a join or a device link; the UI shows the SAS words and a person decides.
 *    With no UI listening, the answer is "no" (the framework's own safe default).
 *  - qrToSvg: from @sync/identity-invite, which module code may not import.
 */
export interface JoinRequest {
  space: string;
  inviteId: string;
  role: 'owner' | 'editor' | 'viewer';
  deviceName?: string;
  /** Five words both screens show. */
  sas: string;
}
export interface LinkRequest {
  deviceId: string;
  name?: string;
}
export interface Approver {
  join(req: JoinRequest): Promise<boolean>;
  link(device: LinkRequest, sas: string): Promise<boolean>;
}

/** What the sync pill shows: the relay connection, as the transport module reports it. */
export interface SyncSnapshot {
  state: 'unsupported' | 'idle' | 'needs-pairing' | 'connecting' | 'ready' | 'error';
  detail?: string;
  url?: string;
  /** When a packet last arrived from the relay (ms). */
  lastMessageAt?: number;
  /** When the connection last came up (ms). */
  connectedAt?: number;
  /** Devices connected straight to this one (WebRTC), with no relay in between. */
  direct?: number;
  /** Changes written on this device that nothing (relay or nearby device) has confirmed yet. */
  unconfirmed?: number;
}

/** Pairing two devices directly by exchanging two codes (WebRTC; works on one Wi-Fi with no internet). */
export interface DirectPairing {
  createOffer(): Promise<{ code: string; sessionId: string }>;
  acceptOffer(code: string): Promise<{ code: string; sessionId: string }>;
  acceptAnswer(sessionId: string, code: string): Promise<void>;
  cancel(sessionId: string): void;
  /** The network addresses inside a code (for explaining a failed connection), as the session description text. */
  inspect(code: string): Promise<string>;
}
let snapshot: SyncSnapshot = { state: 'idle' };
const syncListeners = new Set<(s: SyncSnapshot) => void>();

let approver: Approver | undefined;

export const bridge = {
  /** Called by the UI on mount. Returns the function that removes it. */
  setApprover(a: Approver): () => void {
    approver = a;
    return () => {
      if (approver === a) approver = undefined;
    };
  },
  approveJoin: async (req: JoinRequest): Promise<boolean> => (approver ? approver.join(req) : false),
  approveLink: async (device: LinkRequest, sas: string): Promise<boolean> => (approver ? approver.link(device, sas) : false),
  sync: {
    get: (): SyncSnapshot => snapshot,
    subscribe(cb: (s: SyncSnapshot) => void): () => void {
      syncListeners.add(cb);
      return () => void syncListeners.delete(cb);
    },
    /** Called by the transport module. */
    publish(patch: Partial<SyncSnapshot>): void {
      snapshot = { ...snapshot, ...patch };
      for (const cb of [...syncListeners]) cb(snapshot);
    },
  },
  /** Set by the transport module when direct connections are available. */
  direct: undefined as DirectPairing | undefined,
  /** Set by app.config.ts. */
  qrToSvg: undefined as ((text: string) => string) | undefined,
};

export type Bridge = typeof bridge;
