/**
 * SPEC 11 phase 8 acceptance on real browsers through a real relay: the parent's profile (family notes are theirs to write,
 * everything else is read-only), the same-day rule on editing their own check-in time, and leaving the family.
 */
import { expect, test } from './fixtures';
import { addFirstFamily, newPage, pairParent, setupProvider } from './helpers';

test('profile: a parent writes family notes the daycare sees; allergies and care notes are read-only', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');

  // the provider's allergy and care notes (written through the dev host; the Family screen edits names only)
  await provider.evaluate(async () => {
    const ctx = window.__syncHost!.contextOf('daycare');
    const kid = (await ctx.data.query({ type: 'daycare.child' }).once())[0];
    await ctx.data.update(kid.id, { allergies: 'Peanuts', careNotes: 'Likes the blue blanket' });
  });

  await parent.getByTestId('child-profile-link').click();
  await expect(parent.getByTestId('profile-allergies')).toHaveText('Peanuts', { timeout: 20_000 });
  await expect(parent.getByTestId('profile-care')).toHaveText('Likes the blue blanket');
  await expect(parent.getByTestId('profile-member')).toHaveText(['Erin (Mom)']);
  await expect(parent.locator('textarea')).toHaveCount(1); // family notes only
  await expect(parent.getByTestId('family-notes-save')).toBeDisabled();

  await parent.getByTestId('family-notes').fill('Pick-up is by Grandpa on Fridays');
  await parent.getByTestId('family-notes-save').click();
  await expect(parent.getByText('Saved')).toBeVisible();

  // survives a reload, and the provider sees it on their profile screen
  await parent.reload();
  await parent.getByTestId('child-profile-link').click();
  await expect(parent.getByTestId('family-notes')).toHaveValue('Pick-up is by Grandpa on Fridays');
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('show-all').click();
  await provider.getByTestId('child-card').click();
  await provider.getByTestId('open-profile').click();
  await expect(provider.getByTestId('family-notes')).toHaveValue('Pick-up is by Grandpa on Fridays', { timeout: 20_000 });
  await parent.screenshot({ path: 'test-results/shots/parent-profile.png' });
});

test('a parent can fix the time of their own check-in, but only within that day', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');

  await parent.getByTestId('add-fab').click();
  await parent.getByTestId('tile-checkin').click();
  await parent.getByTestId('details-save').click();
  await expect(parent.getByTestId('tl-item')).toHaveCount(1);

  await parent.getByTestId('entry-menu').click();
  await parent.getByTestId('menu-edit').click();
  await parent.getByTestId('time-pill').click();
  const input = parent.getByTestId('time-input');
  const today = await input.inputValue(); // YYYY-MM-DDTHH:mm
  const day = today.slice(0, 10);
  expect(await input.getAttribute('min')).toBe(`${day}T00:00`);
  expect(await input.getAttribute('max')).toBe(`${day}T23:59`);

  // yesterday is refused (even if the picker is bypassed)
  const d = new Date(`${day}T12:00`);
  d.setDate(d.getDate() - 1);
  const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T07:30`;
  await input.fill(yesterday);
  await parent.getByTestId('details-save').click();
  await expect(parent.getByRole('alert')).toHaveText('You can only change the time within the same day.');

  // earlier the same day is fine
  await input.fill(`${day}T00:05`);
  await parent.getByTestId('details-save').click();
  await expect(parent.getByTestId('toast-text')).toHaveText('Saved changes');
  await expect(parent.getByTestId('tl-item')).toContainText('12:05');
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('show-all').click();
  await provider.getByTestId('child-card').click();
  await expect(provider.getByTestId('status-line')).toContainText('12:05', { timeout: 20_000 });
});

test('a parent can leave the family and is taken back to the start', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');

  await parent.getByTestId('open-settings').click();
  await expect(parent.getByTestId('staff-row')).toHaveCount(0); // provider settings are not shown
  await expect(parent.getByTestId('invite-provider')).toHaveCount(0);
  parent.once('dialog', (dlg) => {
    expect(dlg.message()).toContain('Lee family');
    void dlg.accept();
  });
  await parent.getByTestId('leave-family').click();
  await expect(parent.getByTestId('im-provider')).toBeVisible({ timeout: 20_000 }); // back at the welcome screen
  // the device still holds what it synced (the framework cannot unsee it), but the app shows nothing of that family
  await expect(parent.getByText('Ada')).toHaveCount(0);
  await parent.reload();
  await expect(parent.getByTestId('im-provider')).toBeVisible({ timeout: 20_000 });
});
