/**
 * The ZIP library, loaded the first time someone exports or imports a backup (see scripts/build-zip.mjs). It is a separate
 * precached file, so it is available offline but costs nothing at startup.
 */
import type { strFromU8, unzipSync, zipSync } from 'fflate';

export interface ZipLib {
  zipSync: typeof zipSync;
  unzipSync: typeof unzipSync;
  strFromU8: typeof strFromU8;
}

let lib: Promise<ZipLib> | undefined;

export function loadZip(): Promise<ZipLib> {
  lib ??= import(/* @vite-ignore */ new URL('public/zip.js', document.baseURI).href).catch((e: unknown) => {
    lib = undefined; // try again next time rather than failing forever
    throw new Error(`Could not load the ZIP tool (${e instanceof Error ? e.message : 'offline?'}). Reload the app and try again.`);
  }) as Promise<ZipLib>;
  return lib;
}

/** Tests hand in the real library directly. */
export function useZip(l: ZipLib): void {
  lib = Promise.resolve(l);
}
