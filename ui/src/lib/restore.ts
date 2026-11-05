/**
 * Restore from a backup ZIP (the file `buildExport` writes). A provider restores into their own daycare: families are matched to
 * the ones on this device (by id, then by name) or created, and everything is written again with its original id, so running a
 * restore twice, or over data that is already here, only adds what is missing.
 *
 * What cannot come back exactly, and why (the validator in modules/daycare/authz.ts rejects a write whose `createdBy` is not the
 * person writing it, so history cannot be forged):
 * - entries and replies are re-created under the person restoring. The author's name stays as written; a parent's entry loses
 *   its "from home" mark and can no longer be edited by that parent.
 * - reactions are not restored (each belongs to the person who tapped it).
 * - photos are re-uploaded from the ZIP's photos/ folder, with new thumbnails.
 */
import { photoPaths, EXPORT_SCHEMA, type ExportObject } from './reports';
import type { BlobRef, Data } from './types';

export interface Backup {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  spaces: Array<{ id: string; name?: string }>;
  objects: ExportObject[];
  missingPhotos?: string[];
}

export class BackupError extends Error {}

const FAMILY_SUFFIX = ' Family';

/** Read and check data.json from an unzipped backup. Throws a message a person can act on. */
export function parseBackup(files: Record<string, Uint8Array>, decode: (b: Uint8Array) => string): Backup {
  const raw = files['data.json'];
  if (!raw) throw new BackupError('This is not a Little Lambs Daily backup (no data.json inside).');
  let b: Backup;
  try {
    b = JSON.parse(decode(raw)) as Backup;
  } catch {
    throw new BackupError('The backup’s data.json could not be read. The file may be damaged.');
  }
  if (b?.app !== 'little-lambs-daily' || !Array.isArray(b.objects) || !Array.isArray(b.spaces)) throw new BackupError('This is not a Little Lambs Daily backup.');
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion > EXPORT_SCHEMA) {
    throw new BackupError('This backup was made by a newer version of the app. Update the app, then try again.');
  }
  return b;
}

export interface LocalFamily {
  id: string;
  name: string; // "Lee Family"
}

export interface FamilyPlan {
  from: { id: string; name: string };
  /** The family on this device it lands in, or undefined when one will be created. */
  to?: string;
  children: { total: number; add: number };
  entries: { total: number; add: number };
  replies: { total: number; add: number };
  /** Photo entries with no photo files in the ZIP: they cannot be restored. */
  skippedNoPhotos: number;
}
export interface Plan {
  families: FamilyPlan[];
  reactionsSkipped: number;
  photosInZip: number;
}

const norm = (s: string) => s.trim().toLowerCase();

/** What a restore would do, without doing it. `have` is every object id already on this device. */
export function planRestore(b: Backup, local: LocalFamily[], have: Set<string>, files: Record<string, unknown>): Plan {
  const photoFiles = new Set(Object.keys(files).filter((k) => k.startsWith('photos/')));
  const photos = photoPaths(b.objects);
  const haveAll = (id: string) => photos.filter((p) => p.obj === id).every((p) => photoFiles.has(p.path));
  const families: FamilyPlan[] = b.spaces.map((s) => {
    const name = s.name ?? 'Family';
    const to = local.find((l) => l.id === s.id)?.id ?? local.find((l) => norm(l.name) === norm(name))?.id;
    const mine = b.objects.filter((o) => o.space === s.id);
    const of = (type: string) => mine.filter((o) => o.type === type);
    const add = (list: ExportObject[]) => list.filter((o) => !have.has(o.id)).length;
    const entries = of('daycare.entry');
    return {
      from: { id: s.id, name },
      to,
      children: { total: of('daycare.child').length, add: add(of('daycare.child')) },
      entries: { total: entries.length, add: add(entries) },
      replies: { total: of('daycare.comment').length, add: add(of('daycare.comment')) },
      skippedNoPhotos: entries.filter((e) => e.fields.kind === 'photo' && !have.has(e.id) && !haveAll(e.id)).length,
    };
  });
  return { families, reactionsSkipped: b.objects.filter((o) => o.type === 'daycare.reaction').length, photosInZip: photoFiles.size };
}

export interface RestoreDeps {
  data: Pick<Data, 'create' | 'get'>;
  /** Make a new, empty family Space on this device; resolves to its id. */
  createFamily(name: string): Promise<string>;
  attach?(file: Blob, o: { space: string; obj: string; name?: string; type?: string }): Promise<BlobRef>;
  /** A small preview of an image file. */
  thumb?(file: Blob): Promise<Blob>;
  me: { user: string };
  onProgress?(done: number, total: number): void;
}

export interface RestoreReport {
  children: number;
  entries: number;
  replies: number;
  photos: number;
  skipped: number; // already here
  failed: Array<{ id: string; why: string }>;
  reactionsSkipped: number;
  createdFamilies: string[];
}

const stripFamily = (n: string) => n.replace(new RegExp(`${FAMILY_SUFFIX}$`), '');

export async function runRestore(b: Backup, files: Record<string, Uint8Array>, plan: Plan, d: RestoreDeps): Promise<RestoreReport> {
  const report: RestoreReport = { children: 0, entries: 0, replies: 0, photos: 0, skipped: 0, failed: [], reactionsSkipped: plan.reactionsSkipped, createdFamilies: [] };
  // where each backed-up family goes
  const target = new Map<string, string>();
  for (const f of plan.families) {
    if (f.to) target.set(f.from.id, f.to);
    else {
      const id = await d.createFamily(stripFamily(f.from.name));
      target.set(f.from.id, id);
      report.createdFamilies.push(stripFamily(f.from.name));
    }
  }
  const photoFor = new Map<string, Array<{ path: string; ref: BlobRef }>>();
  for (const p of photoPaths(b.objects)) (photoFor.get(p.obj) ?? photoFor.set(p.obj, []).get(p.obj)!).push({ path: p.path, ref: p.ref });

  const order = ['daycare.child', 'daycare.entry', 'daycare.comment'];
  const todo = b.objects.filter((o) => order.includes(o.type) && target.has(o.space)).sort((x, y) => order.indexOf(x.type) - order.indexOf(y.type));
  const childIds = new Set(b.objects.filter((o) => o.type === 'daycare.child').map((o) => o.id));
  let done = 0;

  for (const o of todo) {
    d.onProgress?.(done++, todo.length);
    const space = target.get(o.space)!;
    try {
      if (await d.data.get(o.id)) {
        report.skipped++;
        continue;
      }
      const fields: Record<string, unknown> = { ...o.fields };
      if (o.type === 'daycare.child') {
        delete fields.avatar;
      } else {
        fields.createdBy = d.me.user;
        fields.createdByRole = 'provider';
        if (o.type === 'daycare.entry' && !childIds.has(String(fields.child))) throw new Error('its child is not in the backup');
      }
      if (o.type === 'daycare.entry' && fields.kind === 'photo') {
        const list = photoFor.get(o.id) ?? [];
        const missing = list.find((p) => !files[p.path]);
        if (!list.length || missing || !d.attach) throw new Error('its photos are not in the backup');
        const attached: BlobRef[] = [];
        const thumbs: BlobRef[] = [];
        for (const p of list) {
          const blob = new Blob([files[p.path] as BlobPart], { type: p.ref.type || 'image/jpeg' });
          attached.push(await d.attach(blob, { space, obj: o.id, name: p.ref.name, type: blob.type }));
          if (d.thumb) {
            try {
              thumbs.push(await d.attach(await d.thumb(blob), { space, obj: o.id, name: `thumb-${p.ref.name ?? 'photo.jpg'}`, type: 'image/jpeg' }));
            } catch {
              // the grid falls back to the full image when thumbnails do not match the photos
            }
          }
        }
        fields.photos = attached;
        if (thumbs.length === attached.length) fields.thumbs = thumbs;
        else delete fields.thumbs;
        report.photos += attached.length;
      } else {
        delete fields.photos;
        delete fields.thumbs;
      }
      await d.data.create(space, o.type, fields, { id: o.id });
      if (o.type === 'daycare.child') report.children++;
      else if (o.type === 'daycare.entry') report.entries++;
      else report.replies++;
    } catch (e) {
      report.failed.push({ id: o.id, why: e instanceof Error ? e.message : String(e) });
    }
  }
  d.onProgress?.(todo.length, todo.length);
  return report;
}
