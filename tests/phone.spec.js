const { test, expect } = require('@playwright/test');

/* Phones get the Recent updates feed only: nothing about Ask or agentic AI. */

test.use({ viewport: { width: 390, height: 800 } });

test('phone opens on the feed and hides the Ask UI', async ({ page }) => {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/');
  await expect(page).toHaveURL(/view=feed/);
  await expect(page.locator('#feedPanel')).toBeVisible();
  for (const id of ['askForm', 'askWorkflowTop', 'homeLink', 'ackLink', 'changelogLink']) {
    await expect(page.locator(`#${id}`)).toBeHidden();
  }
});
