import { defineConfig } from '@playwright/test';

// Runs against the production build (`npm run build` first) and a real relay, like a phone would.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4180', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'npm run relay', port: 8787, reuseExistingServer: true, timeout: 60_000, stdout: 'ignore', stderr: 'pipe' },
    { command: 'node scripts/serve.mjs', url: 'http://localhost:4180', reuseExistingServer: true, timeout: 30_000 },
  ],
});
