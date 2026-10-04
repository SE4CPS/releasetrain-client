const { test, expect } = require('@playwright/test');

/*
 * Update Triage is no longer its own view (see git history for
 * triage.js/#triageView, removed once the server grew a real 'triage'
 * question intent - runTriageIntentAsk in releasetrain-server's ask.js).
 * Asking is now just the normal Ask box: a typed ordering question (e.g.
 * "How should I order updates for stability?") plus a component list
 * attached via #askContext. This spec covers the one-click shortcut to
 * that: #triageDemoQList's "Prioritize <machine>'s updates by <mode>"
 * buttons, built from the visitor's own Installed versions inventory
 * (renderTriageDemoButtons in ask-rail.js) - see
 * ask-context-inventory.spec.js for the companion
 * #askIncludeInventoryBtn/#askContext coverage.
 */

async function stubApi(page) {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
}

test('no prompts render with no inventory', async ({ page }) => {
  await stubApi(page);
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#askForm')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#triageDemoQList .demo-q-btn')).toHaveCount(0);
});

test('one machine renders exactly a stability and a security prompt, capped at 2 machines', async ({
  page,
}) => {
  await stubApi(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      'rt_inventory',
      JSON.stringify([
        { component: 'Firefox', version: '100.0', machine: 'work-laptop' },
        { component: 'OpenSSL', version: '1.1.0', machine: 'work-laptop' },
        { component: 'Node', version: '18.0.0', machine: 'home-pc' },
        { component: 'Docker', version: '24.0.0', machine: 'build-server' },
      ]),
    );
  });
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#askForm')).toBeVisible({ timeout: 20_000 });

  // 3 real machines above, capped at 2 x (stability, security) = 4
  // buttons, not 6 - which 2 of the 3 survive isn't the contract (no
  // ordering guarantee is made or needed), only the cap itself.
  await expect(page.locator('#triageDemoQList .demo-q-btn')).toHaveCount(4);
  const text = await page.locator('#triageDemoQList').innerText();
  const machineNames = new Set(
    (text.match(/Prioritize (\S+)'s/g) || []).map((m) =>
      m.replace(/^Prioritize /, '').replace(/'s$/, ''),
    ),
  );
  expect(machineNames.size).toBe(2);
});

test("clicking a prompt fills the question and that machine's own components into context", async ({
  page,
}) => {
  await stubApi(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      'rt_inventory',
      JSON.stringify([
        { component: 'Firefox', version: '100.0', machine: 'work-laptop' },
        { component: 'Node', version: '18.0.0', machine: 'home-pc' },
      ]),
    );
  });
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#askForm')).toBeVisible({ timeout: 20_000 });

  await page
    .locator('#triageDemoQList .demo-q-btn', { hasText: "work-laptop's updates by stability" })
    .click();
  await expect(page.locator('#askQuestion')).toHaveValue(
    "Prioritize work-laptop's updates by stability",
  );
  const context = await page.locator('#askContext').inputValue();
  expect(context).toBe('Firefox: 100.0');
});
