/**
 * Scanning a QR code with the camera. The camera is faked with a canvas stream that shows the QR code taken from the other device's
 * screen, so the whole path runs: video frames, decoding, accepting the right kind of code, filling in the form, joining.
 */
import { expect, test, type Browser, type Page } from './fixtures';
import { addFirstFamily, newPage, setupProvider } from './helpers';

/** Replace the camera with a canvas stream that draws whatever `window.__fakeQr` (an image URL) says. */
async function fakeCamera(page: Page, opts: { native: boolean; blocked?: boolean }) {
  await page.addInitScript(({ native, blocked }) => {
    if (!native) delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
    const md = navigator.mediaDevices ?? ((navigator as unknown as { mediaDevices: unknown }).mediaDevices = {});
    (md as { getUserMedia: unknown }).getUserMedia = async () => {
      if (blocked) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 480;
      const g = c.getContext('2d')!;
      const img = new Image();
      let shown = '';
      const draw = () => {
        const want = (window as unknown as { __fakeQr?: string }).__fakeQr ?? '';
        if (want !== shown) {
          shown = want;
          img.src = want;
        }
        g.fillStyle = '#7a7a7a';
        g.fillRect(0, 0, 640, 480);
        if (img.complete && img.naturalWidth) {
          g.fillStyle = '#fff';
          g.fillRect(110, 30, 420, 420);
          g.drawImage(img, 120, 40, 400, 400);
        }
        requestAnimationFrame(draw);
      };
      draw();
      return c.captureStream(15);
    };
  }, opts);
}

async function qrOf(page: Page, alt: string): Promise<string> {
  return page.getByRole('img', { name: alt }).getAttribute('src').then((s) => s!);
}
const showQr = (page: Page, src: string) => page.evaluate((s) => ((window as unknown as { __fakeQr: string }).__fakeQr = s), src);

async function inviteQr(provider: Page): Promise<string> {
  await provider.getByTestId('invite-parent').click();
  await expect(provider.getByTestId('invite-link')).toBeVisible();
  return qrOf(provider, 'Invite QR code');
}

const readers = [{ name: 'the app’s decoder (iPhone Safari, desktop)', native: false }, { name: 'the browser’s own detector (Chrome on Android)', native: true }];

for (const r of readers) {
  test(`a parent joins by scanning the invite QR code, using ${r.name}`, async ({ browser }) => {
    const provider = await newPage(browser);
    await setupProvider(provider);
    await addFirstFamily(provider, 'Lee', 'Ada');
    const qr = await inviteQr(provider);

    const parent = await newPage(browser);
    await fakeCamera(parent, { native: r.native });
    await parent.goto('/');
    test.skip(r.native && !(await parent.evaluate(() => 'BarcodeDetector' in window)), 'this browser has no native QR detector');
    await parent.getByTestId('have-invite').click();
    await parent.getByTestId('scan-qr').click();
    await expect(parent.getByTestId('qr-scanner')).toBeVisible();
    await expect(parent.getByTestId('scan-message')).toContainText('Point the camera');
    await showQr(parent, qr); // the other screen comes into view
    await expect(parent.getByTestId('qr-scanner')).toHaveCount(0, { timeout: 30_000 }); // it closed itself
    await expect(parent.getByTestId('invite-text')).toHaveValue(/#\/join\//);

    await parent.getByTestId('join-name').fill('Erin');
    await parent.getByTestId('join-submit').click();
    await provider.getByTestId('approve').click();
    await expect(parent.getByTestId('parent-title')).toBeVisible({ timeout: 60_000 });
  });
}

test('a device is linked by scanning its code; a code of the wrong kind is refused politely', async ({ browser }) => {
  const a = await newPage(browser);
  await setupProvider(a);
  await addFirstFamily(a, 'Lee', 'Ada');
  const inviteArt = await inviteQr(a);
  await a.getByTestId('invite-done').click();
  await a.getByRole('button', { name: /back/i }).click(); // roster
  await a.getByTestId('open-settings').click();
  await a.getByTestId('link-another').click();
  await expect(a.getByTestId('link-code')).toBeVisible();
  const linkArt = await qrOf(a, 'Device link code');

  const b = await newPage(browser);
  await fakeCamera(b, { native: false });
  await b.goto('/');
  await b.getByTestId('link-device').click();
  await b.getByTestId('scan-qr').click();
  await showQr(b, inviteArt); // an invite is not a device code
  await expect(b.getByTestId('scan-message')).toContainText('not the device code', { timeout: 20_000 });
  await expect(b.getByTestId('qr-scanner')).toBeVisible(); // still looking
  await showQr(b, linkArt);
  await expect(b.getByTestId('qr-scanner')).toHaveCount(0, { timeout: 30_000 });
  await expect(b.getByTestId('link-code-input')).toHaveValue(/^sync-link:/);
  await b.getByRole('button', { name: 'Link this device' }).click();
  await a.getByTestId('approve').click();
  await expect(b.getByTestId('show-all').or(b.getByTestId('child-card')).first()).toBeVisible({ timeout: 60_000 });
});

test('with the camera blocked the person is told, and can still paste the link', async ({ browser }: { browser: Browser }) => {
  const parent = await newPage(browser);
  await fakeCamera(parent, { native: false, blocked: true });
  await parent.goto('/');
  await parent.getByTestId('have-invite').click();
  await parent.getByTestId('scan-qr').click();
  await expect(parent.getByTestId('scan-message')).toContainText('camera is blocked');
  await expect(parent.getByTestId('scan-message')).toContainText('paste the link');
  await parent.getByTestId('scan-cancel').click();
  await expect(parent.getByTestId('qr-scanner')).toHaveCount(0);
  await parent.getByTestId('invite-text').fill('https://example.test/#/join/abc');
  await expect(parent.getByTestId('invite-text')).toHaveValue(/join\/abc/);
});
