/**
 * SPEC 3 (accessibility): an automated WCAG 2 A/AA scan of the main screens in light and dark, plus keyboard and
 * reduced-motion behaviour. Automated scans catch contrast, names, roles and structure; they do not replace using the app
 * with a screen reader, which is listed in the README checklist.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { addFirstFamily, newPage, pairParent, seedDay, setupProvider } from './helpers';

async function scan(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const lines = r.violations.map((v) => `${v.id} (${v.impact}) on ${v.nodes.length} node(s): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(lines, `accessibility problems on ${where}`).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`accessibility scan: every main screen (${scheme})`, async ({ browser }) => {
    const provider = await newPage(browser, { scheme });
    await provider.goto('/');
    await expect(provider.getByTestId('im-provider')).toBeVisible();
    await scan(provider, 'welcome');

    await setupProvider(provider);
    await scan(provider, 'empty roster');
    await addFirstFamily(provider, 'Lee', 'Ada');
    await scan(provider, 'family screen');
    const parent = await pairParent(provider, browser, 'Erin', { scheme });
    await seedDay(provider, 'Ada', { allergies: 'Peanuts' });
    await provider.getByRole('button', { name: /back/i }).click();
    await provider.getByTestId('show-all').click();
    await scan(provider, 'roster');

    await provider.getByTestId('child-card').click();
    await expect(provider.getByTestId('tl-item').first()).toBeVisible();
    await provider.getByTestId('react-open').first().click();
    await provider.getByTestId('pick-love').click();
    await provider.getByTestId('thread-toggle').first().click();
    await scan(provider, 'child timeline with a reaction and an open thread');
    await provider.getByTestId('summary-toggle').click();
    await scan(provider, 'timeline with the daily summary');

    await provider.getByTestId('add-fab').click();
    await provider.waitForTimeout(500); // let the sheet finish sliding in: a half-faded sheet fails contrast checks for no real reason
    await scan(provider, 'add sheet: what');
    await provider.getByTestId('tile-bottle').click();
    await provider.waitForTimeout(300);
    await scan(provider, 'add sheet: bottle details');
    await provider.getByTestId('sheet-close').click();

    await provider.getByRole('button', { name: /back/i }).click();
    await provider.getByTestId('open-settings').click();
    await scan(provider, 'provider settings');
    await provider.getByTestId('open-reports').click();
    await scan(provider, 'reports');

    await expect(parent.getByTestId('tl-item').first()).toBeVisible({ timeout: 30_000 });
    await scan(parent, 'parent home');
    await parent.getByTestId('child-profile-link').click();
    await scan(parent, 'child profile');
    await parent.getByRole('button', { name: 'Back', exact: true }).click();
    await parent.getByTestId('open-settings').click();
    await scan(parent, 'parent settings');
  });
}

test('keyboard: sheets keep focus inside, Escape closes them, and focus returns to what opened them', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  await seedDay(provider, 'Ada');
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('show-all').click();
  await provider.getByTestId('child-card').click();
  await expect(provider.getByTestId('tl-item').first()).toBeVisible();

  const insideDialog = (testId: string) => provider.evaluate((id) => !!document.querySelector(`[data-testid="${id}"]`)?.contains(document.activeElement), testId);

  // the add sheet
  await provider.getByTestId('add-fab').focus();
  await provider.keyboard.press('Enter');
  await expect(provider.getByTestId('add-sheet')).toBeVisible();
  expect(await insideDialog('add-sheet')).toBe(true); // focus moved in on its own
  for (let i = 0; i < 25; i++) {
    await provider.keyboard.press('Tab');
    expect(await insideDialog('add-sheet'), `Tab #${i + 1} left the sheet`).toBe(true);
  }
  for (let i = 0; i < 25; i++) {
    await provider.keyboard.press('Shift+Tab');
    expect(await insideDialog('add-sheet'), `Shift+Tab #${i + 1} left the sheet`).toBe(true);
  }
  await provider.keyboard.press('Escape');
  await expect(provider.getByTestId('add-sheet')).toHaveCount(0);
  await expect(provider.getByTestId('add-fab')).toBeFocused(); // back where they were

  // who reacted
  await provider.getByTestId('react-open').first().click();
  await provider.getByTestId('pick-love').click();
  await provider.getByTestId('reaction-love').first().focus();
  await provider.getByTestId('reaction-love').first().click({ button: 'right' });
  await expect(provider.getByTestId('who-sheet')).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await provider.keyboard.press('Tab');
    expect(await insideDialog('who-sheet')).toBe(true);
  }
  await provider.keyboard.press('Escape');
  await expect(provider.getByTestId('who-sheet')).toHaveCount(0);
});

test('reduced motion: nothing animates when the device asks for less', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
  const provider = await ctx.newPage();
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('show-all').click();
  await provider.getByTestId('child-card').click();
  // an open nap normally pulses its dot
  await provider.getByTestId('add-fab').click();
  await provider.getByTestId('tile-nap').click();
  await provider.getByTestId('details-save').click();
  const dot = provider.locator('.open .dot').first();
  await expect(dot).toBeVisible();
  const animation = await dot.evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe('none');
  const sheetTransition = await provider.evaluate(() => getComputedStyle(document.body).transitionDuration);
  expect(['0s', '0.00001s', '1e-05s']).toContain(sheetTransition);
});
