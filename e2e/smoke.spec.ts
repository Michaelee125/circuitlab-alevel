import { test, expect } from '@playwright/test';

/**
 * Deployment smoke test. Run against the public GitHub Pages URL:
 *   BASE_URL=https://michaelee125.github.io/circuitlab-alevel/ pnpm exec playwright test e2e/smoke.spec.ts
 * The baseURL comes from Playwright's config when run locally; set BASE_URL to
 * override it for the deployed site.
 */
test.describe('deployed smoke test', () => {
  test('boots, renders WebGL and solves an experiment', async ({ page }) => {
    await page.goto(process.env.BASE_URL ?? '/', { waitUntil: 'networkidle' });
    await expect(page.locator('.brand-title').first()).toHaveText('CircuitLab');
    await expect(page.locator('.canvas-host canvas').first()).toBeVisible();
    const state = page.getByTestId('circuit-state');
    await expect(state).toHaveAttribute('data-status', 'empty');

    await page.getByRole('button', { name: /Experiment library/i }).first().click();
    await page.locator('.compare-card', { hasText: 'LDR circuit' }).first().getByRole('button', { name: 'Open' }).click();
    await expect(state).toHaveAttribute('data-status', 'ok');
    await expect(state).toHaveAttribute('data-components', '5');
  });
});
