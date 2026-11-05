/**
 * Fetching an attachment that may not be on the relay yet. A phone often learns about a photo entry before the relay has finished
 * receiving the photo from the provider; the relay then answers "I don't have it" and nothing tells the phone when it arrives, so a
 * plain fetch waits forever. This asks again, with a time limit on each try, and cancels the stuck one before the next.
 */
import type { BlobRef, BlobsApi } from './types';

export interface RetryOptions {
  /** How long each try may take, in ms. One try per entry. */
  tries?: number[];
  /** Pause between tries, ms. */
  gapMs?: number;
  /** Return false to stop quietly (the picture is no longer wanted). */
  live?: () => boolean;
}

// quick at first (a photo that is already on the relay arrives in well under a second), then more patient
export const DEFAULT_TRIES = [2_500, 4_000, 6_000, 10_000, 15_000, 30_000];

export class GaveUp extends Error {}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function fetchWithRetry(blobs: Pick<BlobsApi, 'toBlob' | 'cancel'>, ref: BlobRef, o: RetryOptions = {}): Promise<Blob> {
  const tries = o.tries ?? DEFAULT_TRIES;
  const live = o.live ?? (() => true);
  let last: unknown;
  for (let i = 0; i < tries.length; i++) {
    if (!live()) throw new GaveUp('no longer wanted');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new GaveUp('timed out')), tries[i]!)));
    try {
      return await Promise.race([blobs.toBlob(ref), limit]);
    } catch (e) {
      last = e;
      blobs.cancel?.(ref); // stop the stuck request so the next try starts fresh
    } finally {
      clearTimeout(timer);
    }
    if (i < tries.length - 1) await sleep(o.gapMs ?? 500);
  }
  throw last instanceof Error ? last : new GaveUp('could not load');
}
