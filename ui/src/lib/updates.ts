/**
 * "A new version is ready" (SPEC 11 phase 10). The service worker installs an update in the background and waits; the app
 * offers a Reload button instead of swapping versions under someone mid-entry. Takes the browser's service worker container, so
 * tests can hand in a fake.
 */
export interface WorkerLike {
  state: string;
  addEventListener(type: 'statechange', cb: () => void): void;
  postMessage(msg: unknown): void;
}
export interface RegistrationLike {
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  addEventListener(type: 'updatefound', cb: () => void): void;
}
export interface ContainerLike {
  controller?: unknown;
  getRegistration(): Promise<RegistrationLike | undefined>;
  addEventListener(type: 'controllerchange', cb: () => void): void;
}

/** Calls `onReady(apply)` when a newer version is waiting. `apply` switches to it and then calls `reload`. */
export function watchForUpdate(container: ContainerLike | undefined, onReady: (apply: () => void) => void, reload: () => void): void {
  if (!container) return;
  let applying = false;
  container.addEventListener('controllerchange', () => {
    if (applying) reload(); // only after the person asked: never reload on their own
  });
  void container
    .getRegistration()
    .then((reg) => {
      if (!reg) return;
      const apply = () => {
        applying = true;
        reg.waiting?.postMessage({ type: 'skipWaiting' });
      };
      // a first-ever install has no controller yet: that is "offline ready", not an update
      const announce = () => container.controller && reg.waiting && onReady(apply);
      announce();
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed') announce();
        });
      });
    })
    .catch(() => undefined);
}
