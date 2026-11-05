/**
 * The slice of the framework the UI uses, described structurally so the UI imports nothing from @sync/*.
 * The daycare module hands over the real objects (`ctx.spaces.admin`, `ctx.data`); tests hand over real nodes.
 */
export type Role = 'owner' | 'editor' | 'viewer';

export interface SpaceInfo {
  id: string;
  name?: string;
  myRole: Role;
  memberCount: number;
}
export interface MemberInfo {
  user: string;
  displayName?: string;
  role: Role;
  devices: Array<{ id: string; name?: string; active: boolean }>;
}
export interface InviteArtifact {
  inviteId: string;
  url: string;
  qrPayload: string;
  expiresAt: number;
}
export interface Session {
  user: string;
  displayName?: string;
  device: { deviceId: string; name?: string };
}
export interface SecurityEvent {
  kind: string;
  space?: string;
  user?: string;
  role?: Role | null;
}

export interface Admin {
  session(): Session | undefined;
  signUp(displayName?: string): Promise<Session>;
  create(name?: string): Promise<SpaceInfo>;
  list(): Promise<SpaceInfo[]>;
  members(space: string): Promise<MemberInfo[]>;
  remove(space: string, user: string): Promise<void>;
  leave(space: string): Promise<void>;
  invite(space: string, spec: { role: Role; expiresAt: number; maxUses: number; approval?: 'required' | 'auto' }): Promise<InviteArtifact>;
  revokeInvite(space: string, inviteId: string): Promise<void>;
  accept(artifact: string, opts?: { timeoutMs?: number; onSas?: (sas: string) => void }): Promise<{ space: string; role: Role }>;
  linkDevice(): Promise<{ code: string; done: Promise<{ device: string }> }>;
  joinAsDevice(code: string, opts?: { timeoutMs?: number; onSas?: (sas: string) => void }): Promise<Session>;
  revokeDevice(device: string): Promise<void>;
  on(cb: (e: SecurityEvent) => void): () => void;
}

export interface Obj {
  id: string;
  type: string;
  space: string;
  fields: Record<string, any>;
}
export interface Query {
  once(): Promise<Obj[]>;
  subscribe(cb: (rows: Obj[]) => void): () => void;
}
export interface Data {
  create(space: string, type: string, fields: Record<string, any>, opts?: { id?: string }): Promise<Obj>;
  update(id: string, fields: Record<string, any>): Promise<Obj>;
  remove(id: string): Promise<void>;
  undo(id: string): Promise<void>;
  get(id: string): Promise<Obj | undefined>;
  query(spec: { type: string; space?: string; where?: (o: Obj) => boolean }): Query;
}

/** Provided by the app (modules/daycare/bridge.ts). */
export interface JoinRequest {
  space: string;
  inviteId: string;
  role: Role;
  deviceName?: string;
  sas: string;
}
export interface Approver {
  join(req: JoinRequest): Promise<boolean>;
  link(device: { deviceId: string; name?: string }, sas: string): Promise<boolean>;
}
export interface UiBridge {
  setApprover(a: Approver): () => void;
  qrToSvg?: (text: string) => string;
}

/** A stored reference to an attachment (an ordinary field value). */
export interface BlobRef {
  $blob: 1;
  id: string;
  size: number;
  type: string;
  name?: string;
  [k: string]: unknown;
}
/** The slice of `ctx.blobs` the UI uses. */
export interface BlobsApi {
  attach(source: Blob, opts: { space: string; obj: string; name?: string; type?: string }): Promise<BlobRef>;
  /** Decrypted bytes; starts the download when the blob is not on this device yet. */
  toBlob(ref: BlobRef): Promise<Blob>;
  pin?(ref: BlobRef): Promise<void>;
}

/** What the daycare module hands mount(). */
export interface UiApi {
  appName: string;
  daycareName: string;
  data: Data;
  blobs?: BlobsApi;
  spaces: { admin?: Admin };
  bridge: UiBridge;
  [capability: string]: unknown;
}
