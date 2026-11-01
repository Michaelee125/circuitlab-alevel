import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const tab = page.getByRole('tab', { name: 'Realistic' });
const b = await tab.boundingBox();
for (const t of [60, 140, 240, 400]) {
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.waitForTimeout(t);
  await page.screenshot({ path: `/tmp/rip-${t}.png`, clip: { x: 300, y: 80, width: 420, height: 80 } });
  await page.mouse.up();
  await page.waitForTimeout(400);
}
await browser.close();
