const { test, expect } = require('@playwright/test');

/*
 * Update Triage: "here are my current installed software ... how would
 * you recommend updating them in which order? with reasoning", later
 * "optimized by stability, security, or both." Its own top-level view
 * (not a mode inside Arch anymore - see triage.js and the markup
 * comments on #triageView in index.html): pick a machine (from
 * Installed versions, see inventory.js), pick an optimization, click
 * Run Triage. That POSTs the picked machine's real {name, version}
 * components to POST /api/ask/triage and renders the sorted, reasoned
 * result - see tRunTriage/tRenderResult in triage.js.
 */

const INVENTORY = [
  { component: 'Firefox', version: '100.0', machine: 'work-laptop' },
  { component: 'OpenSSL', version: '1.1.0', machine: 'work-laptop' },
  { component: 'Node', version: '18.0.0', machine: 'home-pc' },
];

async function seedInventory(page, inventory = INVENTORY) {
  await page.addInitScript((inv) => {
    localStorage.setItem('rt_inventory', JSON.stringify(inv));
  }, inventory);
}

async function stubApi(page, { onTriage } = {}) {
  await page.route(/\/api\//, async (route) => {
    const url = route.request().url();
    if (/\/ask\/triage$/.test(url)) {
      if (onTriage) return onTriage(route);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

test("picking a machine and clicking Run Triage sends that machine's own components, sorted result renders", async ({
  page,
}) => {
  const triageResponse = {
    optimizeFor: 'both',
    results: [
      {
        name: 'Firefox',
        currentVersion: '100.0',
        latestVersion: '100.1',
        versionBump: 'patch',
        cve: null,
        order: 1,
        reasoning: 'Low-risk patch, safe to apply first.',
      },
      {
        name: 'OpenSSL',
        currentVersion: '1.1.0',
        latestVersion: '3.0.0',
        versionBump: 'major',
        cve: { id: 'CVE-2023-1234', summary: 'Buffer overflow' },
        order: 2,
        reasoning: 'Known CVE, but a major bump needs staged testing.',
      },
    ],
  };
  await seedInventory(page);
  await stubApi(page, {
    onTriage: (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(triageResponse),
      }),
  });
  await page.goto('/?view=triage', { waitUntil: 'load' });
  await expect(page.locator('#triageView')).toBeVisible({ timeout: 20_000 });

  const stackSelect = page.locator('#t-stackSelect');
  await expect(stackSelect.locator('option[value="work-laptop"]')).toHaveText('work-laptop (2)');
  await expect(stackSelect.locator('option[value="home-pc"]')).toHaveText('home-pc (1)');
  await stackSelect.selectOption('work-laptop');

  const [triageRequest] = await Promise.all([
    page.waitForRequest((req) => /\/ask\/triage$/.test(req.url()) && req.method() === 'POST'),
    page.locator('#t-runBtn').click(),
  ]);
  const sentBody = JSON.parse(triageRequest.postData());
  expect(sentBody.optimizeFor).toBe('both');
  expect(sentBody.components).toEqual([
    { name: 'Firefox', version: '100.0' },
    { name: 'OpenSSL', version: '1.1.0' },
  ]);

  const result = page.locator('#t-result');
  await expect(result.locator('table.a-drift')).toBeVisible();
  const rows = result.locator('table.a-drift tbody tr');
  await expect(rows).toHaveCount(2);
  // Order 1 (Firefox) renders before order 2 (OpenSSL), matching the
  // server's own already-sorted response, not re-sorted client-side.
  await expect(rows.nth(0)).toContainText('Firefox');
  await expect(rows.nth(0)).toContainText('Low-risk patch, safe to apply first.');
  await expect(rows.nth(1)).toContainText('OpenSSL');
  await expect(rows.nth(1)).toContainText('CVE-2023-1234');
  await expect(rows.nth(1)).toContainText('needs staged testing');
});

test('clicking Run Triage with no machine picked shows a plain message, no request sent', async ({
  page,
}) => {
  await seedInventory(page);
  let triageCalls = 0;
  await stubApi(page, {
    onTriage: (route) => {
      triageCalls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    },
  });
  await page.goto('/?view=triage', { waitUntil: 'load' });
  await expect(page.locator('#triageView')).toBeVisible({ timeout: 20_000 });

  await page.locator('#t-runBtn').click();
  await expect(page.locator('#t-result')).toContainText('Pick a machine first.');
  expect(triageCalls).toBe(0);
});

test('changing the machine clears a stale result instead of leaving it looking current', async ({
  page,
}) => {
  await seedInventory(page);
  await stubApi(page, {
    onTriage: (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          optimizeFor: 'both',
          results: [
            {
              name: 'Firefox',
              currentVersion: '100.0',
              latestVersion: '100.1',
              versionBump: 'patch',
              cve: null,
              order: 1,
              reasoning: 'r',
            },
          ],
        }),
      }),
  });
  await page.goto('/?view=triage', { waitUntil: 'load' });
  await expect(page.locator('#triageView')).toBeVisible({ timeout: 20_000 });

  await page.locator('#t-stackSelect').selectOption('work-laptop');
  await page.locator('#t-runBtn').click();
  await expect(page.locator('#t-result table.a-drift')).toBeVisible();

  await page.locator('#t-stackSelect').selectOption('home-pc');
  await expect(page.locator('#t-result')).toContainText('Pick a machine, then click Run Triage.');
  await expect(page.locator('#t-result table.a-drift')).toHaveCount(0);
});

test('changing "Optimize for" while a result is showing re-runs triage with the new weighting', async ({
  page,
}) => {
  const bothResponse = {
    optimizeFor: 'both',
    results: [
      {
        name: 'Firefox',
        currentVersion: '100.0',
        latestVersion: '100.1',
        versionBump: 'patch',
        cve: null,
        order: 1,
        reasoning: 'Both-mode reasoning.',
      },
    ],
  };
  const securityResponse = {
    optimizeFor: 'security',
    results: [
      {
        name: 'Firefox',
        currentVersion: '100.0',
        latestVersion: '100.1',
        versionBump: 'patch',
        cve: null,
        order: 1,
        reasoning: 'Security-mode reasoning.',
      },
    ],
  };
  let callCount = 0;
  await seedInventory(page);
  await stubApi(page, {
    onTriage: (route) => {
      callCount += 1;
      const body = callCount === 1 ? bothResponse : securityResponse;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    },
  });
  await page.goto('/?view=triage', { waitUntil: 'load' });
  await expect(page.locator('#triageView')).toBeVisible({ timeout: 20_000 });

  await page.locator('#t-stackSelect').selectOption('work-laptop');
  await page.locator('#t-runBtn').click();
  await expect(page.locator('#t-result')).toContainText('Both-mode reasoning.');

  await page.locator('#t-optimize').selectOption('security');
  await expect(page.locator('#t-result')).toContainText('Security-mode reasoning.');
  expect(callCount).toBe(2);
});

test('a visible spinner shows while a Triage request is in flight', async ({ page }) => {
  await seedInventory(page);
  await stubApi(page, {
    onTriage: async (route) => {
      await new Promise((r) => setTimeout(r, 300)); // hold the response open briefly
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          optimizeFor: 'both',
          results: [
            {
              name: 'Firefox',
              currentVersion: '100.0',
              latestVersion: '100.1',
              versionBump: 'patch',
              cve: null,
              order: 1,
              reasoning: 'r',
            },
          ],
        }),
      });
    },
  });
  await page.goto('/?view=triage', { waitUntil: 'load' });
  await expect(page.locator('#triageView')).toBeVisible({ timeout: 20_000 });

  await page.locator('#t-stackSelect').selectOption('work-laptop');
  await page.locator('#t-runBtn').click();
  // toBeVisible() checks real computed visibility (including an ancestor
  // display:none), not just the element's own inline style.
  await expect(page.locator('#t-loader')).toBeVisible();
  await expect(page.locator('#t-result table.a-drift')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('#t-loader')).toBeHidden();
});

test('a failed Triage request shows an error, and Run Triage can be clicked again to retry', async ({
  page,
}) => {
  let callCount = 0;
  await seedInventory(page);
  await stubApi(page, {
    onTriage: (route) => {
      callCount += 1;
      if (callCount === 1) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'boom' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          optimizeFor: 'both',
          results: [
            {
              name: 'Firefox',
              currentVersion: '100.0',
              latestVersion: '100.1',
              versionBump: 'patch',
              cve: null,
              order: 1,
              reasoning: 'r',
            },
          ],
        }),
      });
    },
  });
  await page.goto('/?view=triage', { waitUntil: 'load' });
  await expect(page.locator('#triageView')).toBeVisible({ timeout: 20_000 });

  await page.locator('#t-stackSelect').selectOption('work-laptop');
  await page.locator('#t-runBtn').click();
  await expect(page.locator('#t-result')).toContainText('Could not run triage');

  // The Run Triage button lives permanently in the view's header, not
  // recreated per state - no separate "Retry" button needed.
  await page.locator('#t-runBtn').click();
  await expect(page.locator('#t-result table.a-drift')).toBeVisible();
  expect(callCount).toBe(2);
});

test('the Triage nav link opens and closes the view', async ({ page }) => {
  await seedInventory(page);
  await stubApi(page);
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#askForm')).toBeVisible({ timeout: 20_000 });

  // #navLinksDetails (the "Menu" group) is collapsed by default - open
  // it first, same as a real visitor would, before its child links are
  // visible/clickable.
  await page.locator('#navLinksDetails summary').click();
  await page.locator('#triageLink').click();
  await expect(page.locator('#triageView')).toBeVisible();
  await expect(page.locator('#triageLink')).toHaveClass(/nav-active/);

  await page.locator('#triageLink').click();
  await expect(page.locator('#triageView')).toBeHidden();
  await expect(page.locator('#triageLink')).not.toHaveClass(/nav-active/);
});

test('the Home page Triage shortcut only appears when signed in', async ({ page }) => {
  await stubApi(page);
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#askForm')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#askTriageCallout')).toBeHidden();
});

test('signed in, the Home page Triage shortcut is visible and opens Triage', async ({ page }) => {
  await seedInventory(page);
  await page.addInitScript(() => {
    localStorage.setItem('rt_token', 't');
    localStorage.setItem(
      'rt_user',
      JSON.stringify({ id: '1', email: 'a@example.com', name: 'A', role: 'member', orgs: [] }),
    );
  });
  await stubApi(page, {
    onTriage: (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ optimizeFor: 'both', results: [] }),
      }),
  });
  await page.route(/\/api\/users\/me/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '1',
        email: 'a@example.com',
        role: 'member',
        inventory: INVENTORY,
      }),
    }),
  );
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#askForm')).toBeVisible({ timeout: 20_000 });

  await expect(page.locator('#askTriageCallout')).toBeVisible();
  await page.locator('#askTriageCalloutLink').click();
  await expect(page.locator('#triageView')).toBeVisible();
});
