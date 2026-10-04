const { test, expect } = require('@playwright/test');

/*
 * "Include my installed software" (#askIncludeInventoryBtn, next to
 * #askContext): fills the Ask context textarea with the visitor's own
 * Installed versions inventory as "Name: Version" lines - the exact
 * format releasetrain-server's parseTriageComponentsFromContext parses
 * back out of `context` for the 'triage' question intent (see
 * runTriageIntentAsk in ask.js), so a typed question like "How should I
 * order updates for stability?" can carry real components to triage.
 */

async function stubApi(page) {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
}

test('the button is hidden with no inventory, and appears once one exists', async ({ page }) => {
  await stubApi(page);
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#askForm')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#askIncludeInventoryBtn')).toBeHidden();

  await page.evaluate(() => {
    localStorage.setItem(
      'rt_inventory',
      JSON.stringify([{ component: 'Firefox', version: '100.0', machine: 'work-laptop' }]),
    );
    refreshAskInventoryShortcuts();
  });
  await expect(page.locator('#askIncludeInventoryBtn')).toBeVisible();
});

test('clicking the button fills #askContext with "Name: Version" lines, deduped across machines', async ({
  page,
}) => {
  await stubApi(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      'rt_inventory',
      JSON.stringify([
        { component: 'Firefox', version: '100.0', machine: 'work-laptop' },
        { component: 'OpenSSL', version: '1.1.0', machine: 'work-laptop' },
        { component: 'Firefox', version: '100.0', machine: 'home-pc' }, // duplicate across machines
      ]),
    );
  });
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#askForm')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#askIncludeInventoryBtn')).toBeVisible();

  await page.locator('#askIncludeInventoryBtn').click();
  const value = await page.locator('#askContext').inputValue();
  expect(value.split('\n')).toEqual(['Firefox: 100.0', 'OpenSSL: 1.1.0']);
});
