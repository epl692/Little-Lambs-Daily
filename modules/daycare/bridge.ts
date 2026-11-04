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
  /** Set by app.config.ts. */
  qrToSvg: undefined as ((text: string) => string) | undefined,
};

export type Bridge = typeof bridge;
