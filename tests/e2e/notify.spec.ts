/**
 * Telling people: a parent hears about the daycare's new entries, a provider hears about replies to their cards, nobody hears about
 * their own actions or about history that merely synced in, and the system-notification switch asks the browser properly.
 */
import { expect, test } from './fixtures';
import { addFirstFamily, newPage, pairParent, setupProvider } from './helpers';

test('new entries reach the parent and new replies reach the provider, in the app', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('show-all').click();
  await provider.getByTestId('child-card').click();

  // something logged BEFORE the parent joins is history, not news
  await provider.getByTestId('add-fab').click();
  await provider.getByTestId('tile-diaper').click();
  await provider.getByTestId('diaper-dry').click();
  await expect(provider.getByTestId('tl-item')).toHaveCount(1);
  await provider.getByRole('button', { name: /back/i }).click(); // roster
  await provider.getByTestId('manage-families').click();
  await provider.getByTestId('family-card').click();
  const parent = await pairParent(provider, browser, 'Erin');
  await provider.getByRole('button', { name: /back/i }).click(); // families
  await provider.getByRole('button', { name: /back/i }).click(); // roster
  await provider.getByTestId('show-all').click();
  await provider.getByTestId('child-card').click();
  await expect(parent.getByTestId('tl-item')).toHaveCount(1, { timeout: 30_000 });
  await parent.waitForTimeout(2500);
  await expect(parent.getByTestId('toast')).toHaveCount(0);

  // a new entry: the parent is told
  await provider.getByTestId('add-fab').click();
  await provider.getByTestId('tile-diaper').click();
  await provider.getByTestId('diaper-wet').click();
  await expect(parent.getByTestId('toast-text')).toContainText('Ada: Diaper', { timeout: 30_000 });
  await expect(parent.getByTestId('toast-text')).toContainText('Wet');
  await expect(parent.getByTestId('toast-text')).toContainText('Miss Bri');

  // the parent replies to the provider's card: the provider is told, with who and what
  await parent.getByTestId('thread-toggle').first().click();
  await parent.getByTestId('reply-input').first().fill('Thank you for the update!');
  await parent.getByTestId('reply-send').first().click();
  await expect(provider.getByTestId('toast-text')).toContainText('Erin (Mom) replied', { timeout: 30_000 });
  await expect(provider.getByTestId('toast-text')).toContainText('Thank you for the update!');

  // the parent is not told about their own reply
  await expect(parent.getByTestId('toast-text')).not.toContainText('replied');
});

test('the notification switch asks the browser, remembers the answer, and says what happens when it is refused', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const provider = await ctx.newPage();
  // Headless Chromium reports notification permission as denied whatever is granted, so stand in for a real browser, which asks once and remembers.
  await provider.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { get: () => localStorage.getItem('fake.perm') ?? 'default', configurable: true });
    Notification.requestPermission = async () => {
      localStorage.setItem('fake.perm', 'granted');
      return 'granted';
    };
  });
  await setupProvider(provider);
  await provider.getByTestId('open-settings').click();
  await expect(provider.getByTestId('notify-toggle')).not.toBeChecked();
  await provider.getByTestId('notify-toggle').check();
  await expect(provider.getByTestId('notify-note')).toContainText('On.');
  await provider.reload();
  await provider.getByTestId('open-settings').click();
  await expect(provider.getByTestId('notify-toggle')).toBeChecked(); // remembered
  await provider.getByTestId('notify-toggle').uncheck();
  await provider.reload();
  await provider.getByTestId('open-settings').click();
  await expect(provider.getByTestId('notify-toggle')).not.toBeChecked();
  await ctx.close();

  // a browser that refuses: the switch goes back off and explains
  const refused = await browser.newContext({ viewport: { width: 375, height: 812 }, permissions: [] });
  const p2 = await refused.newPage();
  await p2.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { get: () => 'denied', configurable: true });
    Notification.requestPermission = async () => 'denied';
  });
  await setupProvider(p2);
  await p2.getByTestId('open-settings').click();
  await p2.getByTestId('notify-toggle').click(); // the app turns it straight back off
  await expect(p2.getByTestId('notify-note')).toContainText('blocked');
  await expect(p2.getByTestId('notify-toggle')).not.toBeChecked();
  await refused.close();
});
