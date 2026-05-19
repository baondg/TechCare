import { test, expect } from '@playwright/test';

test.describe('smoke', () => {
  test('home page loads with root mount', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();
  });
});