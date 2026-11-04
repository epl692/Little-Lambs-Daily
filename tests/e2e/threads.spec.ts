/**
 * SPEC 11 phase 6 acceptance on two real browsers through a real relay: emoji reactions with counts and "who reacted",
 * thread replies in both directions, and who may edit or delete what.
 */
import { expect, test, type Page } from '@playwright/test';
import { addFirstFamily, newPage, pairParent, setupProvider } from './helpers';

const pill = (p: Page, emoji: string) => p.getByTestId(`reaction-${emoji}`);

async function logDiaper(provider: Page) {
  await provider.getByTestId('quick-add').click(); // opened for Ada: no "who" step
  await provider.getByTestId('tile-diaper').click();
  await provider.getByTestId('diaper-wet').click();
  await expect(provider.getByTestId('add-sheet')).toHaveCount(0);
}

test('reactions: toggle, counts converge, who reacted, and they survive a reload', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('show-all').click();
  await logDiaper(provider);
  await provider.getByTestId('child-card').click();
  await expect(provider.getByTestId('tl-item')).toHaveCount(1);
  await expect(parent.getByTestId('tl-item')).toHaveCount(1);

  // the parent hearts it: no pill until someone reacts, then 1 on both devices
  await expect(pill(parent, 'love')).toHaveCount(0);
  await parent.getByTestId('react-open').click();
  await expect(parent.getByTestId('react-picker').getByRole('button')).toHaveCount(8);
  await parent.getByTestId('pick-love').click();
  await expect(parent.getByTestId('react-picker')).toHaveCount(0);
  await expect(pill(parent, 'love')).toHaveAttribute('aria-pressed', 'true');
  await expect(pill(provider, 'love').getByTestId('reaction-count')).toHaveText('1');
  await expect(pill(provider, 'love')).toHaveAttribute('aria-pressed', 'false');

  // the provider joins in: 2 on both, each highlighted only for themselves
  await pill(provider, 'love').click();
  await expect(pill(provider, 'love').getByTestId('reaction-count')).toHaveText('2');
  await expect(pill(parent, 'love').getByTestId('reaction-count')).toHaveText('2');
  await expect(pill(provider, 'love')).toHaveAttribute('aria-pressed', 'true');

  // who reacted: long-press the pill
  const box = (await pill(provider, 'love').boundingBox())!;
  await provider.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await provider.mouse.down();
  await provider.waitForTimeout(650);
  await provider.mouse.up();
  await expect(provider.getByTestId('who-sheet')).toBeVisible();
  await expect(provider.getByTestId('who-name')).toHaveText(['You', 'Erin (Mom)']); // you first
  await provider.getByTestId('who-close').click();

  // a second kind of reaction, ordered after ❤️ and 👍 in the display order
  await parent.getByTestId('react-open').click();
  await parent.getByTestId('pick-thumbsUp').click();
  await expect(provider.locator('[data-testid^="reaction-"][aria-pressed]')).toHaveCount(2);
  await expect(provider.locator('[data-testid^="reaction-"][aria-pressed]').first()).toHaveAttribute('data-testid', 'reaction-thumbsUp');

  // toggling off and on again works
  await pill(parent, 'thumbsUp').click();
  await expect(pill(provider, 'thumbsUp')).toHaveCount(0);
  await parent.getByTestId('react-open').click();
  await parent.getByTestId('pick-thumbsUp').click();
  await expect(pill(provider, 'thumbsUp').getByTestId('reaction-count')).toHaveText('1');

  // still there after a reload (stored, not just on screen)
  await parent.reload();
  await expect(pill(parent, 'love').getByTestId('reaction-count')).toHaveText('2');
  await expect(pill(parent, 'love')).toHaveAttribute('aria-pressed', 'true');
});

test('replies: both directions, edit own, delete with undo, and parents cannot touch a provider’s reply', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('show-all').click();
  await logDiaper(provider);
  await provider.getByTestId('child-card').click();
  await expect(parent.getByTestId('tl-item')).toHaveCount(1);

  // a new item offers only "Reply"
  await expect(parent.getByTestId('thread-toggle')).toHaveText(/Reply$/);
  await parent.getByTestId('thread-toggle').click();
  await expect(parent.getByTestId('reply')).toHaveCount(0);
  await expect(parent.getByTestId('reply-send')).toBeDisabled();
  await parent.getByTestId('reply-input').fill('Thank you, Miss Bri! 💛');
  await parent.getByTestId('reply-send').click();
  await expect(parent.getByTestId('reply-text')).toHaveText('Thank you, Miss Bri! 💛');
  await expect(parent.getByTestId('thread-toggle')).toHaveText(/1 reply/);

  // the provider sees the count, expands, answers
  await expect(provider.getByTestId('thread-toggle')).toHaveText(/1 reply/);
  await provider.getByTestId('thread-toggle').click();
  await expect(provider.getByTestId('reply')).toContainText('Erin');
  await provider.getByTestId('reply-input').fill('Anytime!');
  await provider.getByTestId('reply-send').click();
  await expect(parent.getByTestId('thread-toggle')).toHaveText(/2 replies/);
  await expect(parent.getByTestId('reply-text')).toHaveText(['Thank you, Miss Bri! 💛', 'Anytime!']);

  // the parent may edit and delete only their own; the provider's has no controls for the parent
  const mine = parent.getByTestId('reply').nth(0);
  const theirs = parent.getByTestId('reply').nth(1);
  await expect(theirs.getByTestId('reply-edit')).toHaveCount(0);
  await expect(theirs.getByTestId('reply-delete')).toHaveCount(0);
  await mine.getByTestId('reply-edit').click();
  await parent.getByTestId('reply-edit-input').fill('Thank you so much! 💛');
  await parent.getByTestId('reply-edit-save').click();
  await expect(parent.getByTestId('reply-text').first()).toHaveText('Thank you so much! 💛');
  await expect(mine).toContainText('edited');
  await expect(provider.getByTestId('reply-text').first()).toHaveText('Thank you so much! 💛');

  // the provider may moderate (delete, not edit) a parent's reply; Undo brings it back
  const parentsOnProvider = provider.getByTestId('reply').nth(0);
  await expect(parentsOnProvider.getByTestId('reply-edit')).toHaveCount(0);
  provider.once('dialog', (d) => d.accept());
  await parentsOnProvider.getByTestId('reply-delete').click();
  await expect(provider.getByTestId('reply')).toHaveCount(1);
  await expect(parent.getByTestId('reply')).toHaveCount(1);
  await provider.getByTestId('toast-undo').click();
  await expect(provider.getByTestId('reply')).toHaveCount(2);
  await expect(parent.getByTestId('reply')).toHaveCount(2);

  await parent.getByTestId('react-open').click();
  await parent.getByTestId('pick-party').click();
  await parent.getByTestId('toast').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  await parent.screenshot({ path: 'test-results/shots/thread-open.png' });

  // the parent deletes their own, with the confirm, and Undo
  parent.once('dialog', (d) => d.accept());
  await parent.getByTestId('reply').nth(0).getByTestId('reply-delete').click();
  await expect(parent.getByTestId('reply')).toHaveCount(1);
  await parent.getByTestId('toast-undo').click();
  await expect(parent.getByTestId('reply')).toHaveCount(2);
});
