import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.getByRole('button', { name: /Experiment library/i }).first().click();
await page.locator('.compare-card', { hasText: 'Internal resistance' }).first().getByRole('button', { name: 'Open' }).click();
await page.waitForTimeout(1800);
const info = await page.evaluate(() => {
  const s = document.querySelector('[data-testid="circuit-state"]');
  const host = document.querySelector('.canvas-host');
  const canvas = host?.querySelector('canvas');
  const dock = document.querySelector('.bottom-dock');
  return {
    view: s ? { x: s.getAttribute('data-view-x'), y: s.getAttribute('data-view-y'), zoom: s.getAttribute('data-zoom') } : null,
    host: host ? host.getBoundingClientRect().toJSON() : null,
    canvasCss: canvas ? canvas.getBoundingClientRect().toJSON() : null,
    canvasPx: canvas ? { w: canvas.width, h: canvas.height } : null,
    dock: dock ? dock.getBoundingClientRect().toJSON() : null,
  };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: '/tmp/diag-dockopen.png' });
// close the dock via the chart toggle
await page.getByRole('button', { name: /Graph|Chart/i }).first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: '/tmp/diag-dockclosed.png' });
await browser.close();
