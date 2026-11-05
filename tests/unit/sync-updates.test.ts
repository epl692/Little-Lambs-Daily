import { describe, expect, it, vi } from 'vitest';
import { ago, describeSync } from '../../ui/src/lib/sync';
import { watchForUpdate, type ContainerLike, type RegistrationLike, type WorkerLike } from '../../ui/src/lib/updates';

describe('sync pill', () => {
  const now = 1_000_000;
  it('is synced when the relay is connected, and says when it last heard', () => {
    const v = describeSync({ state: 'ready', url: 'wss://relay.example.com', lastMessageAt: now - 120_000 }, true, now);
    expect(v).toMatchObject({ dot: 'synced', label: 'Synced', icon: '●' });
    expect(v.lines.join(' ')).toContain('relay.example.com');
    expect(v.lines.join(' ')).toContain('2 minutes ago');
  });
  it('is offline without internet, whatever the relay says, and reassures that nothing is lost', () => {
    const v = describeSync({ state: 'ready' }, false, now);
    expect(v).toMatchObject({ dot: 'offline', label: 'Offline', icon: '○' });
    expect(v.lines.join(' ')).toContain('saved on this device');
  });
  it('connecting, errors and unsupported browsers each say something different', () => {
    expect(describeSync({ state: 'connecting' }, true, now)).toMatchObject({ dot: 'syncing', label: 'Connecting', icon: '◐' });
    const err = describeSync({ state: 'error', detail: 'refused' }, true, now);
    expect(err.dot).toBe('offline');
    expect(err.lines[0]).toContain('refused');
    expect(describeSync({ state: 'unsupported' }, true, now).label).toBe('Not syncing');
    expect(describeSync(undefined, true, now).dot).toBe('offline');
  });
  it('counts changes still on their way: syncing (n) while connected, and "only on this device" while not', () => {
    const syncing = describeSync({ state: 'ready', unconfirmed: 3 }, true, now);
    expect(syncing).toMatchObject({ dot: 'syncing', label: 'Syncing (3)', icon: '◐' });
    expect(describeSync({ state: 'ready', unconfirmed: 1 }, true, now).lines.join(' ')).toContain('1 change to the relay');
    expect(describeSync({ state: 'ready', unconfirmed: 0 }, true, now).label).toBe('Synced');
    const off = describeSync({ state: 'ready', unconfirmed: 2 }, false, now);
    expect(off.label).toBe('Offline');
    expect(off.lines.join(' ')).toContain('2 changes are saved only on this device');
    expect(describeSync({ state: 'error', unconfirmed: 1 }, true, now).lines.join(' ')).toContain('1 change is saved only on this device');
  });
  it('nearby devices count: synced (direct) when the relay is out of reach, syncing while changes are still unconfirmed', () => {
    expect(describeSync({ state: 'error', direct: 1 }, true, now)).toMatchObject({ dot: 'synced', label: 'Synced (direct)' });
    expect(describeSync({ state: 'connecting', direct: 2 }, false, now).lines.join(' ')).toContain('2 nearby devices');
    expect(describeSync({ state: 'error', direct: 1, unconfirmed: 4 }, true, now).label).toBe('Syncing (4)');
    // with the relay up, a nearby device is a bonus line, not a different status
    const both = describeSync({ state: 'ready', direct: 1 }, true, now);
    expect(both.label).toBe('Synced');
    expect(both.lines.join(' ')).toContain('1 nearby device');
  });
  it('words times plainly', () => {
    expect(ago(1000, 1500)).toBe('just now');
    expect(ago(0, 30_000)).toBe('30 seconds ago');
    expect(ago(0, 60_000)).toBe('1 minute ago');
    expect(ago(0, 3 * 3_600_000)).toBe('3 hours ago');
  });
});

describe('update banner logic', () => {
  function fake(opts: { controller?: boolean; waiting?: boolean } = {}) {
    const worker: WorkerLike & { fire(): void } = {
      state: 'installing',
      postMessage: vi.fn(),
      addEventListener: (_t, cb) => ((worker as any).cb = cb),
      fire: () => (worker as any).cb(),
    };
    let found: () => void = () => undefined;
    const reg: RegistrationLike = {
      waiting: opts.waiting ? worker : null,
      installing: null,
      addEventListener: (_t, cb) => (found = cb),
    };
    let changed: () => void = () => undefined;
    const container: ContainerLike = {
      controller: opts.controller === false ? undefined : {},
      getRegistration: async () => reg,
      addEventListener: (_t, cb) => (changed = cb),
    };
    return { container, reg, worker, found: () => found(), changed: () => changed() };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('offers an update that is already waiting, and applying it asks the worker to take over, then reloads', async () => {
    const f = fake({ waiting: true });
    const ready = vi.fn();
    const reload = vi.fn();
    watchForUpdate(f.container, ready, reload);
    await tick();
    expect(ready).toHaveBeenCalledTimes(1);
    f.changed(); // some other tab updated: do not reload on our own
    expect(reload).not.toHaveBeenCalled();
    ready.mock.calls[0]![0]();
    expect(f.worker.postMessage).toHaveBeenCalledWith({ type: 'skipWaiting' });
    f.changed();
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('offers an update that finishes installing later', async () => {
    const f = fake();
    const ready = vi.fn();
    watchForUpdate(f.container, ready, vi.fn());
    await tick();
    expect(ready).not.toHaveBeenCalled();
    f.reg.installing = f.worker;
    f.found();
    f.reg.waiting = f.worker;
    f.worker.state = 'installed';
    f.worker.fire();
    expect(ready).toHaveBeenCalledTimes(1);
  });
  it('a first install is not an update (no controller yet), and no service worker is fine', async () => {
    const f = fake({ waiting: true, controller: false });
    const ready = vi.fn();
    watchForUpdate(f.container, ready, vi.fn());
    await tick();
    expect(ready).not.toHaveBeenCalled();
    expect(() => watchForUpdate(undefined, ready, vi.fn())).not.toThrow();
  });
});
