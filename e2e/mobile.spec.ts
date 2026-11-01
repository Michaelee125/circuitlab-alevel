import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const state = (page: Page) => page.getByTestId('circuit-state');

test.describe('CircuitLab mobile', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 900, 'mobile layout only');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(state(page)).toBeAttached();
    await expect(page.locator('.mobile-tabbar')).toBeVisible();
  });

  test('has no horizontal overflow and usable touch targets', async ({ page }) => {
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);

    const tabs = page.locator('.mobile-tab');
    await expect(tabs).toHaveCount(5);
    const firstBox = await tabs.first().boundingBox();
    expect(firstBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(page.locator('.canvas-host canvas').first()).toBeVisible();
  });

  test('adds a component from the sheet and edits it', async ({ page }) => {
    await page.getByRole('button', { name: 'Components' }).click();
    await expect(page.locator('.sheet')).toBeVisible();
    await page.locator('.palette-item', { hasText: 'Resistor' }).first().click();
    await expect(state(page)).toHaveAttribute('data-components', '1');
    await page.getByRole('button', { name: 'Properties' }).click();
    await expect(page.locator('.sheet').getByText('Resistance').first()).toBeVisible();
    await expect(page.locator('.sheet input[type="range"]').first()).toBeVisible();
  });

  test('loads an experiment, changes light, and reads the explanation', async ({ page }) => {
    await page.locator('.mobile-topbar').getByRole('button', { name: 'Experiment library' }).click();
    const card = page.locator('.compare-card', { hasText: 'LDR circuit' }).first();
    await card.getByRole('button', { name: 'Open' }).click();
    await expect(state(page)).toHaveAttribute('data-experiment', 'ldr-circuit');
    await expect(state(page)).toHaveAttribute('data-components', '5');
    await page.getByRole('button', { name: 'Explain' }).click();
    const sheet = page.locator('.sheet');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: /Increase light/i }).first().click();
    await expect(sheet.getByText('LDR in series with a fixed resistor')).toBeVisible();
    expect(Number(await state(page).getAttribute('data-resistance'))).toBeCloseTo(6, 2);
    await page.screenshot({ path: 'test-results/mobile-explain.png' });
  });

  test('selects a component by touch and opens its properties', async ({ page }) => {
    await page.locator('.mobile-topbar').getByRole('button', { name: 'Experiment library' }).click();
    await page
      .locator('.compare-card', { hasText: 'LDR circuit' })
      .first()
      .getByRole('button', { name: 'Open' })
      .click();
    await page.waitForTimeout(800);
    const view = await state(page).evaluate((el) => ({
      x: Number(el.getAttribute('data-view-x')),
      y: Number(el.getAttribute('data-view-y')),
      zoom: Number(el.getAttribute('data-zoom')),
    }));
    const host = page.locator('.canvas-host').first();
    const box = await host.boundingBox();
    expect(box).not.toBeNull();
    // The cell of the LDR experiment is placed at world (140, 260).
    const x = (box?.x ?? 0) + view.x + 140 * view.zoom;
    const y = (box?.y ?? 0) + view.y + 260 * view.zoom;
    await page.touchscreen.tap(x, y);
    const sheet = page.locator('.sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('EMF').first()).toBeVisible();
    await expect(sheet.getByText(/Cell/).first()).toBeVisible();
  });

  test('switches language and visual mode on touch', async ({ page }) => {
    await page.getByRole('tab', { name: 'Realistic' }).click();
    await expect(state(page)).toHaveAttribute('data-view-mode', 'realistic');
    await page.getByRole('tab', { name: 'Schematic' }).click();
    await expect(state(page)).toHaveAttribute('data-view-mode', 'schematic');
    await page.getByRole('button', { name: 'Language' }).click();
    await expect(state(page)).toHaveAttribute('data-language', 'zh');
    await expect(page.locator('.mobile-tab').first()).toContainText('元件库');
  });

  test('opens the graph sheet with a real chart', async ({ page }) => {
    await page.locator('.mobile-topbar').getByRole('button', { name: 'Experiment library' }).click();
    await page
      .locator('.compare-card', { hasText: "Ohm's law" })
      .first()
      .getByRole('button', { name: 'Open' })
      .click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Graph' }).click();
    const sheet = page.locator('.sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('canvas')).toHaveCount(1, { timeout: 15_000 });
  });
});
