const { test, expect } = require('@playwright/test');

async function stub(page) {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
}

for (const width of [1024, 1300]) {
  test(`sidebar starts as a rail, expands, and remembers the choice at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await stub(page);
    await page.goto('/');
    const btn = page.locator('#sidebarCollapseBtn');
    const sidebar = page.locator('#sidebar');
    await expect(btn).toBeVisible();
    // collapsed by default (2026-11-16): the rail, the status dot, no stamp
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toHaveAttribute('aria-label', 'Expand sidebar');
    await expect(page.locator('#authStatusDot')).toBeVisible();
    await expect(page.locator('#questionsDetails')).toBeHidden();
    const railW = (await sidebar.boundingBox()).width;
    const mainRail = (await page.locator('.layout').first().boundingBox()).width;
    expect(railW).toBeLessThan(100);
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(btn).toHaveAttribute('aria-label', 'Collapse sidebar');
    await page.waitForTimeout(400);
    expect((await sidebar.boundingBox()).width).toBeGreaterThan(railW + 200);
    expect((await page.locator('.layout').first().boundingBox()).width).toBeLessThan(
      mainRail - 200,
    );
    await expect(page.locator('#questionsDetails')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    // the choice to open it is remembered across a reload
    await page.reload();
    await expect(page.locator('#sidebarCollapseBtn')).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#sidebarCollapseBtn').click();
    await expect(page.locator('#sidebarCollapseBtn')).toHaveAttribute('aria-expanded', 'false');
    await page.reload();
    await expect(page.locator('#sidebarCollapseBtn')).toHaveAttribute('aria-expanded', 'false');
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

test('footer shows the last deploy time from deployed.json, small, next to the version', async ({
  page,
}) => {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route(/\/deployed\.json/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        deployedAt: '2026-11-16T18:44:00Z',
        commit: 'abc1234',
        version: '3.160.0',
      }),
    }),
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => localStorage.setItem('rt.sidebar', 'open')); // the stamp is hidden on the collapsed rail
  await page.goto('/', { waitUntil: 'load' });
  const stamp = page.locator('#sidebarFooter .sb-updated');
  await expect(stamp).toHaveText(/^updated Nov 16, \d{2}:\d{2} [A-Za-z0-9+\-:]+$/); // 24h clock + zone
  await expect(stamp).toHaveAttribute('title', /Last deployed .*\(commit abc1234\)/);
  // same small font as the version, stacked under it, nothing past the rail's right edge
  const sizes = await page.evaluate(() => [
    Number.parseFloat(getComputedStyle(document.querySelector('#sidebarFooter .sb-updated')).fontSize),
    Number.parseFloat(getComputedStyle(document.querySelector('#sidebarFooter .brand')).fontSize),
  ]);
  expect(sizes[0]).toBe(sizes[1]);
  expect(sizes[0]).toBeLessThanOrEqual(10);
  const [brandBox, stampBox, footerBox, signinBox] = await Promise.all([
    page.locator('#sidebarFooter .brand').boundingBox(),
    stamp.boundingBox(),
    page.locator('#sidebarFooter').boundingBox(),
    page.locator('#sidebarFooter .top-signin-btn').boundingBox(),
  ]);
  expect(stampBox.y).toBeGreaterThanOrEqual(brandBox.y + brandBox.height - 1);
  expect(signinBox.x + signinBox.width).toBeLessThanOrEqual(footerBox.x + footerBox.width + 0.5);
});
