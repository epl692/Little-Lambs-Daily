/**
 * daycare-authz: the app-level authorization layer (SPEC 3.3).
 *
 * The framework knows Owner / Editor / Viewer. Providers are Owners; parents are Editors, and an Editor could otherwise
 * create or delete anything. Schemas are not authorization, so every peer runs this validator in the `send` and `apply`
 * phases and reaches the same verdict from the same Space state.
 *
 * Deliberately structural: it imports nothing from @sync/*, so it is testable with fakes and registered by app code
 * through `core.registerValidator` (see app.config.ts).
 */
import { PARENT_KINDS } from './schema/enums';

export const REJECT_REASON = 'daycare-role';

export interface AuthzEnvelope {
  author: string;
  space: string;
}
export interface AuthzBody {
  obj: string;
  op: 'create' | 'update' | 'delete';
  type: string;
  fields: Record<string, unknown>;
}
export interface AuthzContext {
  /** The stored object, if any (a StoredObject: `fields[name].value`). */
  existing?: unknown;
}
export type AuthzResult = { verdict: 'accept' } | { verdict: 'reject'; reason: string } | { verdict: 'defer'; reason: string };

export interface AuthzMember {
  user: string;
  role: 'owner' | 'editor' | 'viewer';
  devices: Array<{ id: string }>;
}
export interface AuthzDeps {
  members(space: string): Promise<AuthzMember[]>;
  /** Subscribe to membership changes so cached roles are refreshed. Returns an unsubscribe function. */
  onMemberChange(cb: (space: string) => void): () => void;
}
export interface DaycareAuthz {
  readonly id: string;
  readonly phases: readonly ['send', 'apply'];
  validate(phase: 'send' | 'apply', envelope: AuthzEnvelope, body: AuthzBody | undefined, ctx: AuthzContext): Promise<AuthzResult>;
  dispose(): void;
}

const ACCEPT: AuthzResult = { verdict: 'accept' };
const reject = (why: string): AuthzResult => ({ verdict: 'reject', reason: `${REJECT_REASON}: ${why}` });
const defer = (why: string): AuthzResult => ({ verdict: 'defer', reason: why });

/** Types a parent may create. `entry` is further limited by kind. */
const PARENT_CREATE = new Set(['daycare.entry', 'daycare.comment', 'daycare.reaction']);
/** Fields no parent update may touch: they would change what an item is or who owns it. */
const PARENT_FROZEN: Record<string, readonly string[]> = {
  'daycare.entry': ['kind', 'child', 'createdBy', 'createdByRole'],
  'daycare.comment': ['target', 'createdBy', 'createdByRole'],
  'daycare.reaction': ['target', 'emoji', 'createdBy'],
};
/** Types whose creator is recorded in `createdBy`. */
const OWNED = new Set(Object.keys(PARENT_FROZEN));

function existingField(existing: unknown, name: string): unknown {
  const f = (existing as { fields?: Record<string, { value?: unknown }> } | undefined)?.fields?.[name];
  return f?.value;
}

export function createDaycareAuthz(deps: AuthzDeps): DaycareAuthz {
  // space -> device -> who. Refreshed on a miss and when membership changes.
  const cache = new Map<string, Map<string, { user: string; role: AuthzMember['role'] }>>();
  const off = deps.onMemberChange((space) => cache.delete(space));

  async function load(space: string) {
    const map = new Map<string, { user: string; role: AuthzMember['role'] }>();
    for (const m of await deps.members(space)) for (const d of m.devices) map.set(d.id, { user: m.user, role: m.role });
    cache.set(space, map);
    return map;
  }
  async function whoIs(space: string, device: string) {
    const hit = cache.get(space)?.get(device);
    if (hit) return hit;
    return (await load(space)).get(device);
  }

  return {
    id: 'daycare-authz',
    phases: ['send', 'apply'],
    dispose: off,
    async validate(_phase, env, body, ctx) {
      if (!body) return ACCEPT; // not decodable yet; other validators judge the envelope
      if (body.type.startsWith('$')) return ACCEPT; // control events belong to the Spaces validator

      const who = await whoIs(env.space, env.author);
      if (!who) return defer('unknown-device'); // the framework retries on revalidate()
      if (who.role === 'viewer') return reject('viewers cannot write');

      // Provenance: whoever writes an owned object must be the person it says wrote it. Stops a parent from
      // posting "as" a provider and anyone from impersonating anyone else.
      if (body.op === 'create' && OWNED.has(body.type)) {
        if (body.fields.createdBy !== who.user) return reject('createdBy does not match the author');
        const wantRole = who.role === 'owner' ? 'provider' : 'parent';
        if (body.type !== 'daycare.reaction' && body.fields.createdByRole !== wantRole) return reject(`createdByRole must be ${wantRole}`);
      }

      if (who.role === 'owner') return ACCEPT; // provider: everything else, including moderation

      // ---- Editor = parent -------------------------------------------------------------------------------
      if (body.op === 'create') {
        if (!PARENT_CREATE.has(body.type)) return reject(`parents cannot create ${body.type}`);
        if (body.type === 'daycare.entry' && !(PARENT_KINDS as readonly unknown[]).includes(body.fields.kind)) {
          return reject(`parents cannot log ${String(body.fields.kind)} entries`);
        }
        return ACCEPT;
      }

      if (body.type === 'daycare.child') {
        if (body.op !== 'update') return reject('parents cannot create or delete children');
        const keys = Object.keys(body.fields);
        return keys.every((k) => k === 'familyNotes') ? ACCEPT : reject('parents may only edit familyNotes');
      }

      if (!OWNED.has(body.type)) return reject(`parents cannot change ${body.type}`);

      // update / delete of an owned object: only your own
      if (!ctx.existing) return defer('object-not-here-yet');
      if (existingField(ctx.existing, 'createdBy') !== who.user) return reject('parents may only change their own items');
      if (body.op === 'update') {
        // Frozen fields may be written again with the SAME value: undoing a delete re-asserts every field of the object.
        const frozen = PARENT_FROZEN[body.type]!;
        const touched = Object.keys(body.fields).find((k) => frozen.includes(k) && body.fields[k] !== existingField(ctx.existing, k));
        if (touched) return reject(`parents cannot change ${touched}`);
      }
      return ACCEPT;
    },
  };
}
