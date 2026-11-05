import type { Entry } from './format';
import { createLogger, type Actor, type Logger } from './log';
import { createService, type AppState, type Service } from './service';
import { createPhotoLogger, type PhotoLogger } from './photos';
import { createThreads, groupReactions, groupReplies, type ReactionPill, type Reply, type Threads } from './threads';
import { dayRange } from './time';
import type { Admin, BlobRef, JoinRequest, UiApi } from './types';

/** The add sheet: open for these children (skipping the "who" step), or editing an existing entry. */
export interface Sheet {
  preset?: string[];
  edit?: Entry;
}
export interface Toast {
  id: number;
  message: string;
  undo?: () => Promise<void>;
}

export type View =
  | { name: 'welcome' }
  | { name: 'providerSetup' }
  | { name: 'join'; link?: string }
  | { name: 'linkThisDevice' }
  | { name: 'home' }
  | { name: 'addFamily' }
  | { name: 'families' }
  | { name: 'timeline'; child: string }
  | { name: 'family'; space: string }
  | { name: 'invite'; space: string }
  | { name: 'settings' }
  | { name: 'staffInvite' }
  | { name: 'showLinkCode' };

export interface Child {
  id: string;
  space: string;
  name: string;
  firstName: string;
  allergies: string;
  color?: string;
  birthDate?: string;
}

export interface Approval {
  id: number;
  kind: 'join' | 'link';
  title: string;
  detail: string;
  sas: string;
  resolve(ok: boolean): void;
}

/** One place for the UI's state. Screens read `app.st`, `app.view`, `app.approvals` and call `app.go(...)`. */
export function createApp(api: UiApi) {
  const found = api.spaces.admin;
  if (!found) throw new Error('The daycare module needs access.spaces.manage');
  const admin: Admin = found; // keeps its type inside hoisted function declarations
  const svc: Service = createService({ admin, data: api.data });

  const app = $state({
    loading: true,
    st: undefined as AppState | undefined,
    view: { name: 'welcome' } as View,
    history: [] as View[],
    approvals: [] as Approval[],
    children: [] as Child[],
    /** Every entry dated today, for every child on this device (live). */
    todayEntries: [] as Entry[],
    /** Naps with no end yet, any day (live): drives the "Asleep now" banner. */
    openNaps: [] as Entry[],
    /** Reaction pills and thread replies by entry id (live, every entry on this device). */
    reactions: {} as Record<string, ReactionPill[]>,
    replies: {} as Record<string, Reply[]>,
    /** The full-screen photo viewer. */
    viewer: undefined as { photos: BlobRef[]; index: number; title: string } | undefined,
    /** The "who reacted" sheet. */
    whoReacted: undefined as { entry: string; space: string } | undefined,
    sheet: undefined as Sheet | undefined,
    toast: undefined as Toast | undefined,
    now: Date.now(),
    /** Minutes before a since-last-bottle/diaper chip turns amber (settings, default 3h). */
    sinceThresholdMinutes: 180,
    daycareName: api.daycareName,
    appName: api.appName,
  });

  let stopSync: (() => void) | undefined;

  async function refresh(): Promise<AppState> {
    const st = await svc.state();
    app.st = st;
    const s = await svc.settings().catch(() => undefined);
    if (s?.daycareName) app.daycareName = s.daycareName;
    if (s?.appName) app.appName = s.appName;
    if (s?.sinceThresholdMinutes) app.sinceThresholdMinutes = s.sinceThresholdMinutes;
    if (st.mode === 'provider' && !stopSync) stopSync = svc.startStaffSync();
    return st;
  }

  function go(view: View, opts: { replace?: boolean } = {}) {
    if (!opts.replace) app.history.push(app.view);
    app.view = view;
    scrollTo(0, 0);
  }
  function back() {
    app.view = app.history.pop() ?? { name: 'home' };
  }
  /** Go to the right home for whoever this device is. */
  function home() {
    app.history = [];
    app.view = app.st?.mode === 'welcome' ? { name: 'welcome' } : { name: 'home' };
  }

  // The framework asks the app to approve joins and device links; the dialog resolves these.
  let nextApproval = 0;
  const ask = (a: Omit<Approval, 'resolve' | 'id'>) =>
    new Promise<boolean>((resolve) => {
      const id = nextApproval++;
      const entry: Approval = {
        ...a,
        id,
        resolve: (ok) => {
          // by id: items in $state arrays are proxies, so comparing to the original object never matches
          app.approvals = app.approvals.filter((x) => x.id !== id);
          resolve(ok);
        },
      };
      app.approvals.push(entry);
    });
  const familyName = (space: string) => (app.st?.families.find((f) => f.id === space)?.name ?? '').replace(/ Family$/, '') || 'a family';
  const removeApprover = api.bridge.setApprover({
    join: (req: JoinRequest) => {
      const staff = app.st?.staff?.id === req.space;
      return ask({
        kind: 'join',
        title: staff ? 'A new provider wants to join your staff' : `Someone is joining the ${familyName(req.space)} family`,
        detail: staff ? 'They will be able to see and log for every family.' : req.role === 'editor' ? 'They will see their child’s day and can add notes.' : '',
        sas: req.sas,
      });
    },
    link: (_device, sas) =>
      ask({ kind: 'link', title: 'Link a new device to your account?', detail: 'It will see everything you can. Only approve a device you are holding.', sas }),
  });

  async function start() {
    const st = await refresh();
    // An invite link opened in this browser: keep it in memory and take the secret out of the address bar.
    const hash = typeof location !== 'undefined' ? location.hash : '';
    if (hash.startsWith('#/join/')) {
      const link = location.href;
      history.replaceState(null, '', location.pathname + location.search);
      app.view = { name: 'join', link };
    } else {
      app.view = st.mode === 'welcome' ? { name: 'welcome' } : { name: 'home' };
    }
    app.loading = false;
  }

  // Every child on this device (a parent's own, a provider's all), live; and a clock so timers and since-chips move.
  const stopKids = api.data.query({ type: 'daycare.child' }).subscribe((rows) => {
    app.children = rows
      .filter((r) => r.fields.active !== false)
      .map((r) => ({
        id: r.id,
        space: r.space,
        firstName: String(r.fields.firstName ?? ''),
        name: String(r.fields.nickname || r.fields.firstName || ''),
        allergies: String(r.fields.allergies ?? ''),
        color: r.fields.color as string | undefined,
        birthDate: r.fields.birthDate as string | undefined,
      }))
      .sort((x, y) => x.name.localeCompare(y.name));
  });
  // Reactions and replies, grouped by the entry they belong to (live).
  const stopReactions = api.data.query({ type: 'daycare.reaction' }).subscribe((rows) => (app.reactions = Object.fromEntries(groupReactions(rows, me()))));
  const stopReplies = api.data.query({ type: 'daycare.comment' }).subscribe((rows) => (app.replies = Object.fromEntries(groupReplies(rows))));
  const stopNaps = api.data
    .query({ type: 'daycare.entry', where: (o) => o.fields.kind === 'nap' && typeof o.fields.endAt !== 'number' })
    .subscribe((rows) => (app.openNaps = rows));

  // Today's entries: re-subscribes when midnight passes.
  let stopToday: (() => void) | undefined;
  let todayStart = -1;
  function watchToday() {
    const [s, e] = dayRange(Date.now());
    if (s === todayStart) return;
    todayStart = s;
    stopToday?.();
    stopToday = api.data
      .query({ type: 'daycare.entry', where: (o) => Number(o.fields.at) >= s && Number(o.fields.at) < e })
      .subscribe((rows) => (app.todayEntries = rows));
  }
  watchToday();
  const tick = setInterval(() => {
    app.now = Date.now();
    watchToday();
  }, 15_000);

  // Writing to the timeline (add flow, wake, delete, edit) as whoever this device is.
  const actor = (): Actor => {
    const s = admin.session();
    return { user: s?.user ?? '', name: s?.displayName ?? 'Someone', role: app.st?.mode === 'provider' ? 'provider' : 'parent' };
  };
  const logger: Logger = createLogger({ data: api.data, actor });
  const threads: Threads = createThreads({ data: api.data, actor });
  const photos: PhotoLogger = createPhotoLogger({ data: api.data, blobs: () => api.blobs, actor });
  const role = () => actor().role;
  function me() {
    return admin.session()?.user ?? '';
  }

  // Names for the "who reacted" sheet, per Space (device-local cache; members rarely change).
  const memberNames = new Map<string, Map<string, string>>();
  async function nameOf(space: string, user: string): Promise<string> {
    if (user === me()) return 'You';
    let m = memberNames.get(space);
    if (!m || !m.has(user)) {
      m = new Map((await admin.members(space).catch(() => [])).map((x) => [x.user, x.displayName ?? 'Someone']));
      memberNames.set(space, m);
    }
    return m.get(user) ?? 'Someone';
  }

  let toastId = 0;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  /** A short message with an optional Undo, gone after 6 seconds (SPEC 6.5). */
  function showToast(message: string, undo?: () => Promise<void>) {
    clearTimeout(toastTimer);
    const id = ++toastId;
    app.toast = { id, message, undo };
    toastTimer = setTimeout(() => app.toast?.id === id && (app.toast = undefined), 6000);
  }
  const dismissToast = () => (app.toast = undefined);
  // a lingering toast would sit on top of the sheet's content
  const openAdd = (sheet: Sheet = {}) => {
    dismissToast();
    app.sheet = sheet;
  };
  const closeAdd = () => (app.sheet = undefined);
  /** Tiny confirmation buzz where the device supports it. */
  const buzz = () => void navigator.vibrate?.(10);

  // Spaces appear and disappear as joins and handoffs sync in: keep the screens' view of them current.
  const offEvents = admin.on((e) => {
    if (e.kind === 'member:changed') void refresh();
  });

  function stop() {
    stopSync?.();
    stopKids();
    stopNaps();
    stopReactions();
    stopReplies();
    stopToday?.();
    clearInterval(tick);
    clearTimeout(toastTimer);
    offEvents();
    removeApprover();
  }

  return { app, svc, api, logger, threads, photos, nameOf, role, me, refresh, go, back, home, start, stop, showToast, dismissToast, openAdd, closeAdd, buzz };
}

export type App = ReturnType<typeof createApp>;
