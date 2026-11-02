import { chromium, devices } from '@playwright/test';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], browserName: 'chromium' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Experiment library' }).first().click();
await page.waitForTimeout(400);
await page.locator('.compare-card', { hasText: 'LDR circuit' }).first().getByRole('button', { name: 'Open' }).click();
await page.waitForTimeout(1000);
await page.getByRole('button', { name: 'Show values' }).click();
await page.waitForTimeout(600);
const boxes = await page.evaluate(() => {
  const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  return { host: rect('.canvas-host'), stage: rect('.mobile-stage'), topbar: rect('.mobile-topbar'), tabbar: rect('.mobile-tabbar'), toolbar: rect('.stage-overlay-top'), chips: document.querySelectorAll('.value-chip').length, overflow: document.documentElement.scrollWidth <= window.innerWidth };
});
console.log(JSON.stringify(boxes));
await page.screenshot({ path: '/tmp/mobile-float.png' });
// drag the canvas in the topbar gap and check view changes
const before = await page.getByTestId('circuit-state').getAttribute('data-view-x');
await page.mouse.move(120, 80); await page.mouse.down(); await page.mouse.move(160, 100, { steps: 6 }); await page.mouse.up();
await page.waitForTimeout(300);
const after = await page.getByTestId('circuit-state').getAttribute('data-view-x');
console.log('drag in topbar gap', before !== after);
console.log('errors', errors.length, errors.slice(0, 3));
await browser.close();
