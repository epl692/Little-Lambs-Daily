/** Writes screenshots of the add flow to test-results/shots/ (light and dark, 375px) so the UI can be reviewed by eye. */
import { expect, test } from '@playwright/test';
import { addFirstFamily, newPage, seedDay, setupProvider } from './helpers';

for (const scheme of ['light', 'dark'] as const) {
  test(`add flow screenshots (${scheme})`, async ({ browser }) => {
    const p = await newPage(browser, { scheme });
    const shot = async (name: string) => {
      await p.waitForTimeout(400); // let the sheet's slide-in finish
      await p.screenshot({ path: `test-results/shots/${name}-${scheme}.png` });
    };
    await setupProvider(p);
    await addFirstFamily(p, 'Lee', 'Ada');
    await p.getByPlaceholder('Add another child').fill('Ben');
    await p.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(p.getByTestId('child-row')).toHaveCount(2);
    await seedDay(p, 'Ada', { thresholdMinutes: 15, allergies: 'peanuts' });
    await p.getByRole('button', { name: /back/i }).click();
    await p.reload();
    await p.getByTestId('show-all').click();

    // Ben naps via the UI
    await p.getByTestId('add-fab').click();
    await shot('sheet-what');
    await p.getByTestId('tile-nap').click();
    await shot('sheet-who');
    await p.getByTestId('who-Ben').click();
    await p.getByTestId('who-next').click();
    await p.getByTestId('details-save').click();
    await expect(p.getByTestId('nap-banner')).toBeVisible();
    await shot('roster-banner');

    await p.getByTestId('add-fab').click();
    await p.getByTestId('tile-bottle').click();
    await p.getByTestId('who-Ada').click();
    await p.getByTestId('who-next').click();
    await p.getByTestId('oz-offered-plus').click();
    await shot('sheet-bottle');
    await p.getByTestId('sheet-close').click();

    await p.getByTestId('add-fab').click();
    await p.getByTestId('tile-meal').click();
    await p.getByTestId('who-Ada').click();
    await p.getByTestId('who-next').click();
    await p.getByTestId('served-input').fill('Mac & cheese, peas');
    await shot('sheet-meal');
    await p.getByTestId('details-save').click();
    await expect(p.getByTestId('toast')).toBeVisible();
    await shot('toast');
  });
}
