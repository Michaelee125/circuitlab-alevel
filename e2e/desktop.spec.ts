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

  test('marks an exam answer against the software-authored points', async ({ page }) => {
    await page.getByRole('tab', { name: 'Exam' }).first().click();
    const select = page.getByLabel('Choose a question');
    await select.selectOption({ label: 'EMF and internal resistance' });
    const answer =
      'R_total = 2.5 + 0.50 = 3.0 Ω. I = EMF / R_total = 6.0 / 3.0 = 2.0 A. The lost volts are I × r = 2.0 × 0.50 = 1.0 V. The terminal p.d. is 6.0 − 1.0 = 5.0 V.';
    await page.locator('textarea').fill(answer);
    await page.getByRole('button', { name: 'Mark my answer' }).click();
    await expect(page.getByText('4 / 4')).toBeVisible();
    await page.locator('textarea').fill('I am not sure.');
    await page.getByRole('button', { name: 'Mark my answer' }).click();
    await expect(page.getByText('0 / 4')).toBeVisible();
    await expect(page.getByText(/not an official mark scheme/i)).toBeVisible();
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
