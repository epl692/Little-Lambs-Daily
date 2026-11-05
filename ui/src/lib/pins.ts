/**
 * Keep recent photos on a provider's device. The blob store evicts old, already-uploaded photos when it nears its budget (a
 * parent's phone should do that); on a provider's device the last couple of days must always be there, so those are pinned and
 * unpinned again once they age out. Pure: decides what to pin and unpin; the caller applies it.
 */
import type { BlobRef } from './types';

export const KEEP_DAYS = 2;
export const DAY_MS = 86_400_000;

export interface Tracked {
  ref: BlobRef;
  at: number;
}
export type TrackedMap = Record<string, Tracked>;

export interface PinPlan {
  pin: BlobRef[];
  unpin: BlobRef[];
  next: TrackedMap;
}

/** `rows` are photo entries (any age); `tracked` is what this device already pinned. */
export function planPins(rows: Array<{ at: number; photos: BlobRef[]; thumbs: BlobRef[] }>, tracked: TrackedMap, now: number): PinPlan {
  const cutoff = now - KEEP_DAYS * DAY_MS;
  const next: TrackedMap = {};
  const pin: BlobRef[] = [];
  for (const r of rows) {
    if (r.at < cutoff) continue;
    for (const ref of [...r.photos, ...r.thumbs]) {
      next[ref.id] = { ref, at: r.at };
      if (!tracked[ref.id]) pin.push(ref);
    }
  }
  const unpin = Object.values(tracked)
    .filter((t) => !next[t.ref.id] && t.at < cutoff)
    .map((t) => t.ref);
  // anything tracked that is neither current nor aged out (a deleted entry, say) is let go too
  for (const t of Object.values(tracked)) if (!next[t.ref.id] && t.at >= cutoff) unpin.push(t.ref);
  return { pin, unpin, next };
}
