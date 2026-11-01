import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const state = (page: Page) => page.getByTestId('circuit-state');

async function loadExperiment(page: Page, name: string) {
  await page.getByRole('button', { name: /Experiment library/i }).first().click();
  const card = page.locator('.compare-card', { hasText: name }).first();
  await card.getByRole('button', { name: 'Open' }).click();
  await expect(state(page)).toHaveAttribute('data-experiment', /.+/);
  await page.waitForTimeout(600);
}

async function setRange(page: Page, locator: ReturnType<Page['locator']>, value: string) {
  await locator.evaluate(
    (el, next) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    value,
  );
}

async function canvasPoint(page: Page, worldX: number, worldY: number) {
  const view = await state(page).evaluate((el) => ({
    x: Number(el.getAttribute('data-view-x')),
    y: Number(el.getAttribute('data-view-y')),
    zoom: Number(el.getAttribute('data-zoom')),
  }));
  const box = await page.locator('.canvas-host').first().boundingBox();
  return {
    x: (box?.x ?? 0) + view.x + worldX * view.zoom,
    y: (box?.y ?? 0) + view.y + worldY * view.zoom,
  };
}

test.describe('CircuitLab desktop', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'desktop layout only');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('circuit-state')).toBeAttached();
    await expect(page.locator('.brand-title').first()).toHaveText('CircuitLab');
  });

  test('solves the LDR series circuit and explains the light change', async ({ page }) => {
    await loadExperiment(page, 'LDR circuit');
    const s = state(page);
    await expect(s).toHaveAttribute('data-components', '5');
    await expect(s).toHaveAttribute('data-status', 'ok');
    expect(Number(await s.getAttribute('data-resistance'))).toBeCloseTo(12, 3);

    await page.getByRole('button', { name: /Increase light/i }).first().click();
    await expect(s).toHaveAttribute('data-has-baseline', 'true');
    expect(Number(await s.getAttribute('data-resistance'))).toBeCloseTo(6, 2);

    const rail = page.locator('.rail-body');
    await expect(rail.getByText('LDR in series with a fixed resistor')).toBeVisible();
    await expect(rail.getByText(/8\.00 Ω to 2\.00 Ω/).first()).toBeVisible();
    await expect(rail.getByText(/4\.00 V to 8\.00 V/).first()).toBeVisible();
    await expect(rail.getByText(/total resistance falls from 12\.00 Ω to 6\.00 Ω/).first()).toBeVisible();
    await expect(s).toHaveAttribute('data-highlight', /\w+/);
  });

  test('gives the parallel explanation, not the series one', async ({ page }) => {
    await loadExperiment(page, 'LDR in parallel');
    await page.getByRole('button', { name: /Increase light/i }).first().click();
    const rail = page.locator('.rail-body');
    await expect(rail.getByText('LDR in parallel with a fixed resistor')).toBeVisible();
    await expect(rail.getByText(/stays at 12\.00 V/).first()).toBeVisible();
    await expect(rail.getByText(/stays at 3\.00 A/).first()).toBeVisible();
    await expect(rail.getByText(/4\.50 A to 9\.00 A/).first()).toBeVisible();
    await expect(rail.getByText(/in series with a fixed resistor/)).toHaveCount(0);
    expect(Number(await state(page).getAttribute('data-resistance'))).toBeCloseTo(12 / 9, 3);
  });

  test('keeps the circuit and the physics when switching visual mode', async ({ page }) => {
    await loadExperiment(page, 'LDR circuit');
    const s = state(page);
    const before = await s.getAttribute('data-resistance');
    await page.getByRole('tab', { name: 'Realistic' }).click();
    await expect(s).toHaveAttribute('data-view-mode', 'realistic');
    await expect(s).toHaveAttribute('data-components', '5');
    expect(await s.getAttribute('data-resistance')).toBe(before);
    await expect(page.locator('.canvas-host canvas').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Schematic' }).click();
    await expect(s).toHaveAttribute('data-view-mode', 'schematic');
  });

  test('switches to Chinese and keeps the same physical conclusion', async ({ page }) => {
    await loadExperiment(page, 'LDR circuit');
    await page.getByRole('button', { name: /Increase light/i }).first().click();
    await page.getByRole('tab', { name: '中文' }).click();
    await expect(state(page)).toHaveAttribute('data-language', 'zh');
    const rail = page.locator('.rail-body');
    await expect(rail.getByText('LDR 与定值电阻串联')).toBeVisible();
    await expect(rail.getByText(/由 8\.00 Ω 降低到 2\.00 Ω/).first()).toBeVisible();
    await expect(rail.getByText(/由 4\.00 V 增大到 8\.00 V/).first()).toBeVisible();
  });

  test('adds, edits, and deletes a component', async ({ page }) => {
    const s = state(page);
    await page.locator('.palette-item', { hasText: 'Resistor' }).first().click();
    await expect(s).toHaveAttribute('data-components', '1');
    const rail = page.locator('.rail-body');
    await expect(rail.getByText('Resistance').first()).toBeVisible();
    const slider = rail.locator('input[type="range"]').first();
    await setRange(page, slider, '50');
    await expect(rail.getByText('50.0 Ω').first()).toBeVisible();
    await page.locator('.rail-body').click({ position: { x: 8, y: 8 } });
    await page.keyboard.press('Delete');
    await expect(s).toHaveAttribute('data-components', '0');
  });

  test('saves to IndexedDB and reloads after a page refresh', async ({ page }) => {
    await loadExperiment(page, 'LDR circuit');
    await page.getByRole('button', { name: 'Save', exact: true }).first().click();
    await expect(page.getByText('Circuit saved locally')).toBeVisible();
    await page.getByRole('button', { name: 'Saved circuits' }).first().click();
    await expect(page.getByText('LDR circuit').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(state(page)).toHaveAttribute('data-components', '0');
    await page.getByRole('button', { name: 'Saved circuits' }).first().click();
    await page.getByRole('button', { name: 'Open', exact: true }).first().click();
    await expect(state(page)).toHaveAttribute('data-components', '5');
    await expect(page.getByText('Circuit loaded')).toBeVisible();
  });

  test('guided mode checks each step of the chain', async ({ page }) => {
    await loadExperiment(page, 'LDR circuit');
    await page.getByRole('button', { name: /Increase light/i }).first().click();
    await page.getByRole('tab', { name: 'Guided' }).first().click();
    const rail = page.locator('.rail-body');
    await expect(rail.getByText(/What happens to the resistance of the sensor/)).toBeVisible();
    const firstCard = rail.locator('.compare-card').first();
    await firstCard.getByRole('button', { name: 'Decreases' }).click();
    await expect(firstCard.getByText('Correct')).toBeVisible();
    await expect(rail.getByText('1/6')).toBeVisible();
    const secondCard = rail.locator('.compare-card').nth(1);
    await secondCard.getByRole('button', { name: 'Increases' }).click();
    await expect(secondCard.getByText('Not quite')).toBeVisible();
  });

  test('renders real charts and exports recorded data as CSV', async ({ page }) => {
    await loadExperiment(page, "Ohm's law");
    const dock = page.locator('.bottom-dock');
    await expect(dock).toBeVisible();
    await expect(dock.locator('canvas')).toHaveCount(1, { timeout: 15_000 });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dock.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('circuitlab-data.csv');
  });

  test('offers English, Chinese and bilingual options that switch live', async ({ page }) => {
    for (const label of ['EN', '中文', 'EN/中']) {
      await expect(page.getByRole('tab', { name: label, exact: true })).toBeVisible();
    }
    await page.getByRole('tab', { name: 'EN/中' }).click();
    await expect(state(page)).toHaveAttribute('data-language', 'bilingual');
    await expect(page.locator('.rail-tab').first()).toContainText(' · ');
    await page.getByRole('tab', { name: 'EN', exact: true }).click();
    await expect(state(page)).toHaveAttribute('data-language', 'en');
  });

  test('pins the explanation panel so it stays visible', async ({ page }) => {
    await loadExperiment(page, 'LDR circuit');
    await page.getByRole('button', { name: /Increase light/i }).first().click();
    await page.getByRole('button', { name: 'Keep explanation visible' }).click();
    const pane = page.locator('.rail-pane-explain');
    await expect(pane).toBeVisible();
    await expect(pane.getByText('LDR in series with a fixed resistor')).toBeVisible();
    await pane.getByRole('button', { name: 'Stop keeping explanation visible' }).click();
    await expect(page.locator('.rail-pane-explain')).toHaveCount(0);
  });

  test('models internal resistance visually and numerically', async ({ page }) => {
    await loadExperiment(page, 'Internal resistance');
    const point = await canvasPoint(page, 140, 260);
    await page.mouse.click(point.x, point.y);
    await expect(page.getByText('Lost volts (I·r)').first()).toBeVisible();
    await expect(page.getByText('0.50 Ω').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Realistic' }).click();
    await expect(state(page)).toHaveAttribute('data-view-mode', 'realistic');
    await expect(page.getByText('5.00 V').first()).toBeVisible();
  });

  test('rejects redundant wires and lets a wire be selected and deleted', async ({ page }) => {
    await loadExperiment(page, 'LDR circuit');
    await expect(state(page)).toHaveAttribute('data-wires', '6');
    // LDR1.a and E1.pos are already connected, so a second wire must be refused.
    const ldrA = await canvasPoint(page, 348, 260);
    const cellPos = await canvasPoint(page, 192, 260);
    await page.mouse.click(ldrA.x, ldrA.y);
    await page.mouse.click(cellPos.x, cellPos.y);
    await expect(page.getByText('These terminals are already connected.')).toBeVisible();
    await expect(state(page)).toHaveAttribute('data-wires', '6');
    // Click the existing wire between them and delete it.
    const onWire = await canvasPoint(page, 270, 260);
    await page.mouse.click(onWire.x, onWire.y);
    await page.keyboard.press('Delete');
    await expect(state(page)).toHaveAttribute('data-wires', '5');
  });

  test('lets a wire be dragged and reset to its automatic route', async ({ page }) => {
    await loadExperiment(page, 'LDR circuit');
    const onWire = await canvasPoint(page, 270, 260);
    await page.mouse.click(onWire.x, onWire.y);
    await expect(state(page)).toHaveAttribute('data-wire-route', 'auto');
    await page.mouse.move(onWire.x, onWire.y);
    await page.mouse.down();
    await page.mouse.move(onWire.x, onWire.y - 40, { steps: 8 });
    await page.mouse.up();
    await expect(state(page)).toHaveAttribute('data-wire-route', 'manual');
    await page.getByRole('button', { name: 'Reset route' }).click();
    await expect(state(page)).toHaveAttribute('data-wire-route', 'auto');
    await page.keyboard.press('Delete');
    await expect(state(page)).toHaveAttribute('data-wires', '5');
  });

  test('distinguishes the two- and three-terminal variable components', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Adjustable resistor' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Sliding rheostat' }).first().click();
    await expect(state(page)).toHaveAttribute('data-components', '1');
    await expect(page.getByText('Wiper position (from B)')).toBeVisible();
    await expect(page.getByText('Three-terminal sliding rheostat')).toBeVisible();
  });

  test('shows live component values beside the symbols', async ({ page }) => {
    await loadExperiment(page, 'LDR circuit');
    await expect(state(page)).toHaveAttribute('data-show-values', 'false');
    await page.getByRole('button', { name: 'Settings' }).click();
    const settings = page.locator('.settings-popover');
    await expect(settings).toBeVisible();
    await settings.getByRole('switch', { name: 'Show values' }).click();
    await expect(state(page)).toHaveAttribute('data-show-values', 'true');
    await expect(page.getByRole('button', { name: 'Show values' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.value-chip')).toHaveCount(3);
    const glass = await page.locator('.value-chip').first().evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(glass).toContain('blur');
    await page.keyboard.press('Escape');
    await expect(settings).toHaveCount(0);
  });

  test('switches between the light and dark glass themes', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: 'Light' }).click();
    await expect(page.locator('html')).toHaveClass(/light/);
    await page.getByRole('tab', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.keyboard.press('Escape');
  });

  test('gives liquid-glass press feedback and a frosted dock', async ({ page }) => {
    await loadExperiment(page, 'Internal resistance');
    const dock = page.locator('.bottom-dock');
    await expect(dock).toBeVisible();
    const frost = await dock.evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(frost).toContain('blur');

    const tab = page.getByRole('tab', { name: 'Measurements' });
    const box = await tab.boundingBox();
    if (!box) throw new Error('Measurements tab not visible');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(tab).toHaveClass(/is-liquid-pressed/);
    await expect(page.locator('.liquid-ripple')).toHaveCount(1);
    await page.mouse.up();
    await expect(page.locator('.liquid-ripple')).toHaveCount(0, { timeout: 2500 });
  });

  test('shows the internal-resistance fit and the RC time constant', async ({ page }) => {
    await loadExperiment(page, 'Internal resistance');
    const dock = page.locator('.bottom-dock');
    await expect(dock.getByText(/Gradient/)).toBeVisible();
    await expect(dock.getByText(/Intercept/)).toBeVisible();
    await expect(dock.locator('canvas')).toHaveCount(1, { timeout: 15_000 });

    await loadExperiment(page, 'Capacitor charging');
    await expect(page.locator('.bottom-dock').getByText(/τ = 4\.70 s/).first()).toBeVisible();
  });
});
