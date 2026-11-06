/**
 * Forget everything this device holds and start over as a brand-new device.
 *
 * A device that was signed out (revoked) can never be let back in under the same device key: the Spaces remember that key as
 * revoked. The only way back is a fresh identity, which is what a clean slate gives. This does what clearing the site's data
 * in the browser settings does, in one tap: local settings, every database, cached files and the service worker.
 */
export async function resetThisDevice(): Promise<void> {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* storage blocked: the databases below still go */
  }
  const settle = (p: Promise<unknown>, ms = 1500) => Promise.race([p.catch(() => undefined), new Promise((r) => setTimeout(r, ms))]);
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await settle(Promise.all(regs.map((r) => r.unregister())));
  } catch {
    /* no service worker */
  }
  try {
    const keys = (await globalThis.caches?.keys()) ?? [];
    await settle(Promise.all(keys.map((k) => caches.delete(k))));
  } catch {
    /* no cache storage */
  }
  try {
    const dbs = (await indexedDB.databases?.()) ?? [];
    // A database still open in this page is deleted once the page reloads and lets go of it, so do not wait on it.
    await settle(
      Promise.all(
        dbs.map(
          (db) =>
            new Promise<void>((resolve) => {
              if (!db.name) return resolve();
              const req = indexedDB.deleteDatabase(db.name);
              req.onsuccess = req.onerror = req.onblocked = () => resolve();
            }),
        ),
      ),
    );
  } catch {
    /* indexedDB.databases() is missing: nothing more can be listed */
  }
  location.replace(location.pathname + location.search);
}

export const RESET_WARNING =
  'Reset this device? It forgets this account and everything saved only on it. Nothing is lost for anyone else, and you can sign in again afterwards.';
