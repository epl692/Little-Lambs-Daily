/**
 * SPEC 11 phase 10 on real browsers: the sync pill through a real offline/online cycle, a cold start with no network, and the
 * timeline performance budget (a day of 150 entries).
 */
import { expect, test } from '@playwright/test';
import { addFirstFamily, newPage, pairParent, setupProvider } from './helpers';

test('offline: the pill says so, entries are kept and sync on reconnect; a cold start offline still works', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('show-all').click();

  await expect(provider.getByTestId('sync-pill')).toContainText('Synced', { timeout: 30_000 });
  await expect(parent.getByTestId('sync-pill')).toContainText('Synced', { timeout: 30_000 });
  await provider.getByTestId('sync-pill').click();
  await expect(provider.getByTestId('sync-details')).toContainText('Connected to the relay');
  await provider.getByTestId('sync-pill').click();

  // airplane mode: log ten entries
  await provider.context().setOffline(true);
  await expect(provider.getByTestId('sync-pill')).toContainText('Offline');
  await provider.getByTestId('sync-pill').click();
  await expect(provider.getByTestId('sync-details')).toContainText('saved on this device');
  await provider.getByTestId('sync-pill').click();
  await provider.getByTestId('child-card').click();
  for (let i = 0; i < 10; i++) {
    await provider.getByTestId('add-fab').click();
    await provider.getByTestId('tile-diaper').click();
    await provider.getByTestId('diaper-wet').click();
    await expect(provider.getByTestId('tl-item')).toHaveCount(i + 1);
  }
  await expect(parent.getByTestId('tl-item')).toHaveCount(0); // nothing has left the device

  // cold start with no network: the app shell and every entry come from this device
  await provider.reload();
  await expect(provider.getByTestId('timeline-title')).toBeHidden(); // reload lands on the roster
  await provider.getByTestId('show-all').click();
  await expect(provider.getByTestId('sync-pill')).toContainText('Offline');
  await provider.getByTestId('child-card').click();
  await expect(provider.getByTestId('tl-item')).toHaveCount(10);

  // back online: the parent gets all ten
  await provider.getByRole('button', { name: /back/i }).click(); // the pill lives on the roster
  await provider.context().setOffline(false);
  await expect(provider.getByTestId('sync-pill')).toContainText('Synced', { timeout: 60_000 });
  await expect(parent.getByTestId('tl-item')).toHaveCount(10, { timeout: 60_000 });
});

test('performance: a day of 150 entries renders quickly and the add sheet opens quickly', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('show-all').click();

  await provider.evaluate(async () => {
    const ctx = window.__syncHost!.contextOf('daycare');
    const me = ctx.spaces.admin.session();
    const kid = (await ctx.data.query({ type: 'daycare.child' }).once())[0];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const at = (i: number) => base.getTime() + i * 5 * 60_000 + 60_000;
    const by = { child: kid.id, createdBy: me.user, createdByName: 'Miss Bri', createdByRole: 'provider' };
    const kinds = [
      { kind: 'diaper', diaper: 'wet' },
      { kind: 'bottle', bottleContents: 'formula', ozOffered: 4, ozFinished: 3 },
      { kind: 'providerNote', text: 'Played outside and read three books together' },
      { kind: 'meal', mealPeriod: 'lunch', served: 'Pasta and peas', amount: 'most' },
    ];
    for (let i = 0; i < 150; i++) await ctx.data.create(kid.space, 'daycare.entry', { ...by, ...kinds[i % kinds.length], at: at(i) });
  });

  // Start a clock at the real tap and note when elements appear (a MutationObserver sees them the moment they are in the page).
  const watch = (selector: string, counts: number[]) =>
    provider.evaluate(
      ({ selector, counts }) => {
        const w = window as unknown as { __marks: Record<number, number> };
        w.__marks = {};
        addEventListener(
          'pointerup',
          () => {
            const t0 = performance.now();
            new MutationObserver(() => {
              const c = document.querySelectorAll(selector).length;
              for (const k of counts) if (c >= k && w.__marks[k] === undefined) w.__marks[k] = performance.now() - t0;
            }).observe(document.body, { childList: true, subtree: true });
          },
          { capture: true, once: true },
        );
      },
      { selector, counts },
    );
  const marks = () => provider.evaluate(() => (window as unknown as { __marks: Record<number, number> }).__marks);

  await watch('[data-testid=tl-item]', [20, 150]);
  await provider.getByTestId('child-card').click();
  await expect(provider.getByTestId('tl-item')).toHaveCount(150);
  const t = await marks();
  console.log(`150-entry day: first 20 cards in ${Math.round(t[20]!)} ms, all 150 in ${Math.round(t[150]!)} ms`);
  // SPEC: under 100 ms on a mid-range phone. These are desktop numbers with headroom, to catch regressions.
  expect(t[20]!).toBeLessThan(100);
  expect(t[150]!).toBeLessThan(300);

  await watch('[data-testid=tile-diaper]', [1]);
  await provider.getByTestId('add-fab').click();
  await expect(provider.getByTestId('tile-diaper')).toBeVisible();
  const sheet = (await marks())[1]!;
  console.log(`add sheet opened in ${Math.round(sheet)} ms`);
  expect(sheet).toBeLessThan(100);
});

test('settings: the "since" reminder threshold is saved and the version is shown', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await provider.getByTestId('open-settings').click();
  await expect(provider.getByTestId('about')).toContainText('v0.10.0');
  await expect(provider.getByTestId('since-threshold')).toHaveValue('180');
  await provider.getByTestId('since-threshold').selectOption('60');
  await provider.reload();
  await provider.getByTestId('open-settings').click();
  await expect(provider.getByTestId('since-threshold')).toHaveValue('60');
  // parents do not get provider settings
  await provider.getByRole('button', { name: 'Back', exact: true }).click();
  await addFirstFamily(provider, 'Lee', 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');
  await parent.getByTestId('open-settings').click();
  await expect(parent.getByTestId('since-threshold')).toHaveCount(0);
  await expect(parent.getByTestId('about')).toContainText('v0.10.0');
});

test('photos posted offline reach the parent after reconnecting, thumbnails and full size', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('show-all').click();
  await expect(provider.getByTestId('sync-pill')).toContainText('Synced', { timeout: 30_000 });

  const picture = (shade: number) =>
    provider.evaluate(async (shade) => {
      const c = document.createElement('canvas');
      c.width = 1200;
      c.height = 800;
      const g = c.getContext('2d')!;
      g.fillStyle = `hsl(${shade}, 60%, 60%)`;
      g.fillRect(0, 0, 1200, 800);
      const buf = new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/jpeg', 0.9))).arrayBuffer());
      let s = '';
      for (const x of buf) s += String.fromCharCode(x);
      return btoa(s);
    }, shade);
  const shots = await Promise.all([20, 120, 220].map(async (h) => Buffer.from(await picture(h), 'base64')));

  await provider.context().setOffline(true); // airplane mode
  await expect(provider.getByTestId('sync-pill')).toContainText('Offline');
  await provider.getByTestId('quick-add').click();
  const [chooser] = await Promise.all([provider.waitForEvent('filechooser'), provider.getByTestId('tile-photo').click()]);
  await chooser.setFiles(shots.map((buffer, i) => ({ name: `offline-${i}.jpg`, mimeType: 'image/jpeg', buffer })));
  await expect(provider.getByTestId('photo-previews').locator('img')).toHaveCount(3, { timeout: 30_000 });
  await provider.getByTestId('details-save').click();
  await expect(provider.getByTestId('toast-text')).toContainText('Posted 3 photos', { timeout: 30_000 });
  await expect(parent.getByTestId('tl-item')).toHaveCount(0);

  await provider.context().setOffline(false);
  await expect(parent.getByTestId('photo-open')).toHaveCount(3, { timeout: 60_000 });
  await expect(parent.getByTestId('photo-grid').getByTestId('photo-img')).toHaveCount(3, { timeout: 120_000 });
  await parent.getByTestId('photo-open').first().click();
  await expect(parent.getByTestId('photo-viewer').getByTestId('photo-img')).toBeVisible({ timeout: 60_000 });
});
