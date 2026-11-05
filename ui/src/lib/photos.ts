/**
 * Photos (SPEC 6.5, 8): shrink to 2048px at quality 0.82, strip metadata by re-encoding through a canvas, make a small
 * thumbnail, attach one copy per family Space, and write one `photo` entry per child.
 *
 * The browser-only part (`canvasReencode`) is injected, so the rest is tested with fakes.
 */
import type { Actor } from './log';
import { clean } from './log';
import type { Data } from './types';

export const FULL_MAX = 2048;
export const THUMB_MAX = 480;
export const FULL_QUALITY = 0.82;
export const THUMB_QUALITY = 0.7;
export const MAX_PHOTOS = 12;

/** Largest size that keeps the aspect ratio with the long edge at most `max`. Never enlarges. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Re-encode an image so its long edge is at most `max`. Metadata (EXIF, GPS) is dropped because only pixels are redrawn. */
export type Reencode = (file: Blob, max: number, quality: number) => Promise<Blob>;

export const canvasReencode: Reencode = async (file, max, quality) => {
  // "from-image" applies the EXIF orientation to the pixels, so dropping the tag later does not turn the photo sideways
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const { width, height } = fitWithin(bmp.width, bmp.height, max);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('This browser cannot process photos');
    g.drawImage(bmp, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process that photo'))), 'image/jpeg', quality));
  } finally {
    bmp.close();
  }
};

export interface Prepared {
  full: Blob;
  thumb: Blob;
  name: string;
}

export async function preparePhoto(file: File, reencode: Reencode = canvasReencode): Promise<Prepared> {
  if (file.type && !file.type.startsWith('image/')) throw new Error(`${file.name} is not a photo`);
  const [full, thumb] = await Promise.all([reencode(file, FULL_MAX, FULL_QUALITY), reencode(file, THUMB_MAX, THUMB_QUALITY)]);
  return { full, thumb, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
}

/** The slice of `ctx.blobs` that is used. */
export interface BlobsLike {
  attach(source: Blob, opts: { space: string; obj: string; name?: string; type?: string }): Promise<unknown>;
}

export interface PhotoTarget {
  id: string;
  space: string;
}

/** How many separate families (Spaces) can see these photos: shown as a warning when more than one. */
export const familyCount = (targets: PhotoTarget[]) => new Set(targets.map((t) => t.space)).size;

export function createPhotoLogger(d: { data: Data; blobs: () => BlobsLike | undefined; actor: () => Actor; newId?: () => string }) {
  const newId = d.newId ?? (() => crypto.randomUUID());

  /**
   * One `photo` entry per child, each with its own copy of every photo attached in that child's Space (blobs are encrypted per
   * Space). All or nothing: if anything fails, the entries already made are removed again.
   */
  async function post(input: { targets: PhotoTarget[]; photos: Prepared[]; text?: string; at: number; onProgress?: (done: number, total: number) => void }) {
    const blobs = d.blobs();
    if (!blobs) throw new Error('Photos are not available on this device');
    const a = d.actor();
    if (a.role !== 'provider') throw new Error('Only providers post photos');
    if (input.targets.length === 0) throw new Error('Pick at least one child');
    if (input.photos.length === 0) throw new Error('Pick a photo first');
    if (input.photos.length > MAX_PHOTOS) throw new Error(`At most ${MAX_PHOTOS} photos at a time`);
    const batchId = input.targets.length > 1 ? newId() : undefined;
    const ids: string[] = [];
    let done = 0;
    const total = input.targets.length * input.photos.length;
    try {
      for (const t of input.targets) {
        const id = newId();
        const photos: unknown[] = [];
        const thumbs: unknown[] = [];
        for (const p of input.photos) {
          photos.push(await blobs.attach(p.full, { space: t.space, obj: id, name: p.name, type: 'image/jpeg' }));
          thumbs.push(await blobs.attach(p.thumb, { space: t.space, obj: id, name: `thumb-${p.name}`, type: 'image/jpeg' }));
          input.onProgress?.(++done, total);
        }
        const fields = clean({
          child: t.id,
          kind: 'photo',
          at: input.at,
          batchId,
          photos,
          thumbs,
          text: input.text,
          createdBy: a.user,
          createdByName: a.name,
          createdByRole: a.role,
        });
        await d.data.create(t.space, 'daycare.entry', fields, { id });
        ids.push(id);
      }
    } catch (e) {
      await Promise.allSettled(ids.map((id) => d.data.undo(id)));
      throw e;
    }
    return { ids, batchId };
  }

  /**
   * Change which photos a posted entry has: keep some of the current ones (by position), add new ones. Returns the `photos` and
   * `thumbs` fields to save (thumbs is null when the previews no longer line up with the photos; the grid then shows the full images).
   * New photos are attached in the entry's own Space under its id. The caller saves the fields with the rest of the edit.
   */
  async function change(input: { entry: { id: string; space: string; fields: Record<string, any> }; keep: number[]; add: Prepared[]; onProgress?: (done: number, total: number) => void }) {
    const a = d.actor();
    if (a.role !== 'provider') throw new Error('Only providers change photos');
    // plain copies: the entry may come from reactive UI state, whose proxies the database cannot store
    const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));
    const cur: unknown[] = Array.isArray(input.entry.fields.photos) ? plain(input.entry.fields.photos) : [];
    const curThumbs: unknown[] = Array.isArray(input.entry.fields.thumbs) ? plain(input.entry.fields.thumbs) : [];
    const keep = [...new Set(input.keep)].filter((i) => i >= 0 && i < cur.length).sort((x, y) => x - y);
    if (keep.length + input.add.length === 0) throw new Error('A photo post needs at least one photo. Delete the entry instead.');
    if (keep.length + input.add.length > MAX_PHOTOS) throw new Error(`At most ${MAX_PHOTOS} photos`);
    const blobs = d.blobs();
    if (input.add.length > 0 && !blobs) throw new Error('Photos are not available on this device');
    const photos = keep.map((i) => cur[i]);
    const aligned = curThumbs.length === cur.length;
    const thumbs = aligned ? keep.map((i) => curThumbs[i]) : [];
    let done = 0;
    for (const p of input.add) {
      photos.push(await blobs!.attach(p.full, { space: input.entry.space, obj: input.entry.id, name: p.name, type: 'image/jpeg' }));
      thumbs.push(await blobs!.attach(p.thumb, { space: input.entry.space, obj: input.entry.id, name: `thumb-${p.name}`, type: 'image/jpeg' }));
      input.onProgress?.(++done, input.add.length);
    }
    return { photos, thumbs: aligned && thumbs.length === photos.length ? thumbs : null };
  }

  return { post, change };
}

export type PhotoLogger = ReturnType<typeof createPhotoLogger>;
