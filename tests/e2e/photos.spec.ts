/**
 * SPEC 11 phase 7 acceptance on two real browsers through a real relay: a provider posts photos tagged to children of two
 * families; they are shrunk to 2048px and stripped of EXIF/GPS; a parent sees thumbnails and the full image; the other
 * family's parent never gets them.
 */
import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { expect, test, type Page } from '@playwright/test';
import { addFirstFamily, newPage, pairParent, setupProvider } from './helpers';

/** A real 3000x2000 JPEG with a fake EXIF segment (including a GPS tag name) spliced in after the start marker. */
async function jpegWithGps(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 3000;
    c.height = 2000;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e07a5f';
    g.fillRect(0, 0, 3000, 2000);
    g.fillStyle = '#3d405b';
    g.fillRect(0, 0, 1500, 2000);
    const jpeg = new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9))).arrayBuffer());
    const payload = new TextEncoder().encode('Exif\0\0MM GPSLatitude 42.1234 GPSLongitude -84.5678 Make=SecretPhone');
    const seg = new Uint8Array(4 + payload.length);
    seg.set([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]);
    seg.set(payload, 4);
    const out = new Uint8Array(jpeg.length + seg.length);
    out.set(jpeg.slice(0, 2));
    out.set(seg, 2);
    out.set(jpeg.slice(2), 2 + seg.length);
    let s = '';
    for (const x of out) s += String.fromCharCode(x);
    return btoa(s);
  });
  return Buffer.from(b64, 'base64');
}

test('photos: shrunk, stripped, shared to two families, seen by one parent in full', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');
  // a second family the parent is not part of
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('manage-families').click();
  await provider.getByTestId('add-family').click();
  await provider.getByTestId('family-name').fill('Okafor');
  await provider.getByTestId('child-name').fill('Zuri');
  await provider.getByTestId('create-family').click();
  await expect(provider.getByTestId('child-row')).toHaveText('Zuri');
  await provider.getByRole('button', { name: /back/i }).click(); // families
  await provider.getByRole('button', { name: /back/i }).click(); // roster
  await provider.getByTestId('show-all').click();

  const source = await jpegWithGps(provider);
  expect(source.includes(Buffer.from('GPSLatitude'))).toBe(true);

  // + -> Photo opens the picker first
  await provider.getByTestId('add-fab').click();
  const [chooser] = await Promise.all([provider.waitForEvent('filechooser'), provider.getByTestId('tile-photo').click()]);
  await chooser.setFiles([{ name: 'IMG_0042.jpg', mimeType: 'image/jpeg', buffer: source }]);
  await expect(provider.getByTestId('who-Ada')).toBeVisible({ timeout: 20_000 }); // then who

  await provider.getByTestId('who-Ada').click();
  await expect(provider.getByTestId('families-warning')).toHaveCount(0);
  await provider.getByTestId('who-Zuri').click();
  await provider.getByTestId('who-next').click();
  await expect(provider.getByTestId('photo-previews').locator('img')).toHaveCount(1);
  await expect(provider.getByTestId('families-warning')).toHaveText('Visible to 2 families');
  await provider.getByTestId('photo-caption').fill('Finger painting 🎨');
  await provider.getByTestId('details-save').click();
  await expect(provider.getByTestId('toast-text')).toHaveText('Posted for 2 kids', { timeout: 20_000 });

  // the stored full image: at most 2048 on the long edge, still a JPEG, and no metadata left
  const stored = await provider.evaluate(async () => {
    const ctx = window.__syncHost!.contextOf('daycare');
    const rows = (await ctx.data.query({ type: 'daycare.entry' }).once()).filter((o: any) => o.fields.kind === 'photo');
    const ref = rows[0].fields.photos[0];
    const blob: Blob = await ctx.blobs.toBlob(ref);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let text = '';
    for (const x of bytes) text += String.fromCharCode(x);
    const bmp = await createImageBitmap(blob);
    const thumbRef = rows[0].fields.thumbs[0];
    const thumb = await createImageBitmap(await ctx.blobs.toBlob(thumbRef));
    return {
      entries: rows.length,
      type: blob.type,
      w: bmp.width,
      h: bmp.height,
      tw: thumb.width,
      th: thumb.height,
      hasExif: text.includes('Exif') || text.includes('GPS') || text.includes('SecretPhone'),
      caption: rows[0].fields.text,
    };
  });
  expect(stored.entries).toBe(2); // one per child
  expect(stored.type).toBe('image/jpeg');
  expect([stored.w, stored.h]).toEqual([2048, 1365]);
  expect(Math.max(stored.tw, stored.th)).toBe(480);
  expect(stored.hasExif).toBe(false);
  expect(stored.caption).toBe('Finger painting 🎨');

  // Ada's parent gets one photo entry: thumbnail first, full image on tap
  await expect(parent.getByTestId('tl-label')).toHaveText(['Photo']);
  await expect(parent.getByTestId('tl-summary')).toHaveText('1 photo');
  const thumb = parent.getByTestId('photo-grid').getByTestId('photo-img');
  await expect(thumb).toBeVisible({ timeout: 30_000 });
  expect(await thumb.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(480);
  await parent.getByTestId('photo-open').click();
  const full = parent.getByTestId('photo-viewer').getByTestId('photo-img');
  await expect(full).toBeVisible({ timeout: 30_000 });
  expect(await full.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(2048);
  await expect(parent.getByTestId('viewer-save')).toHaveAttribute('download', 'IMG_0042.jpg');
  await expect(parent.getByTestId('viewer-prev')).toHaveCount(0); // a single photo has no arrows
  await parent.screenshot({ path: 'test-results/shots/photo-viewer.png' });
  await parent.keyboard.press('Escape');
  await expect(parent.getByTestId('photo-viewer')).toHaveCount(0);

  // the caption and reactions work on a photo like any card; the parent has no Photo tile
  await expect(parent.getByText('Finger painting 🎨')).toBeVisible();
  await parent.getByTestId('add-fab').click();
  await expect(parent.getByTestId('tile-photo')).toHaveCount(0);
  await parent.getByTestId('sheet-close').click();

  // the second family's entry exists on the provider only (the parent is not in that Space)
  expect(await parent.evaluate(async () => (await window.__syncHost!.contextOf('daycare').data.query({ type: 'daycare.entry' }).once()).length)).toBe(1);

  // Undo takes both entries away
  await provider.getByTestId('toast-undo').click();
  await expect(parent.getByTestId('tl-item')).toHaveCount(0);
});

test('several photos: a grid, the viewer swipes between them, and one can be removed before saving', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('show-all').click();
  const source = await jpegWithGps(provider);

  await provider.getByTestId('quick-add').click();
  const [chooser] = await Promise.all([provider.waitForEvent('filechooser'), provider.getByTestId('tile-photo').click()]);
  await chooser.setFiles([1, 2, 3].map((n) => ({ name: `p${n}.jpg`, mimeType: 'image/jpeg', buffer: source })));
  await expect(provider.getByTestId('photo-previews').locator('img')).toHaveCount(3, { timeout: 30_000 });
  await provider.getByTestId('photo-remove').first().click();
  await expect(provider.getByTestId('photo-previews').locator('img')).toHaveCount(2);
  await provider.getByTestId('details-save').click();
  await expect(provider.getByTestId('toast-text')).toHaveText('Posted 2 photos of Ada', { timeout: 20_000 });

  await provider.getByTestId('child-card').click();
  await expect(provider.getByTestId('photo-open')).toHaveCount(2);
  await expect(provider.getByTestId('photo-grid').getByTestId('photo-img')).toHaveCount(2, { timeout: 30_000 });
  await provider.screenshot({ path: 'test-results/shots/photo-grid.png' });
  await provider.getByTestId('photo-open').nth(0).click();
  await expect(provider.getByTestId('photo-viewer')).toContainText('1 / 2');
  await provider.getByTestId('viewer-next').click();
  await expect(provider.getByTestId('photo-viewer')).toContainText('2 / 2');
  await provider.getByTestId('viewer-next').click(); // wraps
  await expect(provider.getByTestId('photo-viewer')).toContainText('1 / 2');
  await provider.getByTestId('viewer-close').click();
  await expect(provider.getByTestId('photo-viewer')).toHaveCount(0);
});

test('the backup ZIP includes full-size photos, named by child and time', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('show-all').click();
  const source = await jpegWithGps(provider);
  await provider.getByTestId('quick-add').click();
  const [chooser] = await Promise.all([provider.waitForEvent('filechooser'), provider.getByTestId('tile-photo').click()]);
  await chooser.setFiles([1, 2].map((n) => ({ name: `p${n}.jpg`, mimeType: 'image/jpeg', buffer: source })));
  await expect(provider.getByTestId('photo-previews').locator('img')).toHaveCount(2, { timeout: 30_000 });
  await provider.getByTestId('details-save').click();
  await expect(provider.getByTestId('toast-text')).toHaveText('Posted 2 photos of Ada', { timeout: 20_000 });

  await provider.getByTestId('open-settings').click();
  await provider.getByTestId('open-reports').click();
  await provider.getByTestId('export-photos').check();
  const [d] = await Promise.all([provider.waitForEvent('download'), provider.getByTestId('export-all').click()]);
  const files = unzipSync(new Uint8Array(readFileSync((await d.path())!)));
  const photos = Object.keys(files).filter((k) => k.startsWith('photos/Ada/'));
  expect(photos).toHaveLength(2);
  for (const p of photos) expect([...files[p]!.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]); // a real JPEG
  expect(JSON.parse(strFromU8(files['data.json']!)).missingPhotos).toBeUndefined();
  await expect(provider.getByTestId('export-done')).toHaveText('Saved 2 records and 2 photos.');
});
