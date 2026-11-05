/**
 * Telling people about new things (SPEC 12: push notifications need a server the relay is not, so this is in-app plus the browser's
 * own notifications while the app is open). One seam, `notify()`: a future Web Push sender only has to register another delivery.
 *
 * Who hears about what:
 *  - a reply on a card you wrote (or in a thread you joined), from someone else;
 *  - a parent: a new entry from the daycare about their child.
 * Never your own actions, and never old history that merely finished syncing.
 */
import type { Entry } from './format';
import { kindOf, KIND_META, summary } from './format';

export interface Update {
  /** Stable key so the same thing never announces twice. */
  key: string;
  title: string;
  body: string;
}

export type Delivery = (updates: Update[]) => void;

/** How old a thing may be and still be news. Anything older is history arriving by sync. */
export const FRESH_MS = 10 * 60_000;
/** More than this at once collapses into one summary. */
export const MAX_SEPARATE = 3;

export function createNotifier(d: { windowMs?: number } = {}) {
  const deliveries = new Set<Delivery>();
  const seen = new Set<string>();
  let queue: Update[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const windowMs = d.windowMs ?? 800;

  function flush() {
    timer = undefined;
    const batch = queue;
    queue = [];
    if (!batch.length) return;
    const out: Update[] =
      batch.length <= MAX_SEPARATE ? batch : [{ key: 'many', title: `${batch.length} new updates`, body: batch.slice(0, 3).map((u) => u.title).join(' · ') + ' …' }];
    for (const del of [...deliveries]) {
      try {
        del(out);
      } catch {
        // one broken delivery must not stop the others
      }
    }
  }

  return {
    /** Add a way of delivering updates (in-app toast, system notification, later a push sender). Returns its remover. */
    register(del: Delivery): () => void {
      deliveries.add(del);
      return () => void deliveries.delete(del);
    },
    /** Queue an update; a burst arrives as one delivery. */
    notify(u: Update): void {
      if (seen.has(u.key)) return;
      seen.add(u.key);
      queue.push(u);
      timer ??= setTimeout(flush, windowMs);
    },
    /** Drop what is queued (for tests and shutdown). */
    stop(): void {
      clearTimeout(timer);
      timer = undefined;
      queue = [];
    },
  };
}

export type Notifier = ReturnType<typeof createNotifier>;

/** Which of these rows are new since `before`, and fresh enough to be news? */
export function fresh<T extends { id: string }>(rows: T[], before: Set<string> | undefined, at: (r: T) => number, now: number): T[] {
  if (!before) return []; // the first look at the data is the baseline, never news
  return rows.filter((r) => !before.has(r.id) && now - at(r) <= FRESH_MS);
}

export interface ReplyLike {
  id: string;
  target: string;
  text: string;
  createdBy: string;
  createdByName: string;
  at: number;
}

type NameOf = (user: string, fallback: string) => string;

/** Replies worth telling `me` about: from someone else, on a card I wrote or a thread I have replied in. */
export function replyUpdates(news: ReplyLike[], me: string, all: ReplyLike[], entries: Map<string, Entry>, nameOf: NameOf): Update[] {
  const out: Update[] = [];
  for (const r of news) {
    if (r.createdBy === me) continue;
    const mine = entries.get(r.target)?.fields.createdBy === me;
    const joined = all.some((x) => x.target === r.target && x.createdBy === me);
    if (!mine && !joined) continue;
    out.push({ key: `reply:${r.id}`, title: `${nameOf(r.createdBy, r.createdByName)} replied`, body: r.text.slice(0, 140) });
  }
  return out;
}

/** What a parent hears about a new entry from the daycare. */
export function entryUpdate(e: Entry, childName: string, me: string, nameOf: NameOf): Update | undefined {
  if (e.fields.createdBy === me || e.fields.createdByRole === 'parent') return undefined;
  const k = kindOf(e);
  // arrivals and naps are status, not news worth a buzz, unless the daycare wrote a note with them
  if ((k === 'checkin' || k === 'checkout' || k === 'nap') && !e.fields.text) return undefined;
  const what = summary(e) || KIND_META[k].label;
  const note = e.fields.text ? ` · ${String(e.fields.text).slice(0, 100)}` : '';
  return { key: `entry:${e.id}`, title: `${childName}: ${KIND_META[k].label}`, body: `${what}${note} (${nameOf(String(e.fields.createdBy), String(e.fields.createdByName ?? ''))})` };
}
