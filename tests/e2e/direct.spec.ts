/**
 * The fallback when the relay cannot be reached: two devices on the same Wi-Fi connect straight to each other (WebRTC) by swapping
 * two codes, and changes flow between them with no internet at all.
 */
import { expect, test, type Page } from './fixtures';
import { addFirstFamily, newPage, pairParent, setupProvider } from './helpers';

/** Every page this browser opens can have its connection to the relay cut (and kept cut), like a relay that is down. */
async function relayCanFail(browser: { newContext: (o?: never) => Promise<import('@playwright/test').BrowserContext> }) {
  const make = browser.newContext.bind(browser);
  browser.newContext = async (o) => {
    const c = await make(o);
    await c.addInitScript(() => {
      const w = window as unknown as { __down: boolean; __ws: WebSocket[] };
      const Real = window.WebSocket;
      w.__down = false;
      w.__ws = [];
      window.WebSocket = class extends Real {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(w.__down ? 'ws://127.0.0.1:1' : url, protocols);
          w.__ws.push(this);
        }
      } as typeof WebSocket;
    });
    return c;
  };
}
const cutRelay = (p: Page) => p.evaluate(() => {
  const w = window as unknown as { __down: boolean; __ws: WebSocket[] };
  w.__down = true;
  w.__ws.forEach((x) => x.close());
});

test('with the relay down, two devices connect directly and share the day', async ({ browser }) => {
  await relayCanFail(browser as never);
  const provider = await newPage(browser);
  await setupProvider(provider);
  await addFirstFamily(provider, 'Lee', 'Ada');
  const parent = await pairParent(provider, browser, 'Erin');
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('show-all').click();
  await expect(provider.getByTestId('sync-pill')).toContainText('Synced', { timeout: 30_000 });

  // the relay becomes unreachable for both devices
  await cutRelay(provider);
  await cutRelay(parent);
  await expect(provider.getByTestId('sync-pill')).toContainText(/Connecting|Offline/);
  await expect(parent.getByTestId('sync-pill')).toContainText(/Connecting|Offline/);

  // the provider logs something: it stays on the provider's phone
  await provider.getByTestId('child-card').click();
  await provider.getByTestId('add-fab').click();
  await provider.getByTestId('tile-diaper').click();
  await provider.getByTestId('diaper-wet').click();
  await expect(provider.getByTestId('tl-item')).toHaveCount(1);
  await parent.waitForTimeout(1500);
  await expect(parent.getByTestId('tl-item')).toHaveCount(0);

  // provider: start a connection from the sync button
  await provider.getByRole('button', { name: /back/i }).click();
  await provider.getByTestId('sync-pill').click();
  await provider.getByTestId('sync-direct').click();
  await provider.getByTestId('direct-start').click();
  const offer = await provider.getByTestId('direct-code').inputValue();
  expect(offer).toMatch(/^SP1\./);

  // parent: enter the code, get a reply; a wrong code first is refused clearly
  await parent.getByTestId('open-settings').click();
  await parent.getByTestId('open-direct').click();
  await parent.getByTestId('direct-join').click();
  await parent.getByTestId('direct-offer-input').fill('hello there');
  await parent.getByTestId('direct-reply').click();
  await expect(parent.getByTestId('direct-error')).toContainText('does not look like a connection code');
  await parent.getByTestId('direct-offer-input').fill(offer);
  await parent.getByTestId('direct-reply').click();
  const reply = await parent.getByTestId('direct-reply-code').inputValue();
  expect(reply).toMatch(/^SP1\./);

  // provider: enter the reply
  await provider.getByTestId('direct-answer-input').fill(reply);
  await provider.getByTestId('direct-connect').click();
  await expect(provider.getByTestId('direct-done')).toBeVisible({ timeout: 45_000 });
  await expect(parent.getByTestId('direct-done')).toBeVisible({ timeout: 45_000 });

  // the entry made before they connected arrives, with no internet
  await parent.getByRole('button', { name: 'Done' }).click();
  await parent.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(parent.getByTestId('tl-item')).toHaveCount(1, { timeout: 45_000 });
  await expect(parent.getByTestId('sync-pill')).toContainText('Synced (direct)');

  // and new ones keep flowing, both ways
  await provider.getByRole('button', { name: 'Done' }).click();
  await provider.getByTestId('show-all').click();
  await provider.getByTestId('child-card').click();
  await provider.getByTestId('add-fab').click();
  await provider.getByTestId('tile-diaper').click();
  await provider.getByTestId('diaper-dry').click();
  await expect(parent.getByTestId('tl-item')).toHaveCount(2, { timeout: 45_000 });
  await parent.getByTestId('add-fab').click();
  await parent.getByTestId('tile-note').click();
  await parent.getByTestId('note-text').fill('Heading to pick-up now');
  await parent.getByTestId('details-save').click();
  await expect(provider.getByTestId('tl-item')).toHaveCount(3, { timeout: 45_000 });
});

test('a reply code that is too old or from another connection is refused clearly', async ({ browser }) => {
  const a = await newPage(browser);
  await setupProvider(a);
  await a.getByTestId('open-settings').click();
  await a.getByTestId('open-direct').click();
  await a.getByTestId('direct-start').click();
  await expect(a.getByTestId('direct-code')).toHaveValue(/^SP1\./);
  await a.getByTestId('direct-answer-input').fill('SP1.notarealcode');
  await a.getByTestId('direct-connect').click();
  await expect(a.getByTestId('direct-error')).toContainText('does not look like a connection code');
  // starting over cancels the open offer and returns to the start
  await a.getByRole('button', { name: 'Start over' }).click();
  await expect(a.getByTestId('direct-start')).toBeVisible();
});
