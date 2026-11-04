/**
 * Reactions and thread replies (SPEC 5.3, 5.4, 6.6). Plain TypeScript over the structural Data type, tested on real nodes.
 *
 * A reaction is one object per (target, user, emoji) with a deterministic id, so a double tap on two offline devices
 * lands on the same object. Toggling off deletes it; toggling on again re-creates it under the same id.
 */
import type { Actor, Role } from './log';
import type { Data, Obj } from './types';

/** Display order. Stored as keys, rendered as emoji. */
export const EMOJI = [
  { key: 'thumbsUp', char: '👍', label: 'Thumbs up' },
  { key: 'love', char: '❤️', label: 'Love' },
  { key: 'laugh', char: '😂', label: 'Laugh' },
  { key: 'wow', char: '😮', label: 'Wow' },
  { key: 'sad', char: '😢', label: 'Sad' },
  { key: 'mad', char: '😠', label: 'Angry' },
  { key: 'poop', char: '💩', label: 'Poop' },
  { key: 'party', char: '🎉', label: 'Party' },
] as const;
export const emojiChar = (key: string) => EMOJI.find((e) => e.key === key)?.char ?? '❔';
export const emojiLabel = (key: string) => EMOJI.find((e) => e.key === key)?.label ?? key;

/** The same (target, user, emoji) always gives the same id. */
export const reactionId = (target: string, user: string, emoji: string) => `reaction:${target}:${user}:${emoji}`;

export interface ReactionPill {
  emoji: string;
  count: number;
  mine: boolean;
  users: string[];
}

/** Group reaction rows by target, then by emoji in display order. */
export function groupReactions(rows: Obj[], me: string): Map<string, ReactionPill[]> {
  const byTarget = new Map<string, Map<string, string[]>>();
  for (const r of rows) {
    const t = String(r.fields.target);
    const e = String(r.fields.emoji);
    const m = byTarget.get(t) ?? new Map<string, string[]>();
    const users = m.get(e) ?? [];
    const u = String(r.fields.createdBy);
    if (!users.includes(u)) users.push(u);
    m.set(e, users);
    byTarget.set(t, m);
  }
  const out = new Map<string, ReactionPill[]>();
  for (const [t, m] of byTarget) {
    const pills: ReactionPill[] = [];
    for (const e of EMOJI) {
      const users = m.get(e.key);
      if (users?.length) pills.push({ emoji: e.key, count: users.length, mine: users.includes(me), users });
    }
    out.set(t, pills);
  }
  return out;
}

export interface Reply {
  id: string;
  target: string;
  text: string;
  createdBy: string;
  createdByName: string;
  createdByRole: Role;
  at: number;
  editedAt?: number;
}

/** Group comment rows by target, oldest first. */
export function groupReplies(rows: Array<Obj & { createdAt?: number }>): Map<string, Reply[]> {
  const out = new Map<string, Reply[]>();
  for (const r of rows) {
    const t = String(r.fields.target);
    const list = out.get(t) ?? [];
    list.push({
      id: r.id,
      target: t,
      text: String(r.fields.text ?? ''),
      createdBy: String(r.fields.createdBy ?? ''),
      createdByName: String(r.fields.createdByName ?? 'Someone'),
      createdByRole: (r.fields.createdByRole as Role) ?? 'parent',
      at: Number(r.fields.at ?? r.createdAt ?? 0),
      editedAt: typeof r.fields.editedAt === 'number' ? r.fields.editedAt : undefined,
    });
    out.set(t, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  return out;
}

export const replyCountText = (n: number) => (n === 1 ? '1 reply' : `${n} replies`);

export interface Target {
  id: string;
  space: string;
}

export function createThreads(d: { data: Data; actor: () => Actor; now?: () => number }) {
  const { data } = d;
  const now = d.now ?? Date.now;

  /** Toggle my reaction. Returns whether it is now on. */
  async function toggleReaction(target: Target, emoji: string): Promise<boolean> {
    const a = d.actor();
    const id = reactionId(target.id, a.user, emoji);
    const existing = await data.get(id);
    if (existing) {
      await data.remove(id);
      return false;
    }
    await data.create(target.space, 'daycare.reaction', { target: target.id, emoji, createdBy: a.user }, { id });
    return true;
  }

  async function reply(target: Target, text: string): Promise<string> {
    const body = text.trim();
    if (!body) throw new Error('Write something first');
    const a = d.actor();
    const o = await data.create(target.space, 'daycare.comment', {
      target: target.id,
      text: body,
      at: now(),
      createdBy: a.user,
      createdByName: a.name,
      createdByRole: a.role,
    });
    return o.id;
  }

  async function editReply(id: string, text: string): Promise<void> {
    const body = text.trim();
    if (!body) throw new Error('Write something first');
    await data.update(id, { text: body, editedAt: now() });
  }
  const removeReply = (id: string) => data.remove(id);
  const undo = (id: string) => data.undo(id);

  return { toggleReaction, reply, editReply, removeReply, undo };
}

export type Threads = ReturnType<typeof createThreads>;
