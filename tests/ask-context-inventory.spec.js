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

// Reported live, with a screenshot: this button (and the per-machine
// triage prompts in triage.spec.js) kept showing a real signed-in
// account's own machine/software inventory to a signed-OUT visitor on
// the same browser - a real privacy leak, not just stale-cache
// cosmetics. Both now require an actual signed-in session
// (uaSignedIn() in ask-rail.js), not just cached inventory data, so
// every test below signs in first.
async function signIn(page) {
  await page.addInitScript(() => {
    localStorage.setItem('rt_token', 't');
    localStorage.setItem(
      'rt_user',
      JSON.stringify({ id: '1', email: 'a@example.com', name: 'A', role: 'user', orgs: [] }),
    );
  });
}

test('the button is hidden with no inventory, and appears once one exists', async ({ page }) => {
  await stubApi(page);
  await signIn(page);
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

test('the button stays hidden with real inventory data when signed out', async ({ page }) => {
  await stubApi(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      'rt_inventory',
      JSON.stringify([{ component: 'Firefox', version: '100.0', machine: 'work-laptop' }]),
    );
  });
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#askForm')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#askIncludeInventoryBtn')).toBeHidden();
});

test('clicking the button fills #askContext with "Name: Version" lines, deduped across machines', async ({
  page,
}) => {
  await stubApi(page);
  await signIn(page);
  const seededInventory = [
    { component: 'Firefox', version: '100.0', machine: 'work-laptop' },
    { component: 'OpenSSL', version: '1.1.0', machine: 'work-laptop' },
    { component: 'Firefox', version: '100.0', machine: 'home-pc' }, // duplicate across machines
  ];
  // The click handler refreshes from the server first when signed in
  // (uaLoadInventoryFromServer, GET users/me) - stub that specific
  // route to echo the seeded inventory back, same shape the real
  // endpoint returns, so this refresh doesn't silently overwrite the
  // fixture with stubApi's generic empty-array response.
  await page.route(/\/api\/users\/me(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: '1', inventory: seededInventory }),
    }),
  );
  await page.addInitScript((inv) => {
    localStorage.setItem('rt_inventory', JSON.stringify(inv));
  }, seededInventory);
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#askForm')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#askIncludeInventoryBtn')).toBeVisible();

  await page.locator('#askIncludeInventoryBtn').click();
  // The click handler awaits a real server round-trip (uaLoadInventoryFromServer)
  // before filling #askContext - toHaveValue auto-retries instead of racing
  // a single inputValue() read against that in-flight request.
  await expect(page.locator('#askContext')).toHaveValue('Firefox: 100.0\nOpenSSL: 1.1.0');
});
