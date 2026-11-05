/**
 * Who can get in, and cutting them off: a provider removes a parent, signs out a linked device, removes another provider.
 * Real browsers, real relay: the person removed must actually stop getting data.
 */
import { expect, test } from './fixtures';
import { addFirstFamily, newPage, pairParent, setupProvider } from './helpers';

test('a provider removes a parent: their phone loses the family at once and stops getting new days', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');
  await expect(parent.getByTestId('child-profile-link')).toBeVisible();

  await expect(provider.getByTestId('parent-row')).toHaveText('Erin (Mom)');
  provider.once('dialog', (d) => {
    expect(d.message()).toContain('Erin (Mom)');
    void d.accept();
  });
  await provider.getByTestId('remove-parent').click();
  await expect(provider.getByTestId('parent-row')).toHaveCount(0);
  await expect(parent.getByTestId('im-provider')).toBeVisible({ timeout: 30_000 }); // back at the welcome screen

  // new entries no longer reach that phone
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('show-all').click();
  await provider.getByTestId('child-card').click();
  await provider.getByTestId('add-fab').click();
  await provider.getByTestId('tile-diaper').click();
  await provider.getByTestId('diaper-wet').click();
  await expect(provider.getByTestId('tl-item')).toHaveCount(1);
  await parent.waitForTimeout(3000);
  expect(await parent.evaluate(async () => (await window.__syncHost!.contextOf('daycare').data.query({ type: 'daycare.entry' }).once()).length)).toBe(0);
});

test('a linked device can be signed out from another of your devices', async ({ browser }) => {
  const a = await newPage(browser);
  await setupProvider(a, 'Miss Bri');
  await addFirstFamily(a, 'Lee', 'Ada');
  await a.getByRole('button', { name: /back/i }).click();

  // device B joins the same account
  await a.getByTestId('open-settings').click();
  await expect(a.getByTestId('my-device')).toHaveCount(1);
  await expect(a.getByTestId('my-device')).toContainText('(this one)');
  await expect(a.getByTestId('revoke-device')).toHaveCount(0); // never offered for the device you are holding
  await a.getByTestId('link-another').click();
  const code = await a.getByTestId('link-code').inputValue();
  const b = await newPage(browser);
  await b.goto('/');
  await b.getByTestId('link-device').click();
  await b.getByTestId('link-code-input').fill(code);
  await b.getByRole('button', { name: 'Link this device' }).click();
  await a.getByTestId('approve').click();
  await expect(b.getByTestId('show-all').or(b.getByTestId('child-card')).first()).toBeVisible({ timeout: 60_000 });

  await a.getByRole('button', { name: 'Done' }).click();
  await expect(a.getByTestId('my-device')).toHaveCount(2, { timeout: 20_000 });
  a.once('dialog', (d) => void d.accept());
  await a.getByTestId('revoke-device').click();
  await expect(a.getByTestId('my-device')).toHaveCount(1);

  // what B had it keeps, but it gets nothing new
  await a.getByRole('button', { name: 'Back', exact: true }).click();
  await a.getByTestId('show-all').click();
  await a.getByTestId('child-card').click();
  await a.getByTestId('add-fab').click();
  await a.getByTestId('tile-diaper').click();
  await a.getByTestId('diaper-wet').click();
  await expect(a.getByTestId('tl-item')).toHaveCount(1);
  await b.waitForTimeout(3000);
  expect(await b.evaluate(async () => (await window.__syncHost!.contextOf('daycare').data.query({ type: 'daycare.entry' }).once()).length)).toBe(0);
});

test('a provider can remove another provider, who then loses every family', async ({ browser }) => {
  const a = await newPage(browser);
  await setupProvider(a, 'Miss Bri');
  await addFirstFamily(a, 'Lee', 'Ada');
  await a.getByRole('button', { name: /back/i }).click();
  await a.getByTestId('open-settings').click();
  await expect(a.getByTestId('remove-provider')).toHaveCount(0); // nobody else yet, and never yourself
  await a.getByTestId('invite-provider').click();
  const link = await a.getByTestId('invite-link').inputValue();
  const b = await newPage(browser);
  await b.goto(link);
  await b.getByTestId('join-name').fill('Miss Dee');
  await b.getByTestId('join-submit').click();
  await a.getByTestId('approve').click();
  await expect(b.getByTestId('roster-empty').or(b.getByTestId('child-card')).first()).toBeVisible({ timeout: 60_000 });
  await a.getByTestId('invite-done').click();
  await expect(a.getByTestId('staff-row')).toHaveCount(2, { timeout: 30_000 });

  a.once('dialog', (d) => {
    expect(d.message()).toContain('Miss Dee');
    void d.accept();
  });
  await a.getByTestId('remove-provider').click();
  await expect(a.getByTestId('staff-row')).toHaveCount(1);
  await expect(b.getByTestId('im-provider')).toBeVisible({ timeout: 30_000 });
});

test('renaming the daycare shows the new name on parents’ phones too, and parents cannot change it', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');
  await expect(parent.getByText("Bri's Little Lambs")).toBeVisible(); // the built-in name

  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('open-settings').click();
  await provider.getByTestId('daycare-name').fill('Sunny Days Home Daycare');
  await provider.getByTestId('save-names').click();
  await expect(provider.getByTestId('names-saved')).toContainText('Saved');
  await expect(parent.getByText('Sunny Days Home Daycare')).toBeVisible({ timeout: 30_000 });
  await parent.reload();
  await expect(parent.getByText('Sunny Days Home Daycare')).toBeVisible();

  const forged = await parent.evaluate(async () => {
    const ctx = window.__syncHost!.contextOf('daycare');
    const row = (await ctx.data.query({ type: 'daycare.brand' }).once())[0];
    try {
      await ctx.data.update(row.id, { daycareName: 'Hacked' });
      return 'allowed';
    } catch {
      return 'blocked';
    }
  });
  // the parent's own device may accept the forged write locally; the provider's validator must not
  void forged;
  await provider.waitForTimeout(3000);
  const providerCopy = await provider.evaluate(async () => (await window.__syncHost!.contextOf('daycare').data.query({ type: 'daycare.brand' }).once())[0].fields.daycareName);
  expect(providerCopy).toBe('Sunny Days Home Daycare');
});

test('changing your own name: everyone sees the new name, on old entries too', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider, 'Miss Bri');
  await addFirstFamily(provider, 'Lee', 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('show-all').click();
  await provider.getByTestId('child-card').click();
  await provider.getByTestId('add-fab').click();
  await provider.getByTestId('tile-diaper').click();
  await provider.getByTestId('diaper-wet').click();
  await expect(parent.getByTestId('tl-item').first()).toContainText('by Miss Bri', { timeout: 30_000 });

  // the provider renames themselves; the parent's phone shows it on the entry that was already there
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('open-settings').click();
  await provider.getByTestId('my-name-input').fill('Miss Brianna');
  await provider.getByTestId('save-my-name').click();
  await expect(provider.getByTestId('my-name-status')).toHaveText('Saved');
  await expect(provider.getByTestId('my-name')).toHaveText('Miss Brianna');
  await expect(parent.getByTestId('tl-item').first()).toContainText('by Miss Brianna', { timeout: 30_000 });

  // the parent renames themselves; the provider's family screen and new entries use it
  await parent.getByTestId('open-settings').click();
  await parent.getByTestId('my-name-input').fill('Erin (Mama)');
  await parent.getByTestId('save-my-name').click();
  await expect(parent.getByTestId('my-name-status')).toHaveText('Saved');
  await parent.getByRole('button', { name: 'Back', exact: true }).click();
  await parent.getByTestId('add-fab').click();
  await parent.getByTestId('tile-checkin').click();
  await expect(parent.getByTestId('by-Mama')).toHaveAttribute('aria-pressed', 'true'); // the relationship comes from the new name
  await parent.getByTestId('details-save').click();
  await expect(parent.getByTestId('tl-item').first()).toContainText('by Mama 🏡');

  await provider.getByRole('button', { name: 'Back', exact: true }).click();
  await provider.getByTestId('show-all').click();
  await provider.getByTestId('child-card').click();
  await expect(provider.getByTestId('tl-item').first()).toContainText('by Mama 🏡', { timeout: 30_000 });
  // and a reload keeps it
  await provider.reload();
  await provider.getByTestId('show-all').click();
  await provider.getByTestId('child-card').click();
  await expect(provider.getByTestId('tl-item').first()).toContainText('by Mama 🏡');
});
