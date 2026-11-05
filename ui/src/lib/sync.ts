/** The sync pill (SPEC 6.8): ● Synced / ◐ Connecting / ○ Offline, with details a person can read. Pure. */
export interface SyncSnapshot {
  state: 'unsupported' | 'idle' | 'needs-pairing' | 'connecting' | 'ready' | 'error';
  detail?: string;
  url?: string;
  lastMessageAt?: number;
  connectedAt?: number;
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
  if (!online) return { dot: 'offline', icon: '○', label: 'Offline', lines: ['This device has no internet connection.', saved] };
  switch (s?.state) {
    case 'ready':
      return {
        dot: 'synced',
        icon: '●',
        label: 'Synced',
        lines: [`Connected to the relay${where}.`, s.lastMessageAt ? `Last update received ${ago(s.lastMessageAt, now)}.` : 'Nothing new has arrived since connecting.'],
      };
    case 'connecting':
      return { dot: 'syncing', icon: '◐', label: 'Connecting', lines: [`Reaching the relay${where}…`, saved] };
    case 'unsupported':
      return { dot: 'offline', icon: '○', label: 'Not syncing', lines: ['This browser cannot connect to the relay.', saved] };
    default:
      return {
        dot: 'offline',
        icon: '○',
        label: 'Offline',
        lines: [`Cannot reach the relay${where}${s?.detail ? `: ${s.detail}` : ''}. It will keep trying.`, saved],
      };
  }
}
