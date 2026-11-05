/**
 * SPEC 11 phase 9 on real browsers: the daily summary card (parent and provider, shared or downloaded), the attendance report
 * (CSV and a printable page per week, with days missing a check-out flagged), and the ZIP backup (parent scoped to their family).
 */
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { expect, test } from './fixtures';
import { addFirstFamily, newPage, pairParent, seedDay, setupProvider } from './helpers';

test('daily summary: on request for today, pinned on past days, and shared as text', async ({ browser }) => {
  const provider = await newPage(browser);
  await provider.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })); // exercise the download fallback
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  await seedDay(provider, 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');

  // today: a button, not shown until asked for
  await expect(parent.getByTestId('day-summary')).toHaveCount(0);
  await parent.getByTestId('summary-toggle').click();
  await expect(parent.getByTestId('sum-here')).toHaveText('1:02 AM');
  await expect(parent.getByTestId('sum-naps')).toHaveText('1h 35m');
  await expect(parent.getByTestId('sum-bottles')).toHaveText('1 · 3.5 oz finished');
  await expect(parent.getByTestId('sum-diapers')).toHaveText('1 wet · 0 soiled');
  await expect(parent.getByTestId('sum-food')).toContainText('Mac & cheese, peas');
  await parent.screenshot({ path: 'test-results/shots/day-summary.png' });
  await parent.getByTestId('summary-toggle').click();
  await expect(parent.getByTestId('day-summary')).toHaveCount(0);

  // the provider shares it: no share sheet here, so it is saved as a text file
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('show-all').click();
  await provider.getByTestId('child-card').click();
  await provider.getByTestId('summary-toggle').click();
  const [download] = await Promise.all([provider.waitForEvent('download'), provider.getByTestId('sum-share').click()]);
  expect(download.suggestedFilename()).toMatch(/^Ada-\d{4}-\d{2}-\d{2}\.txt$/);
  const text = readFileSync((await download.path())!, 'utf8');
  expect(text).toContain('Arrived 1:02 AM (dropped off by Mom)');
  expect(text).toContain('Bottles: 1 bottle, 3.5 oz finished');
  expect(text).toContain('Great morning! <b>not bold</b>'); // shown as text, never as markup
  await expect(provider.getByTestId('toast-text')).toHaveText('Summary saved to your downloads');

  // the same day as a picture: a real PNG, 1080 wide, with writing on it (not a blank page)
  const [pic] = await Promise.all([provider.waitForEvent('download'), provider.getByTestId('sum-picture').click()]);
  expect(pic.suggestedFilename()).toMatch(/^Ada-\d{4}-\d{2}-\d{2}\.png$/);
  await pic.saveAs('test-results/shots/summary.png');
  const png = readFileSync((await pic.path())!);
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(png.readUInt32BE(16)).toBe(1080); // width, from the PNG header
  expect(png.readUInt32BE(20)).toBeGreaterThan(400);
  const inked = await provider.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 120);
    const px = g.getImageData(0, 120, bmp.width, Math.min(bmp.height - 120, 500)).data;
    let dark = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i]! < 120 && px[i + 1]! < 120) dark++;
    return dark;
  }, png.toString('base64'));
  expect(inked).toBeGreaterThan(500); // there is text on it
  await expect(provider.getByTestId('toast-text')).toHaveText('Picture saved to your downloads');

  // yesterday has one lunch: its summary is pinned without asking
  await parent.getByRole('button', { name: /previous day/i }).click();
  await expect(parent.getByTestId('day-summary')).toBeVisible();
  await expect(parent.getByTestId('sum-food')).toContainText('Soup');
  await expect(parent.getByTestId('summary-toggle')).toHaveCount(0);
  // the day before that is empty: no card, just the empty message
  await parent.getByRole('button', { name: /previous day/i }).click();
  await expect(parent.getByTestId('day-summary')).toHaveCount(0);
});

test('attendance: rows, a flag for a missing check-out, CSV, and a printable page per week', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  await seedDay(provider, 'Ada'); // checked in at 1:02a, never checked out
  await provider.evaluate(async () => {
    const ctx = window.__syncHost!.contextOf('daycare');
    const me = ctx.spaces.admin.session();
    const kid = (await ctx.data.query({ type: 'daycare.child' }).once())[0];
    const b = new Date();
    const at = (h: number, m = 0) => new Date(b.getFullYear(), b.getMonth(), b.getDate() - 1, h, m).getTime();
    const base = { child: kid.id, createdBy: me.user, createdByName: 'Miss Bri', createdByRole: 'provider' };
    await ctx.data.create(kid.space, 'daycare.entry', { ...base, kind: 'checkin', at: at(8, 0), by: '=HYPERLINK("x")' });
    await ctx.data.create(kid.space, 'daycare.entry', { ...base, kind: 'checkout', at: at(17, 30), by: 'Dad' });
  });

  await provider.getByRole('button', { name: /back/i }).click(); // family -> roster
  await provider.getByTestId('open-settings').click();
  await provider.getByTestId('open-reports').click();
  await expect(provider.getByTestId('att-count')).toContainText('2 days · 1 flagged');
  const rows = provider.getByTestId('att-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('08:00');
  await expect(rows.first()).toContainText('9.5');
  await expect(rows.last()).toContainText('No check-out');

  const [csv] = await Promise.all([provider.waitForEvent('download'), provider.getByTestId('att-csv').click()]);
  expect(csv.suggestedFilename()).toMatch(/^attendance_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.csv$/);
  const body = readFileSync((await csv.path())!, 'utf8').replace(/^﻿/, '').split('\r\n');
  expect(body[0]).toBe('date,child,check_in,checked_in_by,check_out,picked_up_by,hours,flag');
  expect(body[1]).toContain(`,Ada,08:00,"'=HYPERLINK(""x"")",17:30,Dad,9.5,`); // a typed name can never run as a formula
  expect(body[2]).toContain(',Ada,01:02,Mom,,,,No check-out');

  // an empty range disables the downloads and says why
  await provider.getByTestId('att-from').fill('2030-01-02');
  await provider.getByTestId('att-to').fill('2030-01-01');
  await expect(provider.getByRole('alert')).toHaveText('The start date is after the end date.');
  await expect(provider.getByTestId('att-csv')).toBeDisabled();
  await provider.getByTestId('att-to').fill('2030-01-05');
  await expect(provider.getByTestId('att-count')).toHaveText('0 days');
  await expect(provider.getByTestId('att-csv')).toBeDisabled();
  await provider.getByTestId('att-from').fill('2020-01-01');
  await provider.getByTestId('att-to').fill(new Date().toISOString().slice(0, 10));
  await expect(provider.getByTestId('att-row').first()).toBeVisible();

  await provider.screenshot({ path: 'test-results/shots/attendance.png', fullPage: true });

  // print view: controls hidden, a page per week with a signature line
  await provider.emulateMedia({ media: 'print' });
  await expect(provider.getByTestId('att-csv')).toBeHidden();
  await expect(provider.getByTestId('att-week').first()).toContainText('Provider signature');
  await expect(provider.getByTestId('att-week').first()).toContainText('Attendance');
  await provider.emulateMedia({ media: 'screen' });
});

test('backup: a parent downloads only their family; a provider gets everyone, never the staff invites', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('manage-families').click();
  await provider.getByTestId('add-family').click();
  await provider.getByTestId('family-name').fill('Okafor');
  await provider.getByTestId('child-name').fill('Zuri');
  await provider.getByTestId('create-family').click();
  await expect(provider.getByTestId('child-row')).toHaveText('Zuri');
  await seedDay(provider, 'Ada');
  await seedDay(provider, 'Zuri');

  const zipOf = async (page: typeof provider) => {
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-all').click()]);
    return unzipSync(new Uint8Array(readFileSync((await d.path())!)));
  };

  await parent.getByTestId('open-settings').click();
  await expect(parent.getByTestId('open-reports')).toHaveText('Download your records');
  await parent.getByTestId('open-reports').click();
  await expect(parent.getByTestId('att-from')).toHaveCount(0); // attendance is the provider's
  const [d1] = await Promise.all([parent.waitForEvent('download'), parent.getByTestId('export-all').click()]);
  expect(d1.suggestedFilename()).toMatch(/^family-export_\d{4}-\d{2}-\d{2}\.zip$/);
  const mine = JSON.parse(strFromU8(unzipSync(new Uint8Array(readFileSync((await d1.path())!)))['data.json']!));
  expect(mine.schemaVersion).toBe(1);
  expect(mine.spaces.map((s: { name: string }) => s.name)).toEqual(['Lee Family']);
  expect(new Set(mine.objects.map((o: { space: string }) => o.space)).size).toBe(1);
  expect(mine.objects.filter((o: { type: string }) => o.type === 'daycare.entry')).toHaveLength(7); // Ada's seeded days, nothing of Zuri's
  await expect(parent.getByTestId('export-done')).toContainText('Saved');

  await provider.getByRole('button', { name: /back/i }).click(); // families
  await provider.getByRole('button', { name: /back/i }).click(); // roster
  await provider.getByTestId('open-settings').click();
  await provider.getByTestId('open-reports').click();
  const all = JSON.parse(strFromU8((await zipOf(provider))['data.json']!));
  expect(all.spaces).toHaveLength(2);
  const types = new Set(all.objects.map((o: { type: string }) => o.type));
  expect(types.has('daycare.staffInvite')).toBe(false);
  expect(types.has('daycare.settings')).toBe(false);
  expect(all.objects.filter((o: { type: string }) => o.type === 'daycare.entry')).toHaveLength(14);
});

test('restore: a backup rebuilds the daycare on a fresh device, photos included, and a second run adds nothing', async ({ browser }, testInfo) => {
  // the original daycare: a family, a seeded day, and a real photo
  const a = await newPage(browser);
  await setupProvider(a);
  await addFirstFamily(a, 'Lee', 'Ada');
  await seedDay(a, 'Ada');
  await a.getByRole('button', { name: 'Back', exact: true }).click();
  await a.getByTestId('show-all').click();
  const jpeg = Buffer.from(
    await a.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 900;
      c.height = 600;
      c.getContext('2d')!.fillRect(0, 0, 900, 600);
      const buf = new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/jpeg', 0.9))).arrayBuffer());
      return btoa(String.fromCharCode(...buf));
    }),
    'base64',
  );
  await a.getByTestId('quick-add').click();
  const [chooser] = await Promise.all([a.waitForEvent('filechooser'), a.getByTestId('tile-photo').click()]);
  await chooser.setFiles([{ name: 'nap-time.jpg', mimeType: 'image/jpeg', buffer: jpeg }]);
  await expect(a.getByTestId('photo-previews').locator('img')).toHaveCount(1, { timeout: 30_000 });
  await a.getByTestId('details-save').click();
  await expect(a.getByTestId('toast-text')).toContainText('Posted a photo', { timeout: 20_000 });
  await a.getByTestId('open-settings').click();
  await a.getByTestId('open-reports').click();
  await a.getByTestId('export-photos').check();
  const [dl] = await Promise.all([a.waitForEvent('download'), a.getByTestId('export-all').click()]);
  const zipPath = testInfo.outputPath('backup.zip');
  await dl.saveAs(zipPath);
  await expect(a.getByTestId('export-done')).toContainText('1 photos');

  // a brand new daycare on a new device
  const b = await newPage(browser);
  await setupProvider(b, 'Miss Dee');
  await b.getByTestId('open-settings').click();
  await b.getByTestId('open-reports').click();

  // not a backup: a clear message, nothing changes
  await b.getByTestId('restore-file').setInputFiles({ name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from('this is not a zip') });
  await expect(b.getByTestId('restore-error')).toContainText('could not be opened');

  await b.getByTestId('restore-file').setInputFiles(zipPath);
  await expect(b.getByTestId('restore-family')).toContainText('Lee Family (will be created): 1 of 1 children, 8 of 8 entries');
  await b.getByTestId('restore-go').click();
  await expect(b.getByTestId('restore-done')).toContainText('Restored 1 children, 8 entries, 0 replies and 1 photos; created Lee', { timeout: 60_000 });
  await expect(b.getByTestId('restore-done')).not.toContainText('could not be restored');

  // the data is really there, written under the restoring provider
  await b.getByRole('button', { name: 'Back', exact: true }).click(); // settings
  await b.getByRole('button', { name: 'Back', exact: true }).click(); // roster
  await b.getByTestId('show-all').click();
  await b.getByTestId('child-card').click();
  await expect(b.getByTestId('timeline-title')).toHaveText('Ada');
  await expect(b.getByTestId('tl-item')).toHaveCount(7);
  await expect(b.getByTestId('tl-item').filter({ hasText: 'Great morning!' })).toHaveCount(1);
  const thumb = b.getByTestId('photo-grid').getByTestId('photo-img');
  await expect(thumb).toBeVisible({ timeout: 30_000 });
  expect(await thumb.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(480); // a fresh thumbnail was made
  await b.getByTestId('photo-open').click();
  await expect(b.getByTestId('photo-viewer').getByTestId('photo-img')).toBeVisible({ timeout: 30_000 });
  await b.getByTestId('viewer-close').click();
  await b.getByRole('button', { name: 'Back', exact: true }).click(); // roster
  await b.getByTestId('open-settings').click();
  await b.getByTestId('open-reports').click();

  // again: nothing to add
  await b.getByTestId('restore-file').setInputFiles(zipPath);
  await expect(b.getByTestId('restore-family')).toContainText('(already here): 0 of 1 children, 0 of 8 entries');
  await b.getByTestId('restore-go').click();
  await expect(b.getByTestId('restore-done')).toContainText('Restored 0 children, 0 entries, 0 replies and 0 photos; 9 were already here');
});

test('restore is the provider’s: a parent has no restore option', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');
  await parent.getByTestId('open-settings').click();
  await parent.getByTestId('open-reports').click();
  await expect(parent.getByTestId('restore-file')).toHaveCount(0);
  await expect(parent.getByTestId('export-all')).toBeVisible();
});
