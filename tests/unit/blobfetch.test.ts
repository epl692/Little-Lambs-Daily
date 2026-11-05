import { describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from '../../ui/src/lib/blobfetch';
import type { BlobRef } from '../../ui/src/lib/types';

const ref = { $blob: 1, id: 'b', size: 1, type: 'image/jpeg' } as BlobRef;
const hang = () => new Promise<Blob>(() => undefined);
const FAST = { tries: [20, 20, 20, 20], gapMs: 1 };

describe('fetching a photo the relay does not have yet', () => {
  it('asks again after a stuck try, cancelling the stuck one, and shows the photo once it is there', async () => {
    const blob = { size: 5 } as Blob;
    const toBlob = vi.fn().mockImplementationOnce(hang).mockImplementationOnce(hang).mockResolvedValueOnce(blob);
    const cancel = vi.fn();
    expect(await fetchWithRetry({ toBlob, cancel }, ref, FAST)).toBe(blob);
    expect(toBlob).toHaveBeenCalledTimes(3);
    expect(cancel).toHaveBeenCalledTimes(2);
  });
  it('gives up after the last try so the person gets a retry button', async () => {
    const toBlob = vi.fn(hang);
    await expect(fetchWithRetry({ toBlob, cancel: vi.fn() }, ref, FAST)).rejects.toThrow(/timed out/);
    expect(toBlob).toHaveBeenCalledTimes(4);
  });
  it('retries a quick failure too, and succeeds', async () => {
    const toBlob = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ size: 1 } as Blob);
    expect((await fetchWithRetry({ toBlob }, ref, FAST)).size).toBe(1);
  });
  it('stops when the picture is no longer wanted', async () => {
    let live = true;
    const toBlob = vi.fn(() => {
      live = false;
      return hang();
    });
    await expect(fetchWithRetry({ toBlob }, ref, { ...FAST, live: () => live })).rejects.toThrow();
    expect(toBlob).toHaveBeenCalledTimes(1);
  });
  it('a photo already on the device comes back at once', async () => {
    const blob = { size: 9 } as Blob;
    expect(await fetchWithRetry({ toBlob: async () => blob }, ref, FAST)).toBe(blob);
  });
});
