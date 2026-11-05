/**
 * SPEC 11 phase 4: roster and timeline (read). Uses a provider and, where it matters, a parent on a second browser.
 * Entries are seeded through the dev host until phase 5 adds the real add flow.
 */
import { expect, test } from './fixtures';
import { addFirstFamily, newPage, pairParent, seedDay, setupProvider, TOO_EARLY } from './helpers';

test.skip(TOO_EARLY(), 'seeded entries sit between 1 and 5 AM, so the clock must be past 6 AM');

const labels = (page: import('@playwright/test').Page) => page.getByTestId('tl-label').allTextContents();

test('roster cards show status, since-chips and allergies, and open the timeline', async ({ browser }) => {
  const p = await newPage(browser);
  await setupProvider(p);
  await addFirstFamily(p, 'Lee', 'Ada');
  await seedDay(p, 'Ada', { thresholdMinutes: 15, allergies: 'peanuts' });
  await p.reload();

  await p.getByTestId('manage-families').waitFor();
  const card = p.getByTestId('child-card');
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('child-name-label')).toHaveText('Ada');
  await expect(card.getByTestId('child-status')).toHaveText('Checked in 1:02a'); // closed nap, so not napping
  await expect(card.getByTestId('allergy-badge')).toBeVisible();
  await expect(card.getByTestId('since-feed')).toContainText(/🍼 \d+h \d+m/);
  await expect(card.getByTestId('since-feed')).toHaveClass(/amber/); // threshold set to 15 minutes
  await expect(card.getByTestId('since-diaper')).toBeVisible();

  // Here now / All children
  await expect(p.getByTestId('show-here')).toHaveAttribute('aria-pressed', 'true');
  await p.getByTestId('show-all').click();
  await expect(card).toHaveCount(1);

  await card.click();
  await expect(p.getByTestId('timeline-title')).toHaveText('Ada');
  await expect(p.getByTestId('allergy-banner')).toContainText('peanuts');
});

test('timeline: order, hour breaks, content, filters, day navigation, empty state', async ({ browser }) => {
  const p = await newPage(browser);
  await setupProvider(p);
  await addFirstFamily(p, 'Lee', 'Ada');
  await seedDay(p, 'Ada');
  await p.reload();
  await p.getByTestId('child-card').click();

  // newest first by default
  await expect(p.getByTestId('tl-item')).toHaveCount(6);
  expect(await labels(p)).toEqual(['Note', 'Nap', 'Meal', 'Diaper', 'Bottle', 'Check-in']);
  await expect(p.getByTestId('day-label')).toContainText('Today');

  // card content (SPEC 6.6)
  const items = p.getByTestId('tl-item');
  await expect(items.nth(1).getByTestId('tl-time')).toHaveText('3:30 AM – 5:05 AM · 1h 35m');
  await expect(items.nth(2).getByTestId('tl-summary')).toHaveText('Lunch · Mac & cheese, peas · Ate most');
  await expect(items.nth(3).getByTestId('tl-summary')).toHaveText('💧 Wet · cream applied');
  await expect(items.nth(4).getByTestId('tl-summary')).toHaveText('4 oz formula · finished 3.5 oz');
  await expect(items.nth(5).getByTestId('tl-summary')).toHaveText('Dropped off by Mom');
  await expect(items.nth(0)).toContainText('by Miss Bri');
  // user text is text, never markup
  await expect(items.nth(0)).toContainText('<b>not bold</b>');
  expect(await items.nth(0).locator('b').count()).toBe(0);
  // the date travels in an accessible label
  await expect(items.nth(1).getByRole('article')).toHaveAttribute('aria-label', /^Nap, \w+day, \w+ \d+, 3:30 AM/);

  // one light separator per hour that has entries: 1, 2, 3 and 5 AM
  expect(await p.locator('.hour').allTextContents()).toEqual(['5 AM', '3 AM', '2 AM', '1 AM']);

  // flip order, persists across reload
  await p.getByTestId('order-toggle').click();
  expect(await labels(p)).toEqual(['Check-in', 'Bottle', 'Diaper', 'Meal', 'Nap', 'Note']);
  await p.reload();
  await p.getByTestId('child-card').click();
  expect((await labels(p))[0]).toBe('Check-in');
  await p.getByTestId('order-toggle').click();

  // filters
  await p.getByTestId('filter-naps').click();
  expect(await labels(p)).toEqual(['Nap']);
  await p.getByTestId('filter-food').click();
  expect((await labels(p)).sort()).toEqual(['Bottle', 'Meal']);
  await p.getByTestId('filter-photos').click();
  await expect(p.getByTestId('tl-empty')).toContainText('Nothing here for this filter');
  await p.getByTestId('filter-all').click();

  // yesterday, via the arrow
  await p.getByTestId('day-prev').click();
  await expect(p.getByTestId('day-label')).toContainText('Yesterday');
  expect(await labels(p)).toEqual(['Meal']);
  await expect(p.getByTestId('day-today')).toBeVisible();
  // the day before that is empty
  await p.getByTestId('day-prev').click();
  await expect(p.getByTestId('tl-empty')).toContainText('Nothing was logged on this day.');
  // and back
  await p.getByTestId('day-today').click();
  await expect(p.getByTestId('tl-item')).toHaveCount(6);
  await expect(p.getByTestId('day-today')).toHaveCount(0);
});

test('timeline geometry at 375px: one continuous line, a dot on it at each header, boxes to the right (light and dark)', async ({ browser }, info) => {
  for (const scheme of ['light', 'dark'] as const) {
    const p = await newPage(browser, { width: 375, scheme });
    await setupProvider(p);
    await addFirstFamily(p, 'Lee', 'Ada');
    await seedDay(p, 'Ada');
    await p.reload();
    await p.getByTestId('child-card').click();
    await expect(p.getByTestId('tl-item')).toHaveCount(6);
    await expect(p.locator('html')).toHaveAttribute('data-theme', scheme);

    const g = await p.evaluate(() => {
      const ol = document.querySelector('[data-testid=timeline]') as HTMLElement;
      const o = ol.getBoundingClientRect();
      const line = getComputedStyle(ol, '::before');
      const lineLeft = o.left + parseFloat(line.left);
      const lineWidth = parseFloat(line.width);
      const items = [...ol.querySelectorAll('[data-testid=tl-item]')].map((li) => {
        const dot = li.querySelector('.dot')!.getBoundingClientRect();
        const card = li.querySelector('article')!.getBoundingClientRect();
        const hdr = li.querySelector('header')!.getBoundingClientRect();
        return { dotX: dot.left + dot.width / 2, dotY: dot.top + dot.height / 2, dotW: dot.width, dotRight: dot.right, cardLeft: card.left, hdrY: hdr.top + hdr.height / 2, cardBottom: card.bottom };
      });
      return { top: o.top, bottom: o.bottom, lineLeft, lineWidth, lineTop: line.top, lineBottom: line.bottom, items, vw: innerWidth, sw: document.documentElement.scrollWidth };
    });

    expect(g.lineWidth).toBe(2);
    expect(g.lineTop).toBe('0px'); // runs from the top of the list...
    expect(g.lineBottom).toBe('0px'); // ...through the last item
    const lastCardBottom = Math.max(...g.items.map((i) => i.cardBottom));
    expect(g.bottom).toBeGreaterThanOrEqual(lastCardBottom);
    expect(g.top).toBeLessThanOrEqual(Math.min(...g.items.map((i) => i.dotY)));
    for (const i of g.items) {
      expect(Math.abs(i.dotX - (g.lineLeft + g.lineWidth / 2))).toBeLessThanOrEqual(1); // the dot is on the line
      expect(Math.abs(i.dotY - i.hdrY)).toBeLessThanOrEqual(2); // centred on the card's header row
      expect(i.dotW).toBe(12);
      expect(i.cardLeft).toBeGreaterThan(i.dotRight); // the box sits to the right of the line
    }
    expect(g.sw).toBeLessThanOrEqual(g.vw); // no sideways scrolling at 375px
    const shot = await p.screenshot({ fullPage: true, path: `test-results/shots/timeline-${scheme}-375.png` });
    await info.attach(`timeline-${scheme}-375.png`, { body: shot, contentType: 'image/png' });
    await p.context().close();
  }
});

test('a parent sees the same day as a timeline, with siblings and an All view', async ({ browser }) => {
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  await provider.getByPlaceholder('Add another child').fill('Ben');
  await provider.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(provider.getByTestId('child-row')).toHaveCount(2);
  await seedDay(provider, 'Ada');
  await seedDay(provider, 'Ben');

  const parent = await pairParent(provider, browser, 'Erin');
  await expect(parent.getByTestId('sibling-Ada')).toBeVisible();
  await expect(parent.getByTestId('sibling-Ben')).toBeVisible();
  // siblings: starts on "All": both children, labelled, statuses for each
  await expect(parent.getByTestId('status-card')).toHaveCount(2);
  await expect(parent.getByTestId('tl-item')).toHaveCount(12);
  // every card names its child in the merged view (entries logged at the same minute have no fixed order between kids)
  await expect(parent.getByTestId('tl-item').filter({ hasText: 'Ada' })).toHaveCount(6);
  await expect(parent.getByTestId('tl-item').filter({ hasText: 'Ben' })).toHaveCount(6);

  await parent.getByTestId('sibling-Ben').click();
  await expect(parent.getByTestId('tl-item')).toHaveCount(6);
  await expect(parent.getByTestId('status-line')).toHaveText('Checked in at 1:02a by Mom');
  await expect(parent.getByTestId('tl-item').first()).not.toContainText('for Ben'); // single child: no name labels
  expect(await parent.getByTestId('tl-label').allTextContents()).toEqual(['Note', 'Nap', 'Meal', 'Diaper', 'Bottle', 'Check-in']);

  // a new entry from the provider arrives live
  await provider.evaluate(async () => {
    const ctx = window.__syncHost!.contextOf('daycare');
    const me = ctx.spaces.admin.session();
    const ben = (await ctx.data.query({ type: 'daycare.child' }).once()).find((k: any) => k.fields.firstName === 'Ben');
    await ctx.data.create(ben.space, 'daycare.entry', { child: ben.id, kind: 'providerNote', at: Date.now() - 1000, text: 'Just now!', createdBy: me.user, createdByName: 'Miss Bri', createdByRole: 'provider' });
  });
  await expect(parent.getByTestId('tl-item').first()).toContainText('Just now!');
});
