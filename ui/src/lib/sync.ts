/** The sync pill (SPEC 6.8): ● Synced / ◐ Connecting / ○ Offline, with details a person can read. Pure. */
export interface SyncSnapshot {
  state: 'unsupported' | 'idle' | 'needs-pairing' | 'connecting' | 'ready' | 'error';
  detail?: string;
  url?: string;
  lastMessageAt?: number;
  connectedAt?: number;
  /** Devices connected straight to this one, with no relay. */
  direct?: number;
  /** Changes written here that nothing has confirmed yet. */
  unconfirmed?: number;
}
export interface SyncSource {
  get(): SyncSnapshot;
  subscribe(cb: (s: SyncSnapshot) => void): () => void;
}

export type Dot = 'synced' | 'syncing' | 'offline';
export interface SyncView {
  dot: Dot;
  icon: string;
  label: string;
  /** Plain-language lines for the details sheet. */
  lines: string[];
}

export function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? '' : 's'} ago`;
}

export function describeSync(s: SyncSnapshot | undefined, online: boolean, now: number): SyncView {
  const where = s?.url ? ` (${s.url.replace(/^wss?:\/\//, '')})` : '';
  const saved = 'Everything you do is saved on this device and will sync when a connection is back.';
  const direct = s?.direct ?? 0;
  const waiting = s?.unconfirmed ?? 0;
  const waitingLine = `${waiting} change${waiting === 1 ? ' is' : 's are'} saved only on this device so far.`;
  const viaRelay = online && s?.state === 'ready';
  if (direct > 0 && !viaRelay) {
    return { dot: waiting > 0 ? 'syncing' : 'synced', icon: waiting > 0 ? '◐' : '●', label: waiting > 0 ? `Syncing (${waiting})` : 'Synced (direct)', lines: [`Connected straight to ${direct} nearby device${direct === 1 ? '' : 's'}, with no relay.`, online ? 'The relay cannot be reached right now.' : 'There is no internet connection.', 'Changes reach those devices; others get them when the relay is back.'] };
  }
  if (!online) return { dot: 'offline', icon: '○', label: 'Offline', lines: ['This device has no internet connection.', ...(waiting ? [waitingLine] : []), saved] };
  switch (s?.state) {
    case 'ready':
      if (waiting > 0) return { dot: 'syncing', icon: '◐', label: `Syncing (${waiting})`, lines: [`Sending ${waiting} change${waiting === 1 ? '' : 's'} to the relay${where}…`, 'You can keep working; this finishes by itself.'] };
      return {
        dot: 'synced',
        icon: '●',
        label: 'Synced',
        lines: [`Connected to the relay${where}.`, s.lastMessageAt ? `Last update received ${ago(s.lastMessageAt, now)}.` : 'Nothing new has arrived since connecting.', ...(direct > 0 ? [`Also connected straight to ${direct} nearby device${direct === 1 ? '' : 's'}.`] : [])],
      };
    case 'connecting':
      return { dot: 'syncing', icon: '◐', label: 'Connecting', lines: [`Reaching the relay${where}…`, ...(waiting ? [waitingLine] : []), saved] };
    case 'unsupported':
      return { dot: 'offline', icon: '○', label: 'Not syncing', lines: ['This browser cannot connect to the relay.', saved] };
    default:
      return {
        dot: 'offline',
        icon: '○',
        label: 'Offline',
        lines: [`Cannot reach the relay${where}${s?.detail ? `: ${s.detail}` : ''}. It will keep trying.`, ...(waiting ? [waitingLine] : []), saved],
      };
  }
}
