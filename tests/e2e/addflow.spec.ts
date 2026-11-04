/**
 * SPEC 11.1 acceptance, phase 5: the add flow on two real browsers through a real relay.
 *  - a diaper in 3 taps from the roster (long-press card, Diaper, Wet), arriving on the parent's device
 *  - batch: 4 children, one meal, per-child amounts, one Undo removes all 4
 *  - naps: start for 2 children, the banner shows 2 timers, Wake all ends both
 * Plus parent permissions, edit, delete with undo.
 */
import { expect, test, type Page } from '@playwright/test';
import { addFirstFamily, newPage, pairParent, setupProvider, TOO_EARLY } from './helpers';

const addChild = async (p: Page, name: string, already: number) => {
  await p.getByPlaceholder('Add another child').fill(name);
  await p.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(p.getByTestId('child-row')).toHaveCount(already + 1);
};
const toRoster = (p: Page) => p.getByRole('button', { name: /back/i }).click();

/** Every entry on this device, straight from the dev host. */
const entries = (p: Page): Promise<Array<Record<string, any>>> =>
  p.evaluate(async () => {
    const ctx = window.__syncHost!.contextOf('daycare');
    return (await ctx.data.query({ type: 'daycare.entry' }).once()).map((o: any) => o.fields);
  });

async function longPress(p: Page, testid: string) {
  const box = (await p.getByTestId(testid).boundingBox())!;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(650);
  await p.mouse.up();
}

test('a diaper in 3 taps from the roster arrives on the parent’s device, and Undo takes it back', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');
  await toRoster(provider);

  await longPress(provider, 'child-card'); // tap 1 (long-press)
  await expect(provider.getByTestId('add-sheet')).toBeVisible();
  await provider.getByTestId('tile-diaper').click(); // tap 2 ("who" was skipped: the sheet was opened for Ada)
  await provider.getByTestId('diaper-wet').click(); // tap 3, saves immediately
  await expect(provider.getByTestId('add-sheet')).toHaveCount(0);
  await expect(provider.getByTestId('toast-text')).toHaveText('Logged diaper for Ada (wet)');

  await expect(parent.getByTestId('tl-label')).toHaveText(['Diaper']);
  await expect(parent.getByTestId('tl-summary')).toHaveText('💧 Wet');
  await expect(parent.getByTestId('tl-item')).toContainText('by Erin'.replace('Erin', 'Miss Bri'));
  // a care entry means the child is here
  await expect(provider.getByTestId('child-status')).toHaveText('Here today');

  await provider.getByTestId('toast-undo').click();
  await expect(parent.getByTestId('tl-item')).toHaveCount(0);
});

test('batch: one meal for four children with their own amounts, one Undo removes all four', async ({ browser }) => {
  const p = await newPage(browser);
  await setupProvider(p);
  await addFirstFamily(p, 'Lee', 'Ada');
  for (const [i, n] of ['Ben', 'Cy', 'Di'].entries()) await addChild(p, n, i + 1);
  await toRoster(p);
  await p.getByTestId('show-all').click();
  await expect(p.getByTestId('child-card')).toHaveCount(4);

  await p.getByTestId('add-fab').click();
  await p.getByTestId('tile-meal').click();
  for (const n of ['Ada', 'Ben', 'Cy', 'Di']) await p.getByTestId(`who-${n}`).click();
  await p.getByTestId('who-next').click();
  await p.getByTestId('served-input').fill('Mac & cheese');
  await p.getByTestId('amount-Ben-most').click();
  await p.getByTestId('amount-Cy-some').click();
  await p.getByTestId('amount-Di-none').click();
  await p.getByTestId('details-save').click();

  await expect(p.getByTestId('toast-text')).toHaveText('Logged for 4 kids');
  const rows = (await entries(p)).filter((e) => e.kind === 'meal');
  expect(rows).toHaveLength(4);
  expect(new Set(rows.map((e) => e.batchId)).size).toBe(1);
  expect(rows[0]!.batchId).toBeTruthy();
  expect(rows.every((e) => e.served === 'Mac & cheese')).toBe(true);
  expect(rows.map((e) => e.amount).sort()).toEqual(['all', 'most', 'none', 'some']);

  await p.getByTestId('toast-undo').click();
  await expect(p.getByTestId('toast-text')).toHaveText('Undone');
  expect((await entries(p)).filter((e) => e.kind === 'meal')).toHaveLength(0);
});

test('naps: start for two, the banner shows two timers, Wake all ends both; one child can wake alone, and Undo reopens', async ({ browser }) => {
  const p = await newPage(browser);
  await setupProvider(p);
  await addFirstFamily(p, 'Lee', 'Ada');
  await addChild(p, 'Ben', 1);
  await toRoster(p);
  await p.getByTestId('show-all').click();

  await p.getByTestId('add-fab').click();
  await p.getByTestId('tile-nap').click();
  await p.getByTestId('who-Ada').click();
  await p.getByTestId('who-Ben').click();
  await p.getByTestId('who-next').click();
  await expect(p.getByTestId('nap-mode-start')).toHaveAttribute('aria-pressed', 'true'); // Start is the default
  await p.getByTestId('details-save').click();

  await expect(p.getByTestId('nap-banner')).toBeVisible();
  await expect(p.getByTestId('asleep-timer')).toHaveCount(2);
  await expect(p.getByTestId('asleep-timer').first()).toHaveText(/^0:0\d$/);
  await expect(p.getByTestId('child-status').first()).toContainText('Napping');

  // wake one child with a single tap
  await p.getByTestId('asleep-Ada').click();
  await expect(p.getByTestId('toast-text')).toHaveText('Ada woke up');
  await expect(p.getByTestId('asleep-timer')).toHaveCount(1);
  await p.getByTestId('toast-undo').click(); // taking it back reopens the nap
  await expect(p.getByTestId('asleep-timer')).toHaveCount(2);

  await p.getByTestId('wake-all').click();
  await expect(p.getByTestId('nap-banner')).toHaveCount(0);
  const naps = (await entries(p)).filter((e) => e.kind === 'nap');
  expect(naps).toHaveLength(2);
  expect(naps.every((e) => typeof e.endAt === 'number' && e.endAt >= e.at)).toBe(true);
});

test('an open nap has a Woke up button on its card, and a past nap can be logged with start and end', async ({ browser }) => {
  test.skip(TOO_EARLY(), 'logs a nap at 1 AM today, so the clock must be past 6 AM');
  const p = await newPage(browser);
  await setupProvider(p);
  await addFirstFamily(p, 'Lee', 'Ada');
  await toRoster(p);
  await p.getByTestId('child-card').click();

  await p.getByTestId('add-fab').click(); // opened for Ada: "who" is skipped
  await p.getByTestId('tile-nap').click();
  await p.getByTestId('details-save').click(); // Start nap
  await expect(p.getByTestId('tl-time')).toContainText('– now');
  await p.getByTestId('wake').click();
  await expect(p.getByTestId('tl-time')).not.toContainText('now');
  await expect(p.getByTestId('wake')).toHaveCount(0);

  // a past nap: validation first
  const today = await p.evaluate(() => new Date().toLocaleDateString('en-CA'));
  await p.getByTestId('add-fab').click();
  await p.getByTestId('tile-nap').click();
  await p.getByTestId('nap-mode-past').click();
  await p.getByTestId('nap-start-input').fill(`${today}T01:00`);
  await p.getByTestId('details-save').click();
  await expect(p.getByTestId('sheet-error')).toContainText('Choose when the nap ended');
  await p.getByTestId('nap-end-input').fill(`${today}T00:30`);
  await p.getByTestId('details-save').click();
  await expect(p.getByTestId('sheet-error')).toContainText('cannot end before');
  await p.getByTestId('nap-end-input').fill(`${today}T02:30`);
  await p.getByTestId('details-save').click();
  await expect(p.getByTestId('tl-time').filter({ hasText: '1:00 AM – 2:30 AM · 1h 30m' })).toHaveCount(1);
});

test('bottle defaults to the last-used values, and a time can be backdated', async ({ browser }) => {
  test.skip(TOO_EARLY(), 'backdates to 1 AM today, so the clock must be past 6 AM');
  const p = await newPage(browser);
  await setupProvider(p);
  await addFirstFamily(p, 'Lee', 'Ada');
  await toRoster(p);
  await p.getByTestId('child-card').click();

  await p.getByTestId('add-fab').click();
  await p.getByTestId('tile-bottle').click();
  await expect(p.getByTestId('oz-offered-value')).toHaveText('4 oz'); // first-time default
  await p.getByTestId('contents-milk').click();
  await p.getByTestId('oz-offered-plus').click();
  await p.getByTestId('oz-offered-plus').click(); // 5
  // finished followed offered up to 5; three steps down by hand makes it 3.5, and it stays there
  for (let i = 0; i < 3; i++) await p.getByTestId('oz-finished-minus').click();
  await expect(p.getByTestId('oz-finished-value')).toHaveText('3.5 oz');
  await p.getByTestId('time-pill').click();
  const today = await p.evaluate(() => new Date().toLocaleDateString('en-CA'));
  await p.getByTestId('time-input').fill(`${today}T01:15`);
  await expect(p.getByTestId('time-pill')).toContainText('1:15 AM');
  await p.getByTestId('details-save').click();
  await expect(p.getByTestId('tl-time')).toHaveText('1:15 AM');
  await expect(p.getByTestId('tl-summary')).toHaveText('5 oz milk · finished 3.5 oz');

  // next time the same values are ready: + > Bottle > Save
  await p.getByTestId('add-fab').click();
  await p.getByTestId('tile-bottle').click();
  await expect(p.getByTestId('oz-offered-value')).toHaveText('5 oz');
  await expect(p.getByTestId('contents-milk')).toHaveAttribute('aria-pressed', 'true');
  await p.getByTestId('details-save').click();
  await expect(p.getByTestId('tl-item')).toHaveCount(2);
});

test('diaper extras, a note, edit and delete with undo', async ({ browser }) => {
  const p = await newPage(browser);
  await setupProvider(p);
  await addFirstFamily(p, 'Lee', 'Ada');
  await toRoster(p);
  await p.getByTestId('child-card').click();

  await p.getByTestId('add-fab').click();
  await p.getByTestId('tile-diaper').click();
  await p.getByTestId('diaper-more').click();
  await p.getByTestId('diaper-note-creamApplied').click();
  await p.getByTestId('diaper-both').click();
  await expect(p.getByTestId('tl-summary')).toHaveText('💧💩 Both · cream applied');

  await p.getByTestId('add-fab').click();
  await p.getByTestId('tile-note').click();
  await p.getByTestId('details-save').click();
  await expect(p.getByTestId('sheet-error')).toContainText('Write a note first');
  await p.getByTestId('note-text').fill('Loved the sensory table');
  await p.getByTestId('details-save').click();
  await expect(p.getByTestId('tl-item').first()).toContainText('Loved the sensory table');

  // edit
  await p.getByTestId('tl-item').first().getByTestId('entry-menu').click();
  await p.getByTestId('menu-edit').click();
  await p.getByTestId('note-text').fill('Loved the sensory table and the bubbles');
  await p.getByTestId('details-save').click();
  await expect(p.getByTestId('tl-item').first()).toContainText('and the bubbles');
  await expect(p.getByTestId('tl-item').first()).toContainText('edited');

  // delete, then undo
  p.once('dialog', (d) => void d.accept());
  await p.getByTestId('tl-item').first().getByTestId('entry-menu').click();
  await p.getByTestId('menu-delete').click();
  await expect(p.getByTestId('tl-item')).toHaveCount(1);
  await p.getByTestId('toast-undo').click();
  await expect(p.getByTestId('tl-item')).toHaveCount(2);
  await expect(p.getByTestId('tl-item').first()).toContainText('and the bubbles');
});

test('a parent can check in, post from home, delete their own and undo; and sees no provider kinds or menus on the provider’s entries', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');
  await toRoster(provider);
  await provider.getByTestId('child-card').click();
  await provider.getByTestId('add-fab').click();
  await provider.getByTestId('tile-diaper').click();
  await provider.getByTestId('diaper-dry').click();

  // the parent: only their own kinds, "who" skipped (one child), the relationship pre-filled
  await expect(parent.getByTestId('tl-item')).toHaveCount(1);
  await expect(parent.getByTestId('entry-menu')).toHaveCount(0); // not theirs
  await parent.getByTestId('add-fab').click();
  await expect(parent.locator('[data-testid^="tile-"]')).toHaveCount(4);
  for (const k of ['checkin', 'checkout', 'home', 'note']) await expect(parent.getByTestId(`tile-${k}`)).toBeVisible();
  for (const k of ['nap', 'bottle', 'meal', 'snack', 'diaper']) await expect(parent.getByTestId(`tile-${k}`)).toHaveCount(0);

  await parent.getByTestId('tile-checkin').click();
  await expect(parent.getByTestId('by-Mom')).toHaveAttribute('aria-pressed', 'true');
  await parent.getByTestId('details-save').click();
  await expect(parent.getByTestId('status-line')).toContainText('Checked in at');
  await expect(parent.getByTestId('status-line')).toContainText('by Mom');
  await expect(provider.getByTestId('status-line')).toContainText('by Mom'); // the provider sees it live

  await parent.getByTestId('add-fab').click();
  await parent.getByTestId('tile-home').click();
  await parent.getByTestId('home-slept').click();
  await parent.getByTestId('home-text').fill('Slept 10 hours');
  await parent.getByTestId('details-save').click();
  await expect(parent.getByTestId('tl-item').first()).toContainText('Slept');
  await expect(parent.getByTestId('tl-item').first()).toContainText('by Mom 🏡');
  await expect(provider.getByTestId('tl-item').first()).toContainText('Slept 10 hours');

  // delete own, undo
  parent.once('dialog', (d) => void d.accept());
  await parent.getByTestId('tl-item').first().getByTestId('entry-menu').click();
  await parent.getByTestId('menu-delete').click();
  await expect(parent.getByTestId('tl-item').filter({ hasText: 'Slept' })).toHaveCount(0);
  await expect(provider.getByTestId('tl-item').filter({ hasText: 'Slept' })).toHaveCount(0);
  await parent.getByTestId('toast-undo').click();
  await expect(parent.getByTestId('tl-item').filter({ hasText: 'Slept' })).toHaveCount(1);
  await expect(provider.getByTestId('tl-item').filter({ hasText: 'Slept' })).toHaveCount(1);
});
