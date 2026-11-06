/** A child added by mistake can be removed from a family (and brought back with Undo) without removing the whole family. */
import { expect, test } from './fixtures';
import { addFirstFamily, newPage, setupProvider } from './helpers';

test('remove an extra child, then undo', async ({ browser }) => {
  const p = await newPage(browser);
  await setupProvider(p);
  await addFirstFamily(p, 'Rivera', 'Ada');
  await p.getByPlaceholder('Add another child').fill('Oops');
  await p.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(p.getByTestId('child-row')).toHaveCount(2);

  await p.getByRole('button', { name: 'Manage Oops' }).click();
  const remove = p.getByTestId('remove-child');
  await expect(remove).toBeDisabled(); // not one tap: the name has to be typed
  await p.getByTestId('remove-confirm-input').fill('Ad');
  await expect(remove).toBeDisabled();
  await p.getByTestId('remove-confirm-input').fill('oops');
  await remove.click();
  await expect(p.getByTestId('child-row')).toHaveCount(1);
  await expect(p.getByTestId('child-row')).toHaveText('Ada');

  await p.getByRole('button', { name: /undo/i }).click();
  await expect(p.getByTestId('child-row')).toHaveCount(2);
});

test('remove a whole family when a child leaves, and restore it', async ({ browser }) => {
  const p = await newPage(browser);
  await setupProvider(p);
  await addFirstFamily(p, 'Rivera', 'Ada');

  await p.getByTestId('manage-family').click();
  const remove = p.getByTestId('remove-family');
  await expect(remove).toBeDisabled();
  await p.getByTestId('remove-family-input').fill('Riv');
  await expect(remove).toBeDisabled();
  await p.getByTestId('remove-family-input').fill('rivera');
  await remove.click();

  // gone from the Families list, kept under "Removed families"
  await expect(p.getByTestId('family-card')).toHaveCount(0);
  await expect(p.getByTestId('archived-family')).toHaveText(/Rivera/);
  await p.getByTestId('restore-family').click();
  await expect(p.getByTestId('family-card')).toHaveCount(1);
  await expect(p.getByTestId('archived-family')).toHaveCount(0);
});
