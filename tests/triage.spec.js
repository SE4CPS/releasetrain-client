const { test, expect } = require('@playwright/test');

/*
 * Update Triage (Arch view's 4th mode, next to Diagram/Table/Flowchart):
 * "here are my current installed software ... how would you recommend
 * updating them in which order? with reasoning", later "optimized by
 * stability, security, or both." Clicking Triage POSTs the currently
 * loaded component list to POST /api/ask/triage and renders the sorted,
 * reasoned result - see aRunTriage/aRenderTriageResult in arch.js.
 */

async function stubApi(page, triageResponse) {
  await page.route(/\/api\//, (route) => {
    const url = route.request().url();
    if (/\/ask\/triage$/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(triageResponse),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

test('clicking Triage sends the loaded components and renders a sorted, reasoned table', async ({
  page,
}) => {
  const triageResponse = {
    optimizeFor: 'both',
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    results: [
      {
        name: 'Firefox',
        currentVersion: '100.0',
        latestVersion: '100.1',
        versionBump: 'patch',
        componentRiskType: 'Browser',
        cve: null,
        order: 1,
        reasoning: 'Low-risk patch, safe to apply first.',
      },
      {
        name: 'OpenSSL',
        currentVersion: '1.1.0',
        latestVersion: '3.0.0',
        versionBump: 'major',
        componentRiskType: 'OS/Hypervisor (foundational, higher blast radius if it breaks)',
        cve: { id: 'CVE-2023-1234', summary: 'Buffer overflow' },
        order: 2,
        reasoning: 'Known CVE, but a major bump on a foundational component needs staged testing.',
      },
    ],
  };
  await stubApi(page, triageResponse);
  await page.goto('/?view=arch', { waitUntil: 'load' });
  await expect(page.locator('#archView')).toBeVisible({ timeout: 20_000 });

  // Load the two components into A_VERSIONS the same shape aApplyInventory
  // produces, without going through a real inventory/search round trip.
  // aShowResult() is what a real load (aLoadAndRender/aLoadUpdatedToday)
  // calls to hide the "Add your own components to begin" empty state -
  // aSetMode() deliberately no-ops while that empty state is still
  // showing (see its own "empty state stays put" guard), so this has to
  // be called too, not just setting A_VERSIONS alone.
  await page.evaluate(() => {
    A_VERSIONS = [
      {
        name: 'Firefox',
        currentVersion: { versionNumber: '100.0' },
        latestVersion: { versionNumber: '100.1' },
      },
      {
        name: 'OpenSSL',
        currentVersion: { versionNumber: '1.1.0' },
        latestVersion: { versionNumber: '3.0.0' },
      },
    ];
    aShowResult();
  });

  const triageBtn = page.locator('#a-viewTriage');
  await expect(triageBtn).toBeVisible();
  const [triageRequest] = await Promise.all([
    page.waitForRequest((req) => /\/ask\/triage$/.test(req.url()) && req.method() === 'POST'),
    triageBtn.click(),
  ]);
  const sentBody = JSON.parse(triageRequest.postData());
  expect(sentBody.optimizeFor).toBe('both');
  expect(sentBody.components).toEqual([
    { name: 'Firefox', version: '100.0' },
    { name: 'OpenSSL', version: '1.1.0' },
  ]);

  const triagePanel = page.locator('#a-triage');
  await expect(triagePanel).toBeVisible();
  await expect(triagePanel.locator('table.a-drift')).toBeVisible();
  const rows = triagePanel.locator('table.a-drift tbody tr');
  await expect(rows).toHaveCount(2);
  // Order 1 (Firefox) renders before order 2 (OpenSSL), matching the
  // server's own already-sorted response, not re-sorted client-side.
  await expect(rows.nth(0)).toContainText('Firefox');
  await expect(rows.nth(0)).toContainText('Low-risk patch, safe to apply first.');
  await expect(rows.nth(1)).toContainText('OpenSSL');
  await expect(rows.nth(1)).toContainText('CVE-2023-1234');
  await expect(rows.nth(1)).toContainText('needs staged testing');
});

test('changing "Optimize for" while a result is showing re-runs triage with the new weighting', async ({
  page,
}) => {
  const bothResponse = {
    optimizeFor: 'both',
    results: [
      {
        name: 'A',
        currentVersion: '1.0',
        latestVersion: '1.1',
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
        name: 'A',
        currentVersion: '1.0',
        latestVersion: '1.1',
        versionBump: 'patch',
        cve: null,
        order: 1,
        reasoning: 'Security-mode reasoning.',
      },
    ],
  };
  let callCount = 0;
  await page.route(/\/api\//, (route) => {
    const url = route.request().url();
    if (/\/ask\/triage$/.test(url)) {
      callCount += 1;
      const body = callCount === 1 ? bothResponse : securityResponse;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/?view=arch', { waitUntil: 'load' });
  await expect(page.locator('#archView')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    A_VERSIONS = [
      {
        name: 'A',
        currentVersion: { versionNumber: '1.0' },
        latestVersion: { versionNumber: '1.1' },
      },
    ];
    aShowResult();
  });

  await page.locator('#a-viewTriage').click();
  await expect(page.locator('#a-triage')).toBeVisible();
  await expect(page.locator('#a-triage')).toContainText('Both-mode reasoning.');

  await page.locator('#a-triageOptimize').selectOption('security');
  await expect(page.locator('#a-triage')).toContainText('Security-mode reasoning.');
  expect(callCount).toBe(2);
});
