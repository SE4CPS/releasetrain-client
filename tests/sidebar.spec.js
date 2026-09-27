const { test, expect } = require('@playwright/test');

async function stub(page) {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
}

for (const width of [1024, 1300]) {
  test(`sidebar collapses to a rail and back at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await stub(page);
    await page.goto('/');
    const btn = page.locator('#sidebarCollapseBtn');
    const sidebar = page.locator('#sidebar');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    const openW = (await sidebar.boundingBox()).width;
    const mainOpen = (await page.locator('.layout').first().boundingBox()).width;
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toHaveAttribute('aria-label', 'Expand sidebar');
    await page.waitForTimeout(400);
    expect((await sidebar.boundingBox()).width).toBeLessThan(openW - 200);
    expect((await page.locator('.layout').first().boundingBox()).width).toBeGreaterThan(
      mainOpen + 200,
    );
    await expect(page.locator('#authStatusDot')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.reload();
    await expect(page.locator('#sidebarCollapseBtn')).toHaveAttribute('aria-expanded', 'false');
    await page.locator('#sidebarCollapseBtn').click();
    await expect(page.locator('#sidebarCollapseBtn')).toHaveAttribute('aria-expanded', 'true');
  });
}

test('phone and tablet keep the drawer, no collapse toggle', async ({ page }) => {
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 800 });
    await stub(page);
    await page.goto('/');
    await expect(page.locator('#sidebarCollapseBtn')).toBeHidden();
    await expect(page.locator('#navToggle')).toBeVisible();
  }
});
