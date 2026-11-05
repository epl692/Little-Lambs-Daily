/**
 * Scanning an invite or device-link QR code with the camera (SPEC 4.3). The browser's own BarcodeDetector is used when there is one
 * (Chrome on Android); everything else (iPhone Safari, desktop) uses a small decoder loaded only when the scanner opens
 * (scripts/build-assets.mjs). Frames are decoded here, on the device; nothing is uploaded.
 */

export type Decoder = (data: Uint8ClampedArray, width: number, height: number) => string | undefined;

let decoder: Promise<Decoder> | undefined;

export function loadDecoder(): Promise<Decoder> {
  decoder ??= import(/* @vite-ignore */ new URL('public/qr-decode.js', document.baseURI).href).then((m: { decode: Decoder }) => m.decode).catch((e: unknown) => {
    decoder = undefined;
    throw new Error(`Could not load the QR reader (${e instanceof Error ? e.message : 'offline?'}).`);
  });
  return decoder;
}

/** Tests hand in their own decoder. */
export function useDecoder(d: Decoder): void {
  decoder = Promise.resolve(d);
}

export type Expect = 'invite' | 'link' | 'pairing';

/**
 * Is this what the screen is waiting for? An invite is a link that carries `#/join/…` (or the bare invite text); a device link starts
 * `sync-link:`. Anything else (a website, a menu) is ignored and the camera keeps looking.
 */
export function acceptable(text: string, expect: Expect): string | undefined {
  const t = text.trim();
  if (expect === 'link') return t.startsWith('sync-link:') ? t : undefined;
  if (expect === 'pairing') return t.startsWith('SP1.') ? t : undefined;
  return /#\/join\//.test(t) || /^sync-invite:/.test(t) ? t : undefined;
}

export interface ScanHandle {
  stop(): void;
}

export interface ScanOptions {
  video: HTMLVideoElement;
  expect: Expect;
  onFound(text: string): void;
  /** A QR code was seen but is not the right kind. */
  onWrong?(): void;
  /** Frames per second to try. */
  fps?: number;
}

/** Look at the playing video until the right code appears. */
export function scan(o: ScanOptions): ScanHandle {
  let alive = true;
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const Native = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(v: CanvasImageSource): Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
  const native = Native ? new Native({ formats: ['qr_code'] }) : undefined;
  const wait = 1000 / (o.fps ?? 8);

  async function look(): Promise<string | undefined> {
    const v = o.video;
    if (v.readyState < 2 || !v.videoWidth) return undefined;
    if (native) {
      try {
        const found = await native.detect(v);
        if (found[0]?.rawValue) return found[0].rawValue;
      } catch {
        // fall through to the decoder
      }
    }
    const scale = Math.min(1, 720 / v.videoWidth);
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    g.drawImage(v, 0, 0, canvas.width, canvas.height);
    const img = g.getImageData(0, 0, canvas.width, canvas.height);
    return (await loadDecoder())(img.data, img.width, img.height);
  }

  void (async () => {
    while (alive) {
      const text = await look().catch(() => undefined);
      if (!alive) return;
      if (text) {
        const ok = acceptable(text, o.expect);
        if (ok) return void o.onFound(ok);
        o.onWrong?.();
      }
      await new Promise((r) => setTimeout(r, wait));
    }
  })();

  return { stop: () => void (alive = false) };
}

/** What to tell someone when the camera cannot be used. */
export function cameraProblem(e: unknown): string {
  const name = (e as { name?: string } | undefined)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'The camera is blocked for this app. Allow it in your browser settings, or paste the link instead.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device. Paste the link instead.';
  if (name === 'NotReadableError') return 'The camera is busy in another app. Close it and try again, or paste the link instead.';
  return 'The camera could not be started. Paste the link instead.';
}
