import { expect, type Browser, type Page } from '@playwright/test';

export const norm = (s: string | null) => (s ?? '').replace(/\s*[·-]\s*/g, '-').trim();

export async function newPage(browser: Browser, opts: { width?: number; height?: number; scheme?: 'light' | 'dark' } = {}): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: opts.width ?? 375, height: opts.height ?? 812 },
    colorScheme: opts.scheme ?? 'light',
  });
  return ctx.newPage();
}

export async function setupProvider(page: Page, name = 'Miss Bri') {
  await page.goto('/');
  await page.getByTestId('im-provider').click();
  await page.getByTestId('provider-name').fill(name);
  await page.getByTestId('create-daycare').click();
  await expect(page.getByTestId('roster-empty')).toBeVisible();
}

/** From the empty roster: add the first family. Leaves the provider on that family's screen. */
export async function addFirstFamily(page: Page, family: string, child: string) {
  await page.getByTestId('add-first-family').click();
  await page.getByTestId('family-name').fill(family);
  await page.getByTestId('child-name').fill(child);
  await page.getByTestId('create-family').click();
  await expect(page.getByTestId('child-row').first()).toHaveText(child);
}

/** Provider is on a family screen: invite a parent, who joins on a fresh page; provider approves. Returns the parent's page. */
export async function pairParent(provider: Page, browser: Browser, name: string, opts: { width?: number; scheme?: 'light' | 'dark' } = {}): Promise<Page> {
  await provider.getByTestId('invite-parent').click();
  const link = await provider.getByTestId('invite-link').inputValue();
  const parent = await newPage(browser, opts);
  await parent.goto(link);
  await parent.getByTestId('join-name').fill(name);
  await parent.getByTestId('join-submit').click();
  await provider.getByTestId('approve').click();
  await expect(parent.getByTestId('parent-title')).toBeVisible();
  await provider.getByTestId('invite-done').click();
  return parent;
}

declare global {
  interface Window {
    __syncHost?: { contextOf(id: string): any };
  }
}

/**
 * Writes a day of entries for one child through the dev build's host (Phase 5 will add the real add flow).
 * All times are early in the local day (01:00 to 05:15) so they are always in the past when the test runs after 06:00,
 * and "yesterday" has a single lunch.
 */
export async function seedDay(page: Page, childName: string, o: { thresholdMinutes?: number; allergies?: string } = {}) {
  await page.waitForFunction(() => !!window.__syncHost?.contextOf('daycare'));
  await page.evaluate(
    async ({ childName, o }) => {
      const ctx = window.__syncHost!.contextOf('daycare');
      const admin = ctx.spaces.admin;
      const me = admin.session();
      const kids = await ctx.data.query({ type: 'daycare.child' }).once();
      const kid = kids.find((k: any) => k.fields.firstName === childName);
      if (!kid) throw new Error(`no child ${childName}`);
      const b = new Date();
      const at = (day: number, h: number, m = 0) => new Date(b.getFullYear(), b.getMonth(), b.getDate() + day, h, m).getTime();
      const by = { createdBy: me.user, createdByName: me.displayName ?? 'Miss Bri', createdByRole: 'provider', child: kid.id };
      const mk = (f: Record<string, unknown>) => ctx.data.create(kid.space, 'daycare.entry', { ...by, ...f });
      await mk({ kind: 'checkin', at: at(0, 1, 2), by: 'Mom' });
      await mk({ kind: 'bottle', at: at(0, 1, 30), bottleContents: 'formula', ozOffered: 4, ozFinished: 3.5 });
      await mk({ kind: 'diaper', at: at(0, 2, 42), diaper: 'wet', diaperNote: ['creamApplied'] });
      await mk({ kind: 'meal', at: at(0, 3, 15), mealPeriod: 'lunch', served: 'Mac & cheese, peas', amount: 'most' });
      await mk({ kind: 'nap', at: at(0, 3, 30), endAt: at(0, 5, 5) });
      await mk({ kind: 'providerNote', at: at(0, 5, 15), text: 'Great morning! <b>not bold</b>' });
      await mk({ kind: 'meal', at: at(-1, 12, 0), mealPeriod: 'lunch', served: 'Soup', amount: 'all' });
      if (o.allergies) await ctx.data.update(kid.id, { allergies: o.allergies });
      if (o.thresholdMinutes) {
        const staff = (await admin.list()).find((s: any) => s.name?.endsWith(' Staff'));
        const row = (await ctx.data.query({ type: 'daycare.settings', space: staff.id }).once())[0];
        await ctx.data.update(row.id, { sinceThresholdMinutes: o.thresholdMinutes });
      }
    },
    { childName, o },
  );
}

/** Seeded entries are all before this hour, so tests that rely on them being in the past skip before it. */
export const TOO_EARLY = () => new Date().getHours() < 6;
