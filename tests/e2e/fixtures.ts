/**
 * Playwright's `test`, plus one housekeeping rule: every browser context a test opens (the helpers make one per device) is closed when
 * the test ends. Without it, earlier tests' phones stay alive and connected to the relay for the rest of the run.
 */
import { test as base } from '@playwright/test';

export * from '@playwright/test';

export const test = base.extend<{ closeStrays: void }>({
  closeStrays: [
    async ({ browser }, use) => {
      await use();
      for (const c of browser.contexts()) await c.close().catch(() => undefined);
    },
    { auto: true },
  ],
});
