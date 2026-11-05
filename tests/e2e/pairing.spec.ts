/**
 * SPEC 11 phase 3: two browsers (two isolated profiles, like two phones) pair through a real relay and sync.
 * Covers: provider setup, add family, invite QR/link, matching SAS words on both screens, provider approval,
 * parent lands on their child, invite is single-use, and the secret never stays in the address bar.
 */
import { expect, test, type Page } from './fixtures';

const norm = (s: string | null) => (s ?? '').replace(/\s*[·-]\s*/g, '-').trim();

async function setupProvider(page: Page) {
  await page.goto('/');
  await page.getByTestId('im-provider').click();
  await page.getByTestId('provider-name').fill('Miss Bri');
  await page.getByTestId('create-daycare').click();
  await expect(page.getByTestId('roster-empty')).toBeVisible();
}

test('provider sets up, invites a parent, and the parent joins with matching SAS words', async ({ browser }) => {
  const provider = await (await browser.newContext()).newPage();
  const parent = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  for (const p of [provider, parent]) p.on('pageerror', (e) => errors.push(e.message));

  // --- provider: set up, add a family ---
  await setupProvider(provider);
  await expect(provider.getByTestId('daycare-title')).toHaveText("Bri's Little Lambs");
  await provider.getByTestId('add-first-family').click();
  await provider.getByTestId('family-name').fill('Lee');
  await provider.getByTestId('child-name').fill('Ada');
  await provider.getByTestId('create-family').click();
  await expect(provider.getByTestId('child-row')).toHaveText('Ada');

  // --- provider: invite a parent (QR + link) ---
  await provider.getByTestId('invite-parent').click();
  const link = await provider.getByTestId('invite-link').inputValue();
  expect(link).toContain('#/join/');
  await expect(provider.getByRole('img', { name: 'Invite QR code' })).toBeVisible();

  // --- parent: open the link ---
  await parent.goto(link);
  await expect(parent.getByTestId('invite-text')).toHaveValue(link);
  expect(await parent.evaluate(() => location.hash)).toBe(''); // the secret left the address bar
  await parent.getByTestId('join-name').fill('Erin');
  await parent.getByTestId('join-submit').click();

  // --- both screens show the same five words; the provider approves ---
  const parentWords = norm(await parent.getByTestId('join-sas').textContent());
  expect(parentWords.split('-')).toHaveLength(5);
  await expect(provider.getByTestId('approval-sas')).toBeVisible();
  expect(norm(await provider.getByTestId('approval-sas').textContent())).toBe(parentWords);
  await provider.getByTestId('approve').click();

  // --- parent lands on their child ---
  await expect(parent.getByTestId('parent-title')).toHaveText('Lee family');
  await expect(parent.getByTestId('my-child')).toHaveText('Ada');

  // --- provider closes the invite screen and sees who joined ---
  await provider.getByTestId('invite-done').click();
  await expect(provider.getByTestId('parent-row')).toHaveText('Erin (Mom)');

  // --- reload keeps the parent signed in (data is on the device) ---
  await parent.reload();
  await expect(parent.getByTestId('parent-title')).toHaveText('Lee family');

  // --- the invite works once ---
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(link);
  await stranger.getByTestId('join-name').fill('Mallory');
  await stranger.getByTestId('join-submit').click();
  await expect(stranger.getByTestId('join-error')).toContainText(/already been used|not valid|expired/i);

  expect(errors).toEqual([]);
});

test('a parent only ever sees their own family', async ({ browser }) => {
  const provider = await (await browser.newContext()).newPage();
  await setupProvider(provider);
  for (const [fam, kid] of [['Lee', 'Ada'], ['Okafor', 'Zuri']]) {
    await provider.getByTestId(fam === 'Lee' ? 'add-first-family' : 'add-family').click();
    await provider.getByTestId('family-name').fill(fam!);
    await provider.getByTestId('child-name').fill(kid!);
    await provider.getByTestId('create-family').click();
    await expect(provider.getByTestId('child-row')).toHaveText(kid!);
    if (fam === 'Lee') {
      await provider.getByRole('button', { name: /back/i }).click(); // roster
      await provider.getByTestId('manage-families').click();
    }
  }
  // invite for the Okafor family (currently open)
  await provider.getByTestId('invite-parent').click();
  const link = await provider.getByTestId('invite-link').inputValue();
  const parent = await (await browser.newContext()).newPage();
  await parent.goto(link);
  await parent.getByTestId('join-name').fill('Ngozi');
  await parent.getByTestId('join-submit').click();
  await provider.getByTestId('approve').click();
  await expect(parent.getByTestId('parent-title')).toHaveText('Okafor family');
  await expect(parent.getByTestId('my-child')).toHaveText('Zuri');
  await expect(parent.getByText('Ada')).toHaveCount(0);
});
