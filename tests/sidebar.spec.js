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

test('footer shows the last deploy time from deployed.json, small, next to the version', async ({ page }) => {
  await page.route(/\/api\//, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(/\/deployed\.json/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deployedAt: '2026-11-16T18:44:00Z', commit: 'abc1234', version: '3.160.0' }) }),
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'load' });
  const stamp = page.locator('#sidebarFooter .sb-updated');
  await expect(stamp).toHaveText(/^updated Nov 16, /);
  await expect(stamp).toHaveAttribute('title', /Last deployed .*\(commit abc1234\)/);
  const size = await stamp.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeLessThan(11);
});
