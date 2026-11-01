import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}/`;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // Device emulation (viewport, DPR, touch) runs on Chromium in CI because
      // headless WebKit is not part of the installed browser set. Real-device
      // Safari/WebKit testing remains a manual Phase 2 item.
      name: 'iphone-13',
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
    {
      name: 'pixel-7',
      use: { ...devices['Pixel 7'], browserName: 'chromium' },
    },
    {
      name: 'ipad',
      use: { ...devices['iPad (gen 7)'], browserName: 'chromium' },
    },
  ],
  webServer: {
    command: `pnpm --filter @circuitlab/web build && pnpm --filter @circuitlab/web preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
